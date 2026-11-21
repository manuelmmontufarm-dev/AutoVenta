/**
 * Fuente «archivo»: el catálogo y las facturas suben como Excel/CSV en el panel.
 *
 * Es la fuente de Mundillantas: Fénix corre en un servidor local sin API y
 * Jenny exporta el inventario a Excel (ella lo propuso, pitch del 4-nov,
 * 1:08:45). El archivo se normaliza UNA vez al subirlo, con el mapeo de
 * columnas de `catalogo_mapeo`, y queda guardado en `settings.catalogo_archivo`:
 * el bot lo usa sin reinicio (syncCatalog corre al importar) y lo recupera al
 * arrancar. Cambiar el mapeo aplica al PRÓXIMO archivo que se suba.
 *
 * Las facturas suben igual (`facturas_mapeo`) pero viven en su tabla
 * (`facturas_importadas`, migración 031): son datos de clientes, no un ajuste.
 */
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import * as XLS from "xlsx";
import { z } from "zod";
import { sql } from "../../db/client.js";
import { negocio } from "../../negocio/index.js";
import { politica } from "../../negocio/politica.js";
import type { AroProducto } from "../../domain/aroProducto.js";
import { extractCatalogSizeLabel, inferCatalogDesign, type CatalogItem } from "../../domain/catalog.js";
import { resolveCatalogMedia, resolveCatalogMediaPorNombre, fotoDeReserva } from "../../domain/catalogMedia.js";
import { getCell, normalizarFilaDeCatalogo, type FilaCruda } from "./sheets.js";
import { LLANTA, tel9 } from "./contifico.js";
import type {
  FacturaVenta,
  FuenteDeCatalogo,
  FuenteDeFacturas,
  LecturaDeFacturas,
  ReporteDeCatalogo,
} from "./tipos.js";

// ── Mapeos (claves de `settings`, SQL propio como anunciosActivos) ───────────

export const CatalogoMapeoSchema = z.object({
  columnas: z.object({
    medida: z.string().min(1),
    marca: z.string().min(1),
    diseno: z.string().min(1),
    codigo: z.string().min(1),
    nombre: z.string().min(1),
    precio: z.string().min(1),
    precioLista: z.string().optional(),
    precioMinimo: z.string().optional(),
    /**
     * Otra lista del mismo archivo que el precio nunca baja (Fénix: «precio d»).
     * Si el precio sale MENOR, es un error de tipeo en el sistema (A = 17,80 con
     * D = 138) y la fila se descarta con su motivo en vez de cotizarse.
     */
    precioControl: z.string().optional(),
    /** Precio con tarjeta de crédito y en efectivo (Fénix: B y C). Solo para la pregunta de pago. */
    precioTarjeta: z.string().optional(),
    precioEfectivo: z.string().optional(),
    stock: z.string().min(1),
    foto: z.string().optional(),
    tipo: z.string().optional(),
    /** Columnas de stock por local; en esta etapa se SUMAN en `stock`. */
    stockPorLocal: z.record(z.string(), z.string()).optional(),
  }),
  /** Si el Excel ya trae el precio con IVA. Si no, se suma el del perfil UNA vez. */
  precioIncluyeIva: z.boolean(),
  /** Qué filas son aros: una columna y el patrón que las marca. Null = sin aros. */
  filasDeAros: z.object({ columna: z.string().min(1), patron: z.string().min(1) }).nullable(),
});
export type CatalogoMapeo = z.infer<typeof CatalogoMapeoSchema>;

/**
 * El reporte «Inventario de Articulos» de Fénix tal cual lo exporta Jenny
 * (Excel del 6-nov-2026): todo el producto va en «articulo» (marca, medida y
 * diseño salen de ahí), cuatro listas A–D, «existencia» = total de los locales.
 * Precio A = el del público, ya con IVA (los precios son enteros × 1,15 o
 * terminan en ,99). Sin `precioMinimo`: no se muestra descuento hasta que el
 * cliente diga cuál lista es su piso. Precio D es el control de tipeo. Se
 * cambia en Ajustes → Catálogo, sin deploy.
 */
export const MAPEO_CATALOGO_DEFECTO: CatalogoMapeo = {
  columnas: {
    medida: "articulo",
    marca: "articulo",
    diseno: "articulo",
    codigo: "código",
    nombre: "articulo",
    precio: "precio a",
    precioControl: "precio d",
    // Jenny, 18-nov: B = con tarjeta de crédito, C = efectivo (y transferencia).
    precioTarjeta: "precio b",
    precioEfectivo: "precio c",
    stock: "existencia",
  },
  precioIncluyeIva: true,
  filasDeAros: { columna: "categoria", patron: "^aro|^rin\\b" },
};

export const FacturasMapeoSchema = z.object({
  columnas: z.object({
    documento: z.string().min(1),
    fecha: z.string().min(1),
    hora: z.string().optional(),
    total: z.string().min(1),
    subtotal: z.string().optional(),
    cliente: z.string().optional(),
    telefono: z.string().min(1),
    producto: z.string().min(1),
    cantidad: z.string().optional(),
    precio: z.string().optional(),
    local: z.string().optional(),
  }),
});
export type FacturasMapeo = z.infer<typeof FacturasMapeoSchema>;

export const MAPEO_FACTURAS_DEFECTO: FacturasMapeo = {
  columnas: {
    documento: "num factura",
    fecha: "fecha",
    hora: "hora",
    total: "total",
    subtotal: "subtotal",
    cliente: "cliente",
    telefono: "telefono",
    producto: "producto",
    cantidad: "cantidad",
    precio: "precio",
    local: "local",
  },
};

async function leerSetting(key: string): Promise<unknown> {
  const [row] = await sql<{ value: unknown }[]>`select value from settings where key = ${key}`;
  return row?.value ?? null;
}

async function guardarSetting(key: string, value: unknown): Promise<void> {
  await sql`
    insert into settings (key, value) values (${key}, ${sql.json(value as never)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function leerMapeoCatalogo(): Promise<CatalogoMapeo> {
  const guardado = CatalogoMapeoSchema.safeParse(await leerSetting("catalogo_mapeo"));
  return guardado.success ? guardado.data : MAPEO_CATALOGO_DEFECTO;
}

/** Valida (lanza con el mensaje de zod) y guarda. Aplica al PRÓXIMO archivo. */
export async function guardarMapeoCatalogo(input: unknown): Promise<CatalogoMapeo> {
  const mapeo = CatalogoMapeoSchema.parse(input);
  await guardarSetting("catalogo_mapeo", mapeo);
  return mapeo;
}

export async function leerMapeoFacturas(): Promise<FacturasMapeo> {
  const guardado = FacturasMapeoSchema.safeParse(await leerSetting("facturas_mapeo"));
  return guardado.success ? guardado.data : MAPEO_FACTURAS_DEFECTO;
}

export async function guardarMapeoFacturas(input: unknown): Promise<FacturasMapeo> {
  const mapeo = FacturasMapeoSchema.parse(input);
  await guardarSetting("facturas_mapeo", mapeo);
  return mapeo;
}

// ── Leer el archivo crudo (XLS, XLSX o CSV) a filas con encabezado ──────────

/**
 * El nombre de una columna como se compara: sin tildes, sin mayúsculas y con
 * los espacios de más fuera. «  ARTÍCULO », «Articulo» y «articulo» son la
 * misma columna; el mapeo y el encabezado pasan los dos por acá.
 */
export const claveDeColumna = (t: string): string =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Separa una línea CSV respetando comillas. */
function camposCsv(linea: string, sep: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (enComillas) {
      if (c === '"' && linea[i + 1] === '"') { actual += '"'; i += 1; }
      else if (c === '"') enComillas = false;
      else actual += c;
    } else if (c === '"') enComillas = true;
    else if (c === sep) { campos.push(actual); actual = ""; }
    else actual += c;
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

/**
 * Texto del archivo: UTF-8 si lo es; si no, Latin-1 (el CSV que guarda Excel en
 * Windows), para que «Código» no llegue como «C�digo».
 */
function textoDelArchivo(cuerpo: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(cuerpo).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("latin1").decode(cuerpo);
  }
}

/**
 * CSV a matriz, con las líneas en blanco en su lugar (los números de fila de
 * los motivos son los que se ven al abrirlo). El separador es el que más
 * columnas da en las primeras líneas: arriba puede haber un título sin comas.
 */
function matrizDeCsv(texto: string): string[][] {
  const lineas = texto.split(/\r?\n/);
  while (lineas.length && lineas.at(-1)!.trim() === "") lineas.pop();
  const muestra = lineas.slice(0, 40);
  const sep = [",", ";", "\t"]
    .map((s) => ({ s, n: Math.max(0, ...muestra.map((l) => camposCsv(l, s).length)) }))
    .sort((a, b) => b.n - a.n)[0].s;
  return lineas.map((l) => (l.trim() === "" ? [] : camposCsv(l, sep)));
}

/** Número de fila real en el Excel (con membrete y todo), para los motivos. */
const FILA = "__fila";

/**
 * Dónde está el encabezado. Con las columnas que espera el mapeo, la fila (de
 * las primeras 60) que más de ellas nombra; así entra un CSV o un Excel con
 * títulos encima aunque no tenga una columna «Código». Sin mapeo (o si ninguna
 * fila nombra al menos dos), la primera fila con una celda «código», y si
 * tampoco hay, la primera fila con algo.
 */
function buscarEncabezado(matriz: string[][], esperadas: string[]): { inicio: number; puntaje: number } {
  const buscadas = new Set(esperadas.map(claveDeColumna).filter(Boolean));
  let mejor = { inicio: -1, puntaje: 0 };
  if (buscadas.size) {
    for (let i = 0; i < Math.min(matriz.length, 60); i += 1) {
      const celdas = new Set((matriz[i] ?? []).map(claveDeColumna));
      const puntaje = [...buscadas].filter((b) => celdas.has(b)).length;
      if (puntaje > mejor.puntaje) mejor = { inicio: i, puntaje };
    }
    if (mejor.puntaje >= Math.min(2, buscadas.size)) return mejor;
  }
  let inicio = matriz.findIndex((fila) => (fila ?? []).some((c) => claveDeColumna(c) === "codigo"));
  if (inicio < 0) inicio = matriz.findIndex((fila) => (fila ?? []).some((c) => c.trim() !== ""));
  return { inicio, puntaje: inicio < 0 ? 0 : mejor.inicio === inicio ? mejor.puntaje : 0 };
}

/** «06/11/2026 02:14:11 PM» (hora de Ecuador, UTC−5) → ISO. */
function fechaDeTexto(texto: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s*m\.?)?)?/i.exec(texto);
  if (!m) return null;
  let hora = Number(m[4] ?? 0);
  const ampm = (m[7] ?? "").toLowerCase().replace(/[.\s]/g, "");
  if (ampm === "pm" && hora < 12) hora += 12;
  if (ampm === "am" && hora === 12) hora = 0;
  const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const utc = Date.UTC(anio, mes - 1, dia, hora + 5, Number(m[5] ?? 0), Number(m[6] ?? 0));
  return Number.isFinite(utc) ? new Date(utc).toISOString() : null;
}

/** La «Fecha Reporte:» del membrete de Fénix, si el archivo la trae. */
function fechaDelMembrete(filas: string[][]): string | null {
  for (const fila of filas) {
    for (const [i, celda] of (fila ?? []).entries()) {
      if (!/^fecha( de)? (del )?reporte\b/.test(claveDeColumna(celda))) continue;
      const enLaCelda = fechaDeTexto(celda);
      if (enLaCelda) return enLaCelda;
      const siguiente = fila.slice(i + 1).find((c) => c.trim() !== "");
      if (siguiente) return fechaDeTexto(siguiente);
    }
  }
  return null;
}

interface Tabla {
  filas: Record<string, string>[];
  /** El encabezado tal como se ve en el archivo (para decir qué columnas hay). */
  encabezado: string[];
  /** Cuántas columnas del mapeo nombra el encabezado (para elegir hoja). */
  puntaje: number;
  fechaReporte: string | null;
}

/**
 * Una hoja como matriz de texto → filas con encabezado (ver `buscarEncabezado`).
 * Así entra tal cual el reporte «Inventario de Articulos» de Fénix: 14 filas
 * de membrete antes del encabezado, filas «Categoria: …» / «Subcategoria: …»
 * que valen para lo que sigue (se copian a las columnas `categoria` y
 * `subcategoria` de cada fila) y filas «Total …» que no son productos.
 */
function tablaDeMatriz(matriz: string[][], esperadas: string[] = []): Tabla {
  const { inicio, puntaje } = buscarEncabezado(matriz, esperadas);
  if (inicio < 0) return { filas: [], encabezado: [], puntaje: 0, fechaReporte: null };
  const encabezadoVisto = (matriz[inicio] ?? []).map((c) => c.trim());
  const encabezado = encabezadoVisto.map((c) => c.toLowerCase());
  const contexto: Record<string, string> = {};
  const filas: Record<string, string>[] = [];
  for (const [k, cruda] of matriz.slice(inicio + 1).entries()) {
    const celdas = Array.from(cruda ?? [], (c) => (c ?? "").trim());
    const llenas = celdas.filter(Boolean);
    if (!llenas.length) continue;
    const seccion = (celdas[0] ?? "").match(/^(sub)?categor[ií]a\s*:\s*(.+)$/i);
    if (seccion && llenas.length === 1) {
      contexto[seccion[1] ? "subcategoria" : "categoria"] = seccion[2].trim();
      if (!seccion[1]) delete contexto.subcategoria;
      continue;
    }
    // Filas de totales: «Total SubCategoria: …», «TOTAL GENERAL» (aunque el
    // rótulo esté en otra columna) y el total general sin rótulo de Fénix.
    if (/^total(es)?\b/i.test(llenas[0])) continue;
    if (!celdas[0] && llenas.every((c) => /^-?[\d.,]+$/.test(c))) continue;
    const fila: Record<string, string> = { ...contexto, [FILA]: String(inicio + k + 2) };
    encabezado.forEach((col, i) => {
      if (col) fila[col] = celdas[i] ?? "";
    });
    filas.push(fila);
  }
  return { filas, encabezado: encabezadoVisto.filter(Boolean), puntaje, fechaReporte: fechaDelMembrete(matriz.slice(0, inicio)) };
}

export function filasDeMatriz(matriz: string[][]): Record<string, string>[] {
  return tablaDeMatriz(matriz).filas;
}

type HojaCruda = { nombre: string | null; matriz: string[][] };

async function hojasDeXlsx(cuerpo: Buffer): Promise<HojaCruda[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(cuerpo as unknown as ArrayBuffer);
  return libro.worksheets.map((hoja) => {
    const matriz: string[][] = [];
    hoja.eachRow({ includeEmpty: true }, (row, numero) => {
      const fila: string[] = [];
      row.eachCell({ includeEmpty: true }, (celda, n) => {
        fila[n - 1] = String(celda.text ?? "");
      });
      matriz[numero - 1] = Array.from(fila, (c) => c ?? "");
    });
    return { nombre: hoja.name, matriz: Array.from(matriz, (f) => f ?? []) };
  });
}

/** Excel 97-2003 (.xls, BIFF) —el formato en que Fénix exporta— o una tabla HTML. */
function hojasDeSheetJs(cuerpo: Buffer): HojaCruda[] {
  const libro = XLS.read(cuerpo, { type: "buffer", dense: true });
  return libro.SheetNames.map((nombre) => {
    const hoja = libro.Sheets[nombre];
    const matriz = XLS.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: false, defval: "", blankrows: true });
    // La hoja puede empezar más abajo de la fila 1: se rellena para que los
    // números de fila de los motivos sean los que Jenny ve en el Excel.
    const desde = hoja["!ref"] ? XLS.utils.decode_range(hoja["!ref"]).s.r : 0;
    return {
      nombre,
      matriz: [...Array.from({ length: desde }, () => [] as string[]), ...matriz.map((fila) => fila.map((c) => String(c ?? "")))],
    };
  });
}

/** Firma OLE2 (D0 CF 11 E0): un .xls de verdad, aunque se llame .xlsx. */
const esXlsViejo = (cuerpo: Buffer) =>
  cuerpo.length > 3 && cuerpo[0] === 0xd0 && cuerpo[1] === 0xcf && cuerpo[2] === 0x11 && cuerpo[3] === 0xe0;

/** Firma ZIP (PK): un .xlsx, aunque se llame .xls. */
const esZip = (cuerpo: Buffer) => cuerpo.length > 1 && cuerpo[0] === 0x50 && cuerpo[1] === 0x4b;

/** Todas las hojas del archivo, decidido por el CONTENIDO y no por el nombre. */
async function hojasDelArchivo(cuerpo: Buffer): Promise<HojaCruda[]> {
  if (esXlsViejo(cuerpo)) return hojasDeSheetJs(cuerpo);
  if (esZip(cuerpo)) return hojasDeXlsx(cuerpo);
  const texto = textoDelArchivo(cuerpo);
  // Algunos sistemas «exportan a Excel» una tabla HTML con extensión .xls.
  if (/^\s*<(!doctype|html|table)/i.test(texto)) return hojasDeSheetJs(Buffer.from(texto));
  return [{ nombre: null, matriz: matrizDeCsv(texto) }];
}

/**
 * La tabla del archivo y la hoja de donde salió. Con varias hojas gana la que
 * más columnas del mapeo nombra en su encabezado; a igualdad, la primera.
 */
async function tablaDelArchivo(cuerpo: Buffer, esperadas: string[]): Promise<Tabla & { hoja: string | null }> {
  const hojas = await hojasDelArchivo(cuerpo);
  let mejor: (Tabla & { hoja: string | null }) | null = null;
  for (const hoja of hojas) {
    const tabla = tablaDeMatriz(hoja.matriz, esperadas);
    if (!mejor || tabla.puntaje > mejor.puntaje || (!mejor.filas.length && tabla.filas.length)) {
      mejor = { ...tabla, hoja: hoja.nombre };
    }
  }
  return mejor ?? { filas: [], encabezado: [], puntaje: 0, fechaReporte: null, hoja: null };
}

export async function filasDelArchivo(
  _nombre: string,
  cuerpo: Buffer,
  esperadas: string[] = [],
): Promise<Record<string, string>[]> {
  return (await tablaDelArchivo(cuerpo, esperadas)).filas;
}

// ── Catálogo subido (clave `catalogo_archivo`) ───────────────────────────────

interface FilaGuardada {
  cruda: FilaCruda;
  precios: {
    conIva: number; listaConIva: number; minimoConIva: number; taxRate: number;
    /** Opcionales: un catálogo subido antes del 18-nov-2026 no los tiene. */
    tarjetaConIva?: number; efectivoConIva?: number;
  };
}

export interface CatalogoArchivo {
  nombreArchivo: string;
  subidoEn: string;
  filas: FilaGuardada[];
  aros: AroProducto[];
  descartadas: { fila: number; motivo: string }[];
  /** La «Fecha Reporte» del membrete de Fénix; null si el archivo no la trae. */
  fechaReporte?: string | null;
  /** sha256 del archivo + el mapeo con que se leyó: el mismo archivo dos veces. */
  huella?: string;
  /** De qué hoja salió (null en un CSV). */
  hoja?: string | null;
}

/**
 * Un número del archivo, venga como venga escrito: «139.99», «139,99»,
 * «1.177,99», «1,177.99», «1 177,99», «$ 139.99», « 11,00 ». Con los dos
 * signos, el ÚLTIMO es el decimal. Con uno solo, es de miles si separa grupos
 * de tres después de un entero que no es 0 («1.120», «1,120», «1.234.567»);
 * si no, es el decimal («47,15», «0.125»). Lo que no es un número da null.
 */
export function numeroDelArchivo(s: string): number | null {
  let t = String(s ?? "").replace(/[$\s\u00a0]/g, "");
  if (!t) return null;
  const negativo = t.startsWith("-");
  if (negativo) t = t.slice(1);
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const ultimoPunto = t.lastIndexOf(".");
  const ultimaComa = t.lastIndexOf(",");
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    const decimal = ultimoPunto > ultimaComa ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    t = t.split(miles).join("");
    if (t.split(decimal).length > 2) return null;
    t = t.replace(decimal, ".");
  } else if (ultimoPunto >= 0 || ultimaComa >= 0) {
    const signo = ultimoPunto >= 0 ? "." : ",";
    const partes = t.split(signo);
    const deMiles = partes.length > 1 && /^[1-9]\d{0,2}$/.test(partes[0]) && partes.slice(1).every((p) => /^\d{3}$/.test(p));
    if (deMiles) t = partes.join("");
    else if (partes.length === 2) t = partes.join(".");
    else return null;
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return negativo && n !== 0 ? -n : n;
}

const numero = numeroDelArchivo;

/** Un precio por forma de pago vale si existe, no supera el precio y no baja del mayorista. */
const precioPorPagoValido = (valor: number | null, precio: number, control: number | null): boolean =>
  valor !== null && valor > 0 && valor <= precio && (control === null || control <= 0 || valor >= control);

/** Suma el IVA del perfil UNA sola vez, solo si el archivo venía sin él. */
const conIvaDelPerfil = (valor: number, incluyeIva: boolean): number =>
  Math.round(valor * (incluyeIva ? 1 : 1 + negocio.iva) * 100) / 100;

function filaDeAro(
  data: Record<string, string>,
  mapeo: CatalogoMapeo,
  filaNumero: number,
  incluyeIva: boolean,
): { aro: AroProducto | null; motivo: string | null } {
  const col = mapeo.columnas;
  const texto = `${data[col.medida] ?? ""} ${data[col.nombre] ?? ""} ${data[col.diseno] ?? ""}`;
  const diametro = Number(
    (texto.match(/\b(?:aros?|rin(?:es)?|r)\s*(1[2-9]|2[0-4])\b/i) ?? texto.match(/\b(1[2-9]|2[0-4])\b/) ?? [])[1],
  );
  if (!Number.isFinite(diametro)) {
    return { aro: null, motivo: "aro sin diámetro reconocible (12–24)" };
  }
  const precio = numero(data[col.precio] ?? "");
  if (precio === null || precio <= 0) return { aro: null, motivo: "precio inválido" };
  const pernos = Number((texto.match(/\b([4-8])\s*(?:x\s*\d{2,3}|pernos?|huecos?)\b/i) ?? [])[1]);
  const stock = sumarStock(data, mapeo);
  const codigo = (data[col.codigo] ?? "").trim() || `ARO${filaNumero}`;
  return {
    motivo: null,
    aro: {
      id: codigo,
      codigo,
      nombre: (data[col.nombre] ?? "").trim() || `Aro ${diametro}`,
      marca: (data[col.marca] ?? "").trim(),
      diametro,
      ...(Number.isFinite(pernos) ? { pernos } : {}),
      precio: conIvaDelPerfil(precio, incluyeIva),
      stock,
      imageUrl: col.foto ? (data[col.foto] ?? "").trim() || null : null,
    },
  };
}

function sumarStock(data: Record<string, string>, mapeo: CatalogoMapeo): number {
  const porLocal = mapeo.columnas.stockPorLocal;
  if (porLocal && Object.keys(porLocal).length) {
    return Object.values(porLocal)
      .map((columna) => numero(data[columna.toLowerCase()] ?? "") ?? 0)
      .reduce((a, b) => a + b, 0);
  }
  // Fénix deja existencias negativas (vendido sin ingresar): para el bot es 0.
  return Math.max(0, numero(data[mapeo.columnas.stock] ?? "") ?? 0);
}

/**
 * Fénix escribe la convencional de camión sin punto: «700/15», «LT700R15»,
 * «825/16». Solo para el catálogo y solo si el texto no traía otra medida: se
 * reescribe a «7.00R15» para que la lea el mismo lector de siempre. El lector
 * de lo que escribe el cliente no se toca.
 */
function medidaDelArchivo(texto: string): string {
  if (extractCatalogSizeLabel(texto).sizeLabel) return texto;
  // Devuelve solo la medida: en «HAULMAX 7.50R15» la X de la marca parece una
  // flotación para el lector y la medida se perdería.
  const m = texto.match(/(?<![\d.,/])(?:LT)?([5-9]|1[0-2])(\d{2})\s*[/R]\s*(1[2-9]|2[0-4])(?![\d.,])/i);
  return m ? `${m[1]}.${m[2]}R${m[3]}` : texto;
}

/**
 * Cuando el archivo no trae marca ni diseño aparte (Fénix: todo va en
 * «articulo»), el mapeo apunta Marca y Diseño a la misma columna del nombre:
 * la marca es la primera palabra y el diseño lo que queda sin marca ni medida.
 */
function marcaYDiseno(data: Record<string, string>, col: CatalogoMapeo["columnas"]): { marca: string; diseno: string } {
  const nombre = (data[col.nombre] ?? "").trim();
  const marcaCruda = (data[col.marca] ?? "").trim();
  const disenoCrudo = (data[col.diseno] ?? "").trim();
  const marca = marcaCruda && marcaCruda === nombre ? (nombre.split(/\s+/)[0] ?? "") : marcaCruda;
  if (!disenoCrudo || disenoCrudo !== nombre) return { marca, diseno: disenoCrudo };
  // Falken, Kenda y Winrun: el mismo diseño que les da Contífico en Depot, que
  // es la clave de sus fotos en `catalogMedia`.
  if (/^(falken|kenda|winrun)$/i.test(marca)) {
    const { sizeLabel } = extractCatalogSizeLabel(data[col.medida] ?? nombre);
    return { marca, diseno: inferCatalogDesign(nombre, marca, sizeLabel) };
  }
  return { marca, diseno: disenoDelNombre(nombre, marca) || nombre };
}

/**
 * El diseño de un «articulo» de Fénix para el resto de marcas: el nombre sin
 * la marca, sin la medida y sin índices de carga/velocidad ni lonas. No usa
 * `inferCatalogDesign`, que borra los números de la medida en cualquier parte
 * («TOWNHALL 205/55R16 TH161» le quedaba «TH 1»).
 */
export function disenoDelNombre(nombre: string, marca: string): string {
  let t = ` ${nombre.toUpperCase()} `;
  if (marca) t = t.replace(` ${marca.toUpperCase()} `, " ");
  return t
    // la medida con sus prefijos/sufijos: LT245/75R16, 31X10.5R15LT, 155R12C, 700/15, 9.5R17.5
    .replace(/\s(?:LT|P)?\d{2,3}(?:[.,]\d{1,2})?(?:\s*[X/]\s*\d{1,2}(?:[.,]\d{1,2})?)?\s*(?:Z?R|\/|-)\s*\d{2}(?:[.,]5)?(?:LT|C|XL)?(?=[\s-])/g, " ")
    .replace(/\b\d{2,3}(?:\/\d{2,3})?\s?[A-Z]{1,2}(?:XL)?\b(?=[\s/]|$)/g, (m) => (/^\d{2,3}(?:\/\d{2,3})?\s?(?:[A-Z]|[HVWYZ]XL|XL)$/.test(m) ? " " : m))
    .replace(/\b\d{2,3}\/\d{2,3}\b/g, " ")
    .replace(/\b\d{1,2}\s?(?:PR|L|LONAS)\b/g, " ")
    .replace(/\b(?:TL|BSW|ESR|SET|MADE IN INDIA|CON TUBO|SOLA|XL)\b/g, " ")
    .replace(/[-/]+(?=\s)|(?<=\s)[-/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** El mapeo con cada nombre de columna como se compara (`claveDeColumna`). */
function mapeoComparable(mapeo: CatalogoMapeo): CatalogoMapeo {
  const columnas = Object.fromEntries(
    Object.entries(mapeo.columnas).map(([campo, valor]) => [
      campo,
      typeof valor === "string"
        ? claveDeColumna(valor)
        : valor && typeof valor === "object"
          ? Object.fromEntries(Object.entries(valor).map(([local, c]) => [local, claveDeColumna(c)]))
          : valor,
    ]),
  ) as CatalogoMapeo["columnas"];
  return {
    ...mapeo,
    columnas,
    filasDeAros: mapeo.filasDeAros ? { ...mapeo.filasDeAros, columna: claveDeColumna(mapeo.filasDeAros.columna) } : null,
  };
}

/** La fila con cada encabezado como se compara (la marca de fila queda igual). */
const filaComparable = (fila: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(fila).map(([k, v]) => [k === FILA ? k : claveDeColumna(k), v]));

export function normalizarCatalogoSubido(
  nombre: string,
  filasCrudas: Record<string, string>[],
  mapeoCrudo: CatalogoMapeo,
  ahora = new Date(),
): CatalogoArchivo {
  // Mayúsculas, tildes y espacios de más no cambian qué columna es cuál.
  const mapeo = mapeoComparable(mapeoCrudo);
  const filas = filasCrudas.map(filaComparable);
  const col = mapeo.columnas;
  const guardadas: FilaGuardada[] = [];
  const aros: AroProducto[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];
  const esAro = (data: Record<string, string>): boolean => {
    if (mapeo.filasDeAros) {
      const valor = data[mapeo.filasDeAros.columna.toLowerCase()] ?? "";
      try {
        if (new RegExp(mapeo.filasDeAros.patron, "i").test(valor)) return true;
      } catch {
        /* un patrón inválido no tumba la importación: nada es aro */
      }
    }
    if (col.tipo) return /^aros?$|^rin(es)?$/i.test((data[col.tipo] ?? "").trim());
    return false;
  };

  filas.forEach((data, i) => {
    const filaNumero = Number(data[FILA]) || i + 2; // CSV: +1 encabezado, +1 índice desde 1
    if (esAro(data)) {
      const { aro, motivo } = filaDeAro(data, mapeo, filaNumero, mapeo.precioIncluyeIva);
      if (aro) aros.push(aro);
      else descartadas.push({ fila: filaNumero, motivo: motivo ?? "aro inválido" });
      return;
    }
    const precioCrudo = numero(data[col.precio] ?? "");
    const lista = col.precioLista ? numero(data[col.precioLista] ?? "") : null;
    const minimo = col.precioMinimo ? numero(data[col.precioMinimo] ?? "") : null;
    const control = col.precioControl ? numero(data[col.precioControl] ?? "") : null;
    const tarjeta = col.precioTarjeta ? numero(data[col.precioTarjeta] ?? "") : null;
    const efectivo = col.precioEfectivo ? numero(data[col.precioEfectivo] ?? "") : null;
    const { marca, diseno } = marcaYDiseno(data, col);
    const cruda: FilaCruda = {
      medida: medidaDelArchivo((data[col.medida] ?? "").trim()),
      marca,
      diseno,
      codigo: (data[col.codigo] ?? "").trim(),
      nombre: (data[col.nombre] ?? "").trim(),
      precio: String(precioCrudo ?? ""),
      stock: String(sumarStock(data, mapeo)),
      foto: col.foto ? (data[col.foto] ?? "").trim() : "",
      filaNumero,
    };
    if (precioCrudo === null || precioCrudo <= 0) {
      descartadas.push({ fila: filaNumero, motivo: "precio inválido" });
      return;
    }
    // Aro de camión con medio: «235/75R17.5» se leería 235/75R17 —una medida
    // real de camioneta— y se le ofrecería a quien pide esa.
    const medioAro = `${data[col.medida] ?? ""} ${cruda.nombre}`.match(/R\s*(1[79]|2[24])[.,]5\b/i);
    if (medioAro) {
      descartadas.push({ fila: filaNumero, motivo: `aro de camión ${medioAro[1]}.5: el bot todavía no lo cotiza` });
      return;
    }
    if (control !== null && control > 0 && precioCrudo < control) {
      descartadas.push({
        fila: filaNumero,
        motivo: `${cruda.codigo || "sin código"}: ${col.precio} (${precioCrudo}) menor que ${col.precioControl} (${control}), revisar en el sistema`,
      });
      return;
    }
    const conIva = conIvaDelPerfil(precioCrudo, mapeo.precioIncluyeIva);
    const precios = {
      conIva,
      // Sin precio de lista ni mínimo, los dos = precio: sin descuento visible.
      listaConIva: lista !== null ? conIvaDelPerfil(lista, mapeo.precioIncluyeIva) : conIva,
      minimoConIva: minimo !== null ? conIvaDelPerfil(minimo, mapeo.precioIncluyeIva) : conIva,
      taxRate: negocio.iva,
      // Precio con tarjeta y en efectivo, SOLO si vienen los dos y pasan el
      // control: mayor que el precio o menor que el mayorista es tipeo.
      ...(precioPorPagoValido(tarjeta, precioCrudo, control) && precioPorPagoValido(efectivo, precioCrudo, control)
        ? {
            tarjetaConIva: conIvaDelPerfil(tarjeta!, mapeo.precioIncluyeIva),
            efectivoConIva: conIvaDelPerfil(efectivo!, mapeo.precioIncluyeIva),
          }
        : {}),
    };
    const { item, motivo } = normalizarFilaDeCatalogo(cruda, "archivo", precios, politica.precioDeCotizacion);
    if (item) guardadas.push({ cruda, precios });
    else descartadas.push({ fila: filaNumero, motivo: motivo ?? "fila inválida" });
  });

  return {
    nombreArchivo: nombre,
    subidoEn: ahora.toISOString(),
    filas: guardadas,
    aros,
    descartadas,
  };
}

export async function leerCatalogoArchivo(): Promise<CatalogoArchivo | null> {
  const guardado = (await leerSetting("catalogo_archivo")) as CatalogoArchivo | null;
  if (!guardado || !Array.isArray(guardado.filas)) return null;
  return guardado;
}

// ── Leer, decidir y guardar: un archivo malo NUNCA reemplaza al bueno ───────

/** Cómo se le dice a una persona cada campo del mapeo, en orden de importancia. */
const CAMPOS_EN_PALABRAS: Array<[keyof CatalogoMapeo["columnas"], string]> = [
  ["stock", "del stock"],
  ["precio", "del precio de venta"],
  ["codigo", "del código"],
  ["nombre", "de la descripción del artículo"],
  ["medida", "de la medida"],
  ["marca", "de la marca"],
  ["diseno", "del diseño"],
];

/** Las columnas del mapeo que el archivo TIENE que traer (sin ellas no se cotiza). */
function columnasObligatorias(mapeo: CatalogoMapeo): Array<{ columna: string; dicho: string }> {
  const vistas = new Map<string, string>();
  const porLocal = mapeo.columnas.stockPorLocal;
  const conLocales = Boolean(porLocal && Object.keys(porLocal).length);
  for (const [campo, dicho] of CAMPOS_EN_PALABRAS) {
    if (campo === "stock" && conLocales) continue;
    const columna = mapeo.columnas[campo];
    if (typeof columna === "string" && columna.trim() && !vistas.has(claveDeColumna(columna))) {
      vistas.set(claveDeColumna(columna), `${dicho} («${columna.trim()}»)`);
    }
  }
  if (conLocales) {
    for (const [local, columna] of Object.entries(porLocal!)) {
      if (!vistas.has(claveDeColumna(columna))) vistas.set(claveDeColumna(columna), `del stock de ${local} («${columna.trim()}»)`);
    }
  }
  return [...vistas].map(([columna, dicho]) => ({ columna, dicho }));
}

/** Todas las columnas que nombra el mapeo: con ellas se reconoce el encabezado. */
function columnasDelMapeo(mapeo: CatalogoMapeo): string[] {
  const todas: string[] = [];
  for (const valor of Object.values(mapeo.columnas)) {
    if (typeof valor === "string") todas.push(valor);
    else if (valor && typeof valor === "object") todas.push(...Object.values(valor));
  }
  return [...new Set(todas.map(claveDeColumna).filter(Boolean))];
}

export interface LecturaDeInventario {
  catalogo: CatalogoArchivo & { fechaReporte: string | null; huella: string; hoja: string | null };
  /** Una frase por columna obligatoria que no está («No encontré la columna del stock…»). */
  faltantes: string[];
  /** El encabezado tal como venía, para decir qué columnas SÍ hay. */
  columnasVistas: string[];
}

/**
 * Lee el archivo con el mapeo y lo deja listo para decidir. Puro: no toca la
 * base. Elige la hoja y la fila de encabezado, compara los nombres de columna
 * sin tildes ni mayúsculas, lee la fecha del reporte y saca la huella.
 */
export async function leerInventario(
  nombre: string,
  cuerpo: Buffer,
  mapeo: CatalogoMapeo,
  ahora = new Date(),
): Promise<LecturaDeInventario> {
  const tabla = await tablaDelArchivo(cuerpo, columnasDelMapeo(mapeo));
  const hay = new Set(tabla.encabezado.map(claveDeColumna));
  const faltantes = tabla.filas.length
    ? columnasObligatorias(mapeo)
      .filter(({ columna }) => !hay.has(columna))
      .map(({ dicho }) => `No encontré la columna ${dicho} en el archivo.`)
    : [];
  const huella = createHash("sha256").update(cuerpo).update(JSON.stringify(mapeoComparable(mapeo))).digest("hex");
  return {
    catalogo: {
      ...normalizarCatalogoSubido(nombre, tabla.filas, mapeo, ahora),
      fechaReporte: tabla.fechaReporte,
      huella,
      hoja: tabla.hoja,
    },
    faltantes,
    columnasVistas: tabla.encabezado,
  };
}

/**
 * Cuánto puede caer la cantidad de llantas contra la carga anterior sin
 * preguntar: 30 %. Fénix lista TODOS los artículos de la categoría, también
 * los que están en 0, así que de un día a otro la lista casi no cambia (entran
 * o salen unos pocos modelos). Perder un tercio de un día al otro es un reporte
 * filtrado o cortado (una sola categoría, un solo local), no ventas.
 */
export const UMBRAL_CAIDA = 0.3;
/** Las unidades en stock pueden bajar hasta la mitad sin preguntar. */
const UMBRAL_CAIDA_UNIDADES = 0.5;

export type DecisionDeCarga =
  | { tipo: "ok" }
  /** El mismo archivo (y el mismo mapeo) que ya está cargado: no se toca nada. */
  | { tipo: "igual" }
  | { tipo: "rechazar"; mensaje: string }
  | { tipo: "confirmar"; mensaje: string };

const unidadesEnStock = (c: Pick<CatalogoArchivo, "filas">) =>
  c.filas.reduce((suma, f) => suma + Math.max(0, Number(f.cruda.stock) || 0), 0);

const diaCorto = (iso: string) =>
  new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "America/Guayaquil" });

/** Las filas descartadas, agrupadas por motivo y dichas como las diría una persona. */
export function descartadasEnPalabras(descartadas: { fila: number; motivo: string }[]): Array<{ motivo: string; filas: number[] }> {
  const enPalabras = (motivo: string): string => {
    if (/menor que .* revisar en el sistema/.test(motivo)) {
      return "Precio A más bajo que el Precio D: parece un error de tipeo en Fénix, revisar el precio";
    }
    if (/^precio inválido$/.test(motivo)) return "Sin precio (vacío o en 0)";
    // Competimotor cotiza con el Precio B (20-nov): sin B y C que pasen el
    // control (B mayor que A, o bajo el D) la llanta no se cotiza.
    if (/^sin precio con tarjeta/.test(motivo)) {
      return "Precio B (tarjeta) o C (efectivo) vacío, mayor que el Precio A o menor que el D: parece un error de tipeo en Fénix, el bot no la cotiza";
    }
    if (/^precio en efectivo \(Precio C\) mayor/.test(motivo)) return "Precio C (efectivo) mayor que el B (tarjeta): revisar en Fénix, el bot no la cotiza";
    if (/^aro de camión/.test(motivo)) return "Llanta de camión aro 17.5 o 22.5: el bot todavía no las cotiza";
    if (/^medida no reconocida/.test(motivo)) return "No se entiende la medida en la descripción";
    if (/^aro sin diámetro/.test(motivo)) return "Aro sin diámetro reconocible";
    return motivo;
  };
  const grupos = new Map<string, number[]>();
  for (const d of descartadas) {
    const clave = enPalabras(d.motivo);
    grupos.set(clave, [...(grupos.get(clave) ?? []), d.fila]);
  }
  return [...grupos].map(([motivo, filas]) => ({ motivo, filas }));
}

/**
 * LA REGLA DE SEGURIDAD. Se rechaza (y el catálogo anterior sigue vivo) si
 * falta una columna obligatoria, si no queda ninguna llanta o si todas salen
 * con stock 0. Se pide confirmación si la cantidad de llantas cae más de
 * `UMBRAL_CAIDA` contra la carga anterior, si las unidades en stock caen a
 * menos de la mitad, si el reporte es más viejo que el cargado o si se
 * descartaron más filas de las que entraron. Pura, para probar cada caso.
 */
export function decidirCarga(lectura: LecturaDeInventario, anterior: CatalogoArchivo | null): DecisionDeCarga {
  const nuevo = lectura.catalogo;
  const sigue = anterior ? " El inventario anterior sigue cargado." : "";
  if (lectura.faltantes.length) {
    const vistas = lectura.columnasVistas.length
      ? ` Columnas que sí encontré: ${lectura.columnasVistas.slice(0, 14).join(", ")}.`
      : "";
    return {
      tipo: "rechazar",
      mensaje: `${lectura.faltantes.join(" ")}${vistas} Revise que sea el reporte «Inventario de Articulos» de Fénix (o el mapeo en Ajustes → Catálogo).${sigue}`,
    };
  }
  if (anterior?.huella && anterior.huella === nuevo.huella) return { tipo: "igual" };
  const llantas = nuevo.filas.length;
  if (!llantas && !nuevo.aros.length) {
    const motivos = descartadasEnPalabras(nuevo.descartadas).slice(0, 3).map((g) => `${g.motivo} (${g.filas.length})`);
    return {
      tipo: "rechazar",
      mensaje: `No quedó ninguna llanta para cotizar en este archivo${motivos.length ? `: ${motivos.join("; ")}` : ". ¿Es el inventario de Fénix?"}.${sigue}`,
    };
  }
  const unidades = unidadesEnStock(nuevo);
  if (llantas && !unidades) {
    return {
      tipo: "rechazar",
      mensaje: `Las ${llantas} llantas salen con stock 0: parece que la columna del stock no es la correcta o el reporte salió sin existencias.${sigue}`,
    };
  }
  const dudas: string[] = [];
  if (anterior) {
    const antes = anterior.filas.length;
    if (antes && llantas < antes * (1 - UMBRAL_CAIDA)) {
      dudas.push(`Este archivo trae ${llantas} llantas y el cargado tiene ${antes} (${Math.round((1 - llantas / antes) * 100)} % menos).`);
    }
    const unidadesAntes = unidadesEnStock(anterior);
    if (unidadesAntes && unidades < unidadesAntes * (1 - UMBRAL_CAIDA_UNIDADES)) {
      dudas.push(`Trae ${unidades} unidades en stock y el cargado tiene ${unidadesAntes}.`);
    }
    if (nuevo.fechaReporte && anterior.fechaReporte && nuevo.fechaReporte < anterior.fechaReporte) {
      dudas.push(`Este reporte es del ${diaCorto(nuevo.fechaReporte)}: es más viejo que el cargado (del ${diaCorto(anterior.fechaReporte)}).`);
    }
  }
  if (llantas && nuevo.descartadas.length > llantas) {
    dudas.push(`Se descartaron ${nuevo.descartadas.length} filas y solo entraron ${llantas} llantas.`);
  }
  if (dudas.length) {
    return { tipo: "confirmar", mensaje: `${dudas.join(" ")} ¿Lo carga igual?${sigue}` };
  }
  return { tipo: "ok" };
}

/** Un archivo que no se carga. `confirmable`: se puede cargar igual si la persona lo confirma. */
export class CargaRechazada extends Error {
  constructor(message: string, readonly confirmable: boolean) {
    super(message);
    this.name = "CargaRechazada";
  }
}

export interface ResultadoDeImportacion {
  llantas: number;
  aros: number;
  descartadas: { fila: number; motivo: string }[];
  /** true si era el mismo archivo que ya estaba: no se cambió nada. */
  mismoArchivo: boolean;
  hoja: string | null;
  fechaReporte: string | null;
}

/**
 * Importa el archivo subido: lo lee con el mapeo vigente, decide con la regla
 * de seguridad y SOLO si pasa lo guarda en `settings.catalogo_archivo`. El
 * que llama (la ruta del panel) corre `syncCatalog()` después, para que el bot
 * lo use sin reinicio.
 */
export async function importarCatalogoDesdeArchivo(
  nombre: string,
  cuerpo: Buffer,
  opciones: { confirmar?: boolean } = {},
): Promise<ResultadoDeImportacion> {
  const [mapeo, anterior] = await Promise.all([leerMapeoCatalogo(), leerCatalogoArchivo()]);
  const lectura = await leerInventario(nombre, cuerpo, mapeo);
  const decision = decidirCarga(lectura, anterior);
  if (decision.tipo === "rechazar") throw new CargaRechazada(decision.mensaje, false);
  if (decision.tipo === "confirmar" && !opciones.confirmar) throw new CargaRechazada(decision.mensaje, true);
  const catalogo = decision.tipo === "igual" ? anterior! : lectura.catalogo;
  if (decision.tipo !== "igual") await guardarSetting("catalogo_archivo", catalogo);
  return {
    llantas: catalogo.filas.length,
    aros: catalogo.aros.length,
    descartadas: catalogo.descartadas,
    mismoArchivo: decision.tipo === "igual",
    hoja: catalogo.hoja ?? null,
    fechaReporte: catalogo.fechaReporte ?? null,
  };
}

/**
 * Importa y, en el mismo paso, deja al bot usándolo (R-22: sin reinicio). Si
 * el bot no lo pudo cargar, se vuelve a poner el archivo anterior: nunca queda
 * guardado un catálogo que el bot no sabe leer.
 * `catalog.ts` se carga en el momento: él importa esta fuente, y un import
 * estático cerraría el ciclo.
 */
export async function importarCatalogoYSincronizar(nombre: string, cuerpo: Buffer, opciones: { confirmar?: boolean } = {}) {
  const anterior = await leerCatalogoArchivo();
  const importado = await importarCatalogoDesdeArchivo(nombre, cuerpo, opciones);
  const { syncCatalog, catalogStatus } = await import("../catalog.js");
  if (importado.mismoArchivo) return { importado, reporte: null, catalog: catalogStatus() };
  const reporte = await syncCatalog().catch(async (error: unknown) => {
    if (anterior) await guardarSetting("catalogo_archivo", anterior);
    else await sql`delete from settings where key = 'catalogo_archivo'`;
    await syncCatalog().catch(() => undefined);
    throw new CargaRechazada(
      `El bot no pudo cargar este archivo (${error instanceof Error ? error.message : error}).${anterior ? " El inventario anterior sigue cargado." : ""}`,
      false,
    );
  });
  return { importado, reporte, catalog: catalogStatus() };
}

/**
 * El conector de Fénix manda el inventario cada pocos minutos. Si no cambió
 * nada (misma huella) el catálogo no se toca, pero igual tiene que constar
 * que está al día: la tarjeta «Inventario de hoy» y el aviso de inventario
 * viejo miden `subidoEn`. Sin esto, un stock que no se movió en toda la tarde
 * se vería como un conector caído.
 */
export async function marcarCatalogoAlDia(ahora = new Date()): Promise<void> {
  await sql`
    update settings
    set value = jsonb_set(value, '{subidoEn}', to_jsonb(${ahora.toISOString()}::text)), updated_at = now()
    where key = 'catalogo_archivo'
  `;
}

/**
 * Lee el archivo y dice qué pasaría al cargarlo, SIN guardar nada. Es lo que
 * usa el conector con `--probar` mientras se ajusta la consulta en el servidor
 * del cliente: se ve cuántas llantas entrarían y por qué se descarta el resto
 * sin tocar el catálogo con el que el bot está cotizando.
 */
export async function ensayarInventario(nombre: string, cuerpo: Buffer) {
  const [mapeo, anterior] = await Promise.all([leerMapeoCatalogo(), leerCatalogoArchivo()]);
  const lectura = await leerInventario(nombre, cuerpo, mapeo);
  const decision = decidirCarga(lectura, anterior);
  return {
    decision,
    llantas: lectura.catalogo.filas.length,
    aros: lectura.catalogo.aros.length,
    unidades: unidadesEnStock(lectura.catalogo),
    cargadas: anterior ? { llantas: anterior.filas.length, unidades: unidadesEnStock(anterior) } : null,
    descartadas: descartadasEnPalabras(lectura.catalogo.descartadas).map((g) => ({ motivo: g.motivo, filas: g.filas.length })),
    columnasVistas: lectura.columnasVistas,
    faltantes: lectura.faltantes,
  };
}

/** Lo mismo para las facturas: cuántas se leerían con el mapeo vigente, sin guardarlas. */
export async function ensayarFacturas(nombre: string, cuerpo: Buffer) {
  const filas = await filasDelArchivo(nombre, cuerpo);
  const { facturas, descartadas } = agruparFacturasSubidas(filas, await leerMapeoFacturas());
  const dias = facturas.map((f) => f.dia).sort();
  return {
    facturas: facturas.length,
    conTelefono: facturas.filter((f) => f.telefonos.length).length,
    conLlantas: facturas.filter((f) => f.lineas.some((l) => LLANTA.test(l.nombre))).length,
    primerDia: dias[0] ?? null,
    ultimoDia: dias.at(-1) ?? null,
    descartadas: descartadas.length,
    motivos: [...new Set(descartadas.map((d) => d.motivo))].slice(0, 5),
  };
}

export const fuenteArchivoCatalogo: FuenteDeCatalogo = {
  id: "archivo",
  async sincronizar() {
    const guardado = await leerCatalogoArchivo();
    if (!guardado) throw new Error("No hay catálogo subido");
    const items: CatalogItem[] = [];
    const skipped: ReporteDeCatalogo["skipped"] = [...guardado.descartadas.map((d) => ({ row: d.fila, reason: d.motivo }))];
    for (const fila of guardado.filas) {
      const { item, motivo } = normalizarFilaDeCatalogo(fila.cruda, "archivo", fila.precios, politica.precioDeCotizacion);
      // Sin foto en el archivo, la del catálogo de fotos. Se busca al cargar y no
      // al subir: una foto nueva en el código vale sin volver a subir el Excel.
      if (item && !item.imageUrl) {
        // Y sin foto del modelo, una de reserva marcada «Foto referencial»:
        // ninguna llanta de un catálogo subido sale con el dibujo genérico.
        const media = resolveCatalogMedia(item.brand, item.design) ?? resolveCatalogMediaPorNombre(item.brand, item.name)
          ?? fotoDeReserva(item.brand, item.name);
        if (media) Object.assign(item, { imageUrl: media.publicUrl, imageSource: media.sourceLabel });
      }
      if (item) items.push(item);
      else skipped.push({ row: fila.cruda.filaNumero, reason: motivo ?? "fila inválida" });
    }
    if (!items.length && !guardado.aros.length) throw new Error("El catálogo subido no trae llantas ni aros cotizables");
    return {
      items,
      aros: guardado.aros,
      report: {
        ok: items.length,
        skipped,
        at: new Date(),
        source: "archivo",
        archivo: { nombre: guardado.nombreArchivo, subidoEn: guardado.subidoEn, aros: guardado.aros.length },
      },
    };
  },
};

/** Para que `fuenteDeCatalogo()` sepa si hay catálogo subido sin cargarlo entero. */
export async function hayCatalogoArchivo(): Promise<boolean> {
  try {
    const [row] = await sql<{ uno: number }[]>`
      select 1 as uno from settings where key = 'catalogo_archivo' limit 1
    `;
    return Boolean(row);
  } catch {
    return false;
  }
}

/** Lo que muestra la tarjeta «Inventario de hoy»: el último archivo subido y cómo quedó. */
export interface EstadoCatalogoArchivo {
  nombreArchivo: string;
  subidoEn: string;
  /** La fecha del reporte de Fénix, si la trae: con ella se mide qué tan viejo es. */
  fechaReporte: string | null;
  hoja: string | null;
  llantas: number;
  aros: number;
  unidades: number;
  descartadas: { fila: number; motivo: string }[];
  descartadasEnPalabras: Array<{ motivo: string; filas: number[] }>;
}

export async function estadoCatalogoArchivo(): Promise<EstadoCatalogoArchivo | null> {
  const guardado = await leerCatalogoArchivo();
  if (!guardado) return null;
  return {
    nombreArchivo: guardado.nombreArchivo,
    subidoEn: guardado.subidoEn,
    fechaReporte: guardado.fechaReporte ?? null,
    hoja: guardado.hoja ?? null,
    llantas: guardado.filas.length,
    aros: guardado.aros.length,
    unidades: unidadesEnStock(guardado),
    descartadas: guardado.descartadas,
    descartadasEnPalabras: descartadasEnPalabras(guardado.descartadas),
  };
}

// ── Facturas subidas (tabla `facturas_importadas`) ───────────────────────────

function diaNormalizado(s: string): string | null {
  const limpio = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpio);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(limpio);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export interface FacturaParaImportar {
  documento: string;
  dia: string;
  hora: number | null;
  total: number;
  subtotal: number;
  cliente: string;
  telefonos: string[];
  lineas: Array<{ nombre: string; cantidad: number; precio: number }>;
  local: string | null;
}

/**
 * El export de Fénix trae UNA fila por línea de factura: se agrupan por
 * documento. Puro, para probar cada regla sin base.
 */
export function agruparFacturasSubidas(
  filas: Record<string, string>[],
  mapeo: FacturasMapeo,
): { facturas: FacturaParaImportar[]; descartadas: { fila: number; motivo: string }[] } {
  const col = mapeo.columnas;
  const porDocumento = new Map<string, FacturaParaImportar>();
  const descartadas: { fila: number; motivo: string }[] = [];
  filas.forEach((data, i) => {
    const filaNumero = Number(data[FILA]) || i + 2;
    const documento = (data[col.documento] ?? "").trim();
    if (!documento) {
      descartadas.push({ fila: filaNumero, motivo: "sin número de documento" });
      return;
    }
    const dia = diaNormalizado(data[col.fecha] ?? "");
    if (!dia) {
      descartadas.push({ fila: filaNumero, motivo: `fecha no reconocida: "${data[col.fecha] ?? ""}"` });
      return;
    }
    let factura = porDocumento.get(documento);
    if (!factura) {
      const horaCruda = col.hora ? (data[col.hora] ?? "") : "";
      const h = Number((/^(\d{1,2}):?\d{0,2}/.exec(horaCruda.trim()) ?? [])[1]);
      const telefono = tel9(data[col.telefono] ?? "");
      factura = {
        documento,
        dia,
        hora: h >= 0 && h <= 23 ? h : null,
        total: numero(data[col.total] ?? "") ?? 0,
        subtotal: col.subtotal ? (numero(data[col.subtotal] ?? "") ?? 0) : 0,
        cliente: col.cliente ? (data[col.cliente] ?? "").trim() : "",
        telefonos: telefono ? [telefono] : [],
        lineas: [],
        local: col.local ? (data[col.local] ?? "").trim() || null : null,
      };
      porDocumento.set(documento, factura);
    }
    const nombre = (data[col.producto] ?? "").trim();
    if (nombre) {
      factura.lineas.push({
        nombre,
        cantidad: col.cantidad ? (numero(data[col.cantidad] ?? "") ?? 0) : 0,
        precio: col.precio ? (numero(data[col.precio] ?? "") ?? 0) : 0,
      });
    }
  });
  return { facturas: [...porDocumento.values()], descartadas };
}

export async function importarFacturasDesdeArchivo(
  nombre: string,
  cuerpo: Buffer,
): Promise<{ facturas: number; descartadas: { fila: number; motivo: string }[] }> {
  const filas = await filasDelArchivo(nombre, cuerpo);
  if (!filas.length) throw new Error("El archivo no trae filas con datos (¿la primera fila es el encabezado?)");
  const mapeo = await leerMapeoFacturas();
  const { facturas, descartadas } = agruparFacturasSubidas(filas, mapeo);
  if (!facturas.length) {
    const motivos = [...new Set(descartadas.map((d) => d.motivo))].slice(0, 3).join(" · ");
    throw new Error(`Ninguna factura se pudo leer con el mapeo actual (${motivos || "sin motivo"}). Revise el mapeo.`);
  }
  for (const f of facturas) {
    await sql`
      insert into facturas_importadas (documento, dia, hora, total, subtotal, cliente, telefonos, lineas, local, archivo)
      values (${f.documento}, ${f.dia}, ${f.hora}, ${f.total}, ${f.subtotal}, ${f.cliente},
              ${sql.array(f.telefonos)}, ${sql.json(f.lineas as never)}, ${f.local}, ${nombre})
      on conflict (documento) do update set
        dia = excluded.dia, hora = excluded.hora, total = excluded.total,
        subtotal = excluded.subtotal, cliente = excluded.cliente,
        telefonos = excluded.telefonos, lineas = excluded.lineas,
        local = excluded.local, archivo = excluded.archivo, importada_at = now()
    `;
  }
  return { facturas: facturas.length, descartadas };
}

/** Importa las facturas y rehace la bajada: Métricas y «Para cerrar» las ven ya. */
export async function importarFacturasYSincronizar(nombre: string, cuerpo: Buffer) {
  const importado = await importarFacturasDesdeArchivo(nombre, cuerpo);
  const { sincronizarFacturas } = await import("../ventasConfirmadas.js");
  await sincronizarFacturas();
  return { importado, estado: await estadoFacturasImportadas() };
}

export async function hayFacturasImportadas(): Promise<boolean> {
  try {
    const [row] = await sql<{ uno: number }[]>`select 1 as uno from facturas_importadas limit 1`;
    return Boolean(row);
  } catch {
    // Sin la tabla (base vieja a mitad de deploy) no hay fuente de archivo.
    return false;
  }
}

export async function estadoFacturasImportadas(): Promise<{ facturas: number; ultimoDia: string | null; ultimaImportacion: string | null }> {
  try {
    const [row] = await sql<{ n: number; ultimo_dia: string | null; importada: string | null }[]>`
      select count(*)::int as n, max(dia) as ultimo_dia, max(importada_at)::text as importada
      from facturas_importadas
    `;
    return { facturas: row?.n ?? 0, ultimoDia: row?.ultimo_dia ?? null, ultimaImportacion: row?.importada ?? null };
  } catch {
    return { facturas: 0, ultimoDia: null, ultimaImportacion: null };
  }
}

export const fuenteArchivoFacturas: FuenteDeFacturas = {
  id: "archivo",
  async sincronizar(desde) {
    const filas = await sql<{
      documento: string; dia: string; hora: number | null; total: string; subtotal: string;
      cliente: string; telefonos: string[]; lineas: Array<{ nombre: string; cantidad: number; precio: number }>;
      local: string | null;
    }[]>`
      select documento, dia, hora, total, subtotal, cliente, telefonos, lineas, local
      from facturas_importadas
      where dia >= ${desde}
      order by dia
    `;
    const facturas: FacturaVenta[] = filas.map((f) => ({
      documento: f.documento,
      dia: f.dia,
      hora: f.hora,
      total: Number(f.total) || 0,
      subtotal: Number(f.subtotal) || 0,
      cliente: f.cliente,
      telefonos: f.telefonos ?? [],
      llantas: (f.lineas ?? []).filter((l) => LLANTA.test(l.nombre ?? "")),
      ...(f.local ? { local: f.local } : {}),
    }));
    const dias = facturas.map((f) => f.dia).sort();
    const lectura: LecturaDeFacturas = {
      paginas: 0,
      documentos: facturas.length,
      facturas: facturas.length,
      conTelefono: facturas.filter((f) => f.telefonos.length).length,
      primerDia: dias[0] ?? null,
      ultimoDia: dias.at(-1) ?? null,
      llave: "archivo",
    };
    return { facturas, lectura };
  },
};

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
import ExcelJS from "exceljs";
import { z } from "zod";
import { sql } from "../../db/client.js";
import { negocio } from "../../negocio/index.js";
import type { AroProducto } from "../../domain/aroProducto.js";
import type { CatalogItem } from "../../domain/catalog.js";
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
 * Arranque con columnas tipo Fénix (encabezados en minúsculas). Las columnas
 * reales del export de Mundillantas siguen [PENDIENTE] hasta tener la captura
 * del Excel de Jenny: se corrigen en Ajustes → Catálogo, sin deploy. El precio
 * se asume SIN IVA, como dice el perfil (`negocio.iva`).
 */
export const MAPEO_CATALOGO_DEFECTO: CatalogoMapeo = {
  columnas: {
    medida: "medida",
    marca: "marca",
    diseno: "modelo",
    codigo: "codigo",
    nombre: "descripcion",
    precio: "pvp",
    precioLista: "pvp lista",
    stock: "stock",
    foto: "foto",
  },
  precioIncluyeIva: false,
  filasDeAros: { columna: "linea", patron: "^aro|^rin" },
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

// ── Leer el archivo crudo (CSV o XLSX) a filas con encabezado ────────────────

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

function filasDeCsv(texto: string): Record<string, string>[] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) return [];
  // El separador es el que más columnas produce en el encabezado.
  const sep = [",", ";", "\t"]
    .map((s) => ({ s, n: camposCsv(lineas[0], s).length }))
    .sort((a, b) => b.n - a.n)[0].s;
  const encabezado = camposCsv(lineas[0], sep).map((c) => c.toLowerCase());
  return lineas.slice(1).map((linea) => {
    const campos = camposCsv(linea, sep);
    const fila: Record<string, string> = {};
    encabezado.forEach((col, i) => { fila[col] = campos[i] ?? ""; });
    return fila;
  });
}

async function filasDeXlsx(cuerpo: Buffer): Promise<Record<string, string>[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(cuerpo as unknown as ArrayBuffer);
  const hoja = libro.worksheets[0];
  if (!hoja) return [];
  const encabezado: string[] = [];
  hoja.getRow(1).eachCell({ includeEmpty: true }, (celda, n) => {
    encabezado[n] = String(celda.text ?? "").trim().toLowerCase();
  });
  const filas: Record<string, string>[] = [];
  hoja.eachRow((row, numero) => {
    if (numero === 1) return;
    const fila: Record<string, string> = {};
    let conAlgo = false;
    row.eachCell({ includeEmpty: true }, (celda, n) => {
      const col = encabezado[n];
      if (!col) return;
      const valor = String(celda.text ?? "").trim();
      fila[col] = valor;
      if (valor) conAlgo = true;
    });
    if (conAlgo) filas.push(fila);
  });
  return filas;
}

const esXlsx = (nombre: string, cuerpo: Buffer) =>
  /\.xlsx?$/i.test(nombre) || (cuerpo.length > 1 && cuerpo[0] === 0x50 && cuerpo[1] === 0x4b);

export async function filasDelArchivo(nombre: string, cuerpo: Buffer): Promise<Record<string, string>[]> {
  return esXlsx(nombre, cuerpo) ? filasDeXlsx(cuerpo) : filasDeCsv(cuerpo.toString("utf8"));
}

// ── Catálogo subido (clave `catalogo_archivo`) ───────────────────────────────

interface FilaGuardada {
  cruda: FilaCruda;
  precios: { conIva: number; listaConIva: number; minimoConIva: number; taxRate: number };
}

export interface CatalogoArchivo {
  nombreArchivo: string;
  subidoEn: string;
  filas: FilaGuardada[];
  aros: AroProducto[];
  descartadas: { fila: number; motivo: string }[];
}

const numero = (s: string): number | null => {
  const limpio = s.replace(/[$\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

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
  return numero(data[mapeo.columnas.stock] ?? "") ?? 0;
}

export function normalizarCatalogoSubido(
  nombre: string,
  filas: Record<string, string>[],
  mapeo: CatalogoMapeo,
  ahora = new Date(),
): CatalogoArchivo {
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
    const filaNumero = i + 2; // +1 encabezado, +1 índice desde 1
    if (esAro(data)) {
      const { aro, motivo } = filaDeAro(data, mapeo, filaNumero, mapeo.precioIncluyeIva);
      if (aro) aros.push(aro);
      else descartadas.push({ fila: filaNumero, motivo: motivo ?? "aro inválido" });
      return;
    }
    const precioCrudo = numero(data[col.precio] ?? "");
    const lista = col.precioLista ? numero(data[col.precioLista] ?? "") : null;
    const minimo = col.precioMinimo ? numero(data[col.precioMinimo] ?? "") : null;
    const cruda: FilaCruda = {
      medida: (data[col.medida] ?? "").trim(),
      marca: (data[col.marca] ?? "").trim(),
      diseno: (data[col.diseno] ?? "").trim(),
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
    const conIva = conIvaDelPerfil(precioCrudo, mapeo.precioIncluyeIva);
    const precios = {
      conIva,
      // Sin precio de lista ni mínimo, los dos = precio: sin descuento visible.
      listaConIva: lista !== null ? conIvaDelPerfil(lista, mapeo.precioIncluyeIva) : conIva,
      minimoConIva: minimo !== null ? conIvaDelPerfil(minimo, mapeo.precioIncluyeIva) : conIva,
      taxRate: negocio.iva,
    };
    const { item, motivo } = normalizarFilaDeCatalogo(cruda, "archivo", precios);
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

/**
 * Importa el archivo subido: normaliza con el mapeo vigente, lo guarda en
 * `settings.catalogo_archivo` y devuelve el resumen. El que llama (la ruta del
 * panel) corre `syncCatalog()` después, para que el bot lo use sin reinicio.
 */
export async function importarCatalogoDesdeArchivo(
  nombre: string,
  cuerpo: Buffer,
): Promise<{ llantas: number; aros: number; descartadas: { fila: number; motivo: string }[] }> {
  const filas = await filasDelArchivo(nombre, cuerpo);
  if (!filas.length) throw new Error("El archivo no trae filas con datos (¿la primera fila es el encabezado?)");
  const mapeo = await leerMapeoCatalogo();
  const catalogo = normalizarCatalogoSubido(nombre, filas, mapeo);
  if (!catalogo.filas.length && !catalogo.aros.length) {
    const motivos = [...new Set(catalogo.descartadas.map((d) => d.motivo))].slice(0, 3).join(" · ");
    throw new Error(`Ninguna fila se pudo leer con el mapeo actual (${motivos || "sin motivo"}). Revise el mapeo de columnas.`);
  }
  await guardarSetting("catalogo_archivo", catalogo);
  return { llantas: catalogo.filas.length, aros: catalogo.aros.length, descartadas: catalogo.descartadas };
}

/**
 * Importa y, en el mismo paso, deja al bot usándolo (R-22: sin reinicio).
 * `catalog.ts` se carga en el momento: él importa esta fuente, y un import
 * estático cerraría el ciclo.
 */
export async function importarCatalogoYSincronizar(nombre: string, cuerpo: Buffer) {
  const importado = await importarCatalogoDesdeArchivo(nombre, cuerpo);
  const { syncCatalog, catalogStatus } = await import("../catalog.js");
  const reporte = await syncCatalog().catch((error: unknown) => {
    throw new Error(`Se guardó el archivo, pero el catálogo no se pudo cargar: ${error instanceof Error ? error.message : error}`);
  });
  return { importado, reporte, catalog: catalogStatus() };
}

export const fuenteArchivoCatalogo: FuenteDeCatalogo = {
  id: "archivo",
  async sincronizar() {
    const guardado = await leerCatalogoArchivo();
    if (!guardado) throw new Error("No hay catálogo subido");
    const items: CatalogItem[] = [];
    const skipped: ReporteDeCatalogo["skipped"] = [...guardado.descartadas.map((d) => ({ row: d.fila, reason: d.motivo }))];
    for (const fila of guardado.filas) {
      const { item, motivo } = normalizarFilaDeCatalogo(fila.cruda, "archivo", fila.precios);
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

/** Lo que muestra la tarjeta del panel: nombre, fecha y filas del último subido. */
export async function estadoCatalogoArchivo(): Promise<
  { nombreArchivo: string; subidoEn: string; llantas: number; aros: number; descartadas: { fila: number; motivo: string }[] } | null
> {
  const guardado = await leerCatalogoArchivo();
  if (!guardado) return null;
  return {
    nombreArchivo: guardado.nombreArchivo,
    subidoEn: guardado.subidoEn,
    llantas: guardado.filas.length,
    aros: guardado.aros.length,
    descartadas: guardado.descartadas,
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
    const filaNumero = i + 2;
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

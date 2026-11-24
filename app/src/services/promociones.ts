/**
 * PROMOCIONES QUE EL NEGOCIO ARMA SOLO — la base y el Excel de ida y vuelta.
 *
 * Las cuentas y los candados viven en `domain/promociones.ts` (puro). Acá:
 *  - guardar, listar, prender/apagar y archivar (tabla `promociones`);
 *  - el Excel que el negocio baja con su stock y su precio de hoy, y la lectura
 *    del que sube lleno (con el mismo lector que el inventario: .xlsx, .xls o CSV);
 *  - lo que el catálogo aplica en cada sincronización (`promocionesParaElCatalogo`).
 *
 * NO importa `services/catalog.ts` (el catálogo importa esto): quien necesita
 * las llantas se las pasa por parámetro.
 */
import ExcelJS from "exceljs";
import { sql } from "../db/client.js";
import { politica } from "../negocio/politica.js";
import type { CatalogItem } from "../domain/catalog.js";
import {
  COL, TIPOS_DE_PROMOCION, efectoDeLaFila, errorDeParametros, esDia, estadoDePromocion, preciosPorCantidad,
  reglaEnPalabras, tipoParaElPanel,
  type EstadoDePromocion, type FilaDePromocion, type ParametrosDePromocion, type PrecioBase, type Promocion,
  type TipoDePromocion,
  descuentoParaTodas,
} from "../domain/promociones.js";
import { filasDelArchivo, numeroDelArchivo } from "./fuentes/archivo.js";

// ── Base ────────────────────────────────────────────────────────────────────

interface FilaDeLaBase {
  id: string | number;
  nombre: string;
  tipo: string;
  texto_extra: string | null;
  activa: boolean;
  desde: string | null;
  hasta: string | null;
  parametros: unknown;
  filas: unknown;
  origen: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const iso = (d: Date | string) => new Date(d).toISOString();
const objeto = <T>(v: unknown, vacio: T): T => {
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return vacio; }
  }
  return (v ?? vacio) as T;
};

function dePromocion(f: FilaDeLaBase): Promocion {
  return {
    id: Number(f.id),
    nombre: f.nombre,
    tipo: (TIPOS_DE_PROMOCION as readonly string[]).includes(f.tipo) ? (f.tipo as TipoDePromocion) : "precio_nuevo",
    textoExtra: f.texto_extra,
    activa: f.activa,
    desde: esDia(f.desde) ? f.desde : null,
    hasta: esDia(f.hasta) ? f.hasta : null,
    parametros: objeto<ParametrosDePromocion>(f.parametros, {}),
    filas: objeto<FilaDePromocion[]>(f.filas, []),
    origen: f.origen,
    creadaEn: iso(f.created_at),
    actualizadaEn: iso(f.updated_at),
  };
}

/** Todas las guardadas (sin las archivadas), de la más nueva a la más vieja. */
export async function listarPromociones(): Promise<Promocion[]> {
  const filas = await sql<FilaDeLaBase[]>`
    select id, nombre, tipo, texto_extra, activa, desde, hasta, parametros, filas, origen, created_at, updated_at
    from promociones where not archivada order by id desc
  `;
  return filas.map(dePromocion);
}

export async function leerPromocion(id: number): Promise<Promocion | null> {
  const [fila] = await sql<FilaDeLaBase[]>`
    select id, nombre, tipo, texto_extra, activa, desde, hasta, parametros, filas, origen, created_at, updated_at
    from promociones where id = ${id} and not archivada
  `;
  return fila ? dePromocion(fila) : null;
}

export class PromocionInvalida extends Error {}

export interface DatosDePromocion {
  nombre: string;
  tipo: TipoDePromocion;
  textoExtra?: string | null;
  activa?: boolean;
  desde?: string | null;
  hasta?: string | null;
  parametros?: ParametrosDePromocion;
}

const NOMBRE_MAXIMO = 40;
const TEXTO_MAXIMO = 140;

/** Limpia y valida lo que llega del panel; lanza `PromocionInvalida` con el motivo en palabras. */
export function datosValidados(crudo: Partial<DatosDePromocion>): Required<Omit<DatosDePromocion, "activa">> & { activa: boolean } {
  const nombre = String(crudo.nombre ?? "").replace(/\s+/g, " ").trim();
  if (!nombre) throw new PromocionInvalida("Póngale un nombre a la promoción.");
  if (nombre.length > NOMBRE_MAXIMO) throw new PromocionInvalida(`El nombre no puede pasar de ${NOMBRE_MAXIMO} letras (sale en la cotización).`);
  if (!(TIPOS_DE_PROMOCION as readonly string[]).includes(String(crudo.tipo))) throw new PromocionInvalida("Elija un tipo de promoción.");
  const tipo = crudo.tipo as TipoDePromocion;
  const textoExtra = String(crudo.textoExtra ?? "").replace(/\s+/g, " ").trim().slice(0, TEXTO_MAXIMO) || null;
  const dia = (v: unknown, cual: string) => {
    if (v === null || v === undefined || v === "") return null;
    if (!esDia(v)) throw new PromocionInvalida(`La fecha «${cual}» no es válida.`);
    return v;
  };
  const desde = dia(crudo.desde, "desde");
  const hasta = dia(crudo.hasta, "hasta");
  if (desde && hasta && desde > hasta) throw new PromocionInvalida("La fecha de fin es anterior a la de inicio.");
  const parametros = parametrosLimpios(tipo, crudo.parametros ?? {});
  const error = errorDeParametros(tipo, parametros);
  if (error) throw new PromocionInvalida(error);
  return { nombre, tipo, textoExtra, desde, hasta, parametros, activa: crudo.activa !== false };
}

/** Solo los parámetros del tipo, como números de verdad. */
export function parametrosLimpios(tipo: TipoDePromocion, p: ParametrosDePromocion): ParametrosDePromocion {
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : Number(v));
  if (tipo === "nxm") return { lleva: n(p.lleva), paga: n(p.paga) };
  if (tipo === "enesima") return { posicion: n(p.posicion), porcentaje: n(p.porcentaje) };
  if (tipo === "escalonado") {
    return {
      escalones: (Array.isArray(p.escalones) ? p.escalones : [])
        .map((e) => ({ desde: Number(e?.desde), porcentaje: Number(e?.porcentaje) }))
        .sort((a, b) => a.desde - b.desde),
    };
  }
  if (tipo === "regalo") return { regalo: String(p.regalo ?? "").replace(/\s+/g, " ").trim().slice(0, TEXTO_MAXIMO) };
  if (tipo === "porcentaje" && p.todas === true) return { todas: true, porcentaje: n(p.porcentaje) };
  return {};
}

export async function crearPromocion(datos: DatosDePromocion, filas: FilaDePromocion[], quien: string | null, origen = "panel"): Promise<Promocion> {
  const d = datosValidados(datos);
  if (!filas.length && !d.parametros.todas) throw new PromocionInvalida("La promoción no tiene ninguna llanta: suba el Excel lleno.");
  const [fila] = await sql<FilaDeLaBase[]>`
    insert into promociones (nombre, tipo, texto_extra, activa, desde, hasta, parametros, filas, origen, creada_por)
    values (${d.nombre}, ${d.tipo}, ${d.textoExtra}, ${d.activa}, ${d.desde}, ${d.hasta},
            ${sql.json(d.parametros as never)}, ${sql.json(filas as never)}, ${origen}, ${quien})
    returning id, nombre, tipo, texto_extra, activa, desde, hasta, parametros, filas, origen, created_at, updated_at
  `;
  recordar(null);
  return dePromocion(fila);
}

/** Cambia nombre, texto, fechas, interruptor y/o las llantas. El tipo no se cambia: se crea otra. */
export async function actualizarPromocion(
  id: number,
  cambios: Partial<DatosDePromocion> & { filas?: FilaDePromocion[] },
): Promise<Promocion> {
  const actual = await leerPromocion(id);
  if (!actual) throw new PromocionInvalida("Esa promoción ya no existe.");
  const d = datosValidados({
    nombre: cambios.nombre ?? actual.nombre,
    tipo: actual.tipo,
    textoExtra: cambios.textoExtra === undefined ? actual.textoExtra : cambios.textoExtra,
    activa: cambios.activa ?? actual.activa,
    desde: cambios.desde === undefined ? actual.desde : cambios.desde,
    hasta: cambios.hasta === undefined ? actual.hasta : cambios.hasta,
    parametros: cambios.parametros ?? actual.parametros,
  });
  const filas = cambios.filas ?? actual.filas;
  if (!filas.length && !d.parametros.todas) throw new PromocionInvalida("La promoción no tiene ninguna llanta: suba el Excel lleno.");
  const [fila] = await sql<FilaDeLaBase[]>`
    update promociones set nombre = ${d.nombre}, texto_extra = ${d.textoExtra}, activa = ${d.activa},
      desde = ${d.desde}, hasta = ${d.hasta}, parametros = ${sql.json(d.parametros as never)},
      filas = ${sql.json(filas as never)}, updated_at = now()
    where id = ${id} and not archivada
    returning id, nombre, tipo, texto_extra, activa, desde, hasta, parametros, filas, origen, created_at, updated_at
  `;
  if (!fila) throw new PromocionInvalida("Esa promoción ya no existe.");
  recordar(null);
  return dePromocion(fila);
}

/** «Borrar» en el panel: se archiva (deja de aplicarse y de verse), no se pierde de la base. */
export async function archivarPromocion(id: number): Promise<boolean> {
  const filas = await sql`update promociones set archivada = true, activa = false, updated_at = now() where id = ${id} and not archivada returning id`;
  recordar(null);
  return filas.length > 0;
}

// ── Lo que el catálogo aplica ───────────────────────────────────────────────

let cargadas: Promocion[] | null = null;
let politicaYaSembrada = false;
function recordar(promos: Promocion[] | null): void {
  cargadas = promos;
}

/**
 * Las promociones para armar el catálogo. `politicaSembrada: false` = la lista
 * escrita en el código (`politica.preciosEspeciales`) todavía no pasó a la
 * tabla, o la base no contestó y nunca se cargó nada: quien llama la aplica
 * directo, para que una caída de la base no apague el Black Friday. Si ya se
 * habían cargado, se usan las últimas.
 */
export async function promocionesParaElCatalogo(): Promise<{
  promos: Promocion[];
  deLaBase: boolean;
  politicaSembrada: boolean;
  /** % que se descuenta a todas las llantas hoy (el «Descuento de siempre»). */
  descuentoDeSiempre: number;
}> {
  try {
    const promos = await listarPromociones();
    const lista = politica.preciosEspeciales;
    // Cuenta también la archivada: si el negocio la quitó, no vuelve por el código.
    const [sembrada] = lista
      ? await sql<{ id: number }[]>`select id from promociones where origen = ${`politica:${lista.nombre}`} limit 1`
      : [];
    const [descuentoSembrado] = politica.descuentoDeSiempre
      ? await sql<{ id: number }[]>`select id from promociones where origen = ${ORIGEN_DESCUENTO_DE_SIEMPRE} limit 1`
      : [];
    recordar(promos);
    politicaYaSembrada = Boolean(sembrada);
    descuentoYaSembrado = Boolean(descuentoSembrado);
    return { promos, deLaBase: true, politicaSembrada: politicaYaSembrada, descuentoDeSiempre: descuentoDeHoy(promos, descuentoYaSembrado) };
  } catch (error) {
    if (cargadas) {
      return { promos: cargadas, deLaBase: true, politicaSembrada: politicaYaSembrada, descuentoDeSiempre: descuentoDeHoy(cargadas, descuentoYaSembrado) };
    }
    console.warn("⚠️ No se pudieron leer las promociones de la base:", error instanceof Error ? error.message : error);
    // Una caída de la base no le quita a Depot su precio de hoy.
    return { promos: [], deLaBase: false, politicaSembrada: false, descuentoDeSiempre: descuentoDeHoy([], false) };
  }
}

export const ORIGEN_DESCUENTO_DE_SIEMPRE = "politica:descuento-de-siempre";
let descuentoYaSembrado = false;

/**
 * Sin sembrar (o sin base), manda el de la política; sembrado, manda el panel:
 * apagado, vencido o quitado = 0 %, aunque la política diga 25.
 */
function descuentoDeHoy(promos: readonly Promocion[], sembrado: boolean): number {
  const dePolitica = politica.descuentoDeSiempre?.porcentaje ?? 0;
  if (!dePolitica) return descuentoParaTodas(promos);
  return sembrado ? descuentoParaTodas(promos) : dePolitica;
}

/**
 * EL DESCUENTO DE SIEMPRE PASA AL PANEL, UNA VEZ (24-nov-2026). Depot daba
 * −25 % en todas las llantas, escondido en el «precio mínimo» del Interbot.
 * Ahora es una promoción «para todas» que el negocio ve, apaga y prende. No se
 * vuelve a sembrar aunque la quiten (el índice único de `origen`).
 */
export async function sembrarDescuentoDeSiempre(): Promise<void> {
  const d = politica.descuentoDeSiempre;
  if (!d) return;
  try {
    const [ya] = await sql<{ id: number }[]>`select id from promociones where origen = ${ORIGEN_DESCUENTO_DE_SIEMPRE} limit 1`;
    if (ya) return;
    await sql`
      insert into promociones (nombre, tipo, texto_extra, activa, desde, hasta, parametros, filas, origen, creada_por)
      values (${d.nombre}, 'porcentaje', null, true, null, null,
              ${sql.json({ todas: true, porcentaje: d.porcentaje } as never)}, '[]'::jsonb, ${ORIGEN_DESCUENTO_DE_SIEMPRE}, 'AutoVenta')
      on conflict do nothing
    `;
    recordar(null);
    console.log(`🏷️ «${d.nombre}» (−${d.porcentaje} % en todas las llantas) pasado a la pestaña Promociones.`);
  } catch (error) {
    console.warn("⚠️ No se pudo sembrar el descuento de siempre:", error instanceof Error ? error.message : error);
  }
}

/**
 * LA QUE VENÍA ESCRITA EN EL CÓDIGO PASA AL PANEL, UNA VEZ. El Black Friday de
 * Competimotor (`politica.preciosEspeciales`) se guarda como una promoción de
 * «precio de promoción» con sus fechas; desde ahí la prende, la apaga o le
 * cambia la fecha el negocio, sin un deploy. No se vuelve a sembrar aunque la
 * archiven (el índice único de `origen` lo impide).
 */
export async function sembrarPromocionDeLaPolitica(): Promise<void> {
  const lista = politica.preciosEspeciales;
  if (!lista) return;
  const origen = `politica:${lista.nombre}`;
  try {
    const [ya] = await sql<{ id: number }[]>`select id from promociones where origen = ${origen} limit 1`;
    if (ya) return;
    const diaDe = (isoConZona: string) => isoConZona.slice(0, 10);
    const filas: FilaDePromocion[] = lista.llantas.map((l) => ({ codigo: l.codigo, medida: l.medida, precio: l.precioConIva }));
    await sql`
      insert into promociones (nombre, tipo, texto_extra, activa, desde, hasta, parametros, filas, origen, creada_por)
      values (${lista.nombre}, 'precio_nuevo', null, true, ${diaDe(lista.desde)}, ${diaDe(lista.hasta)},
              '{}'::jsonb, ${sql.json(filas as never)}, ${origen}, 'AutoVenta')
      on conflict do nothing
    `;
    recordar(null);
    console.log(`🏷️ Promoción «${lista.nombre}» (${filas.length} llantas) pasada a la pestaña Promociones.`);
  } catch (error) {
    console.warn("⚠️ No se pudo sembrar la promoción de la política:", error instanceof Error ? error.message : error);
  }
}

// ── Lo que ve el panel ──────────────────────────────────────────────────────

const clave = (codigo: string) => codigo.trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface LlantaDeLaVistaPrevia {
  codigo: string;
  nombre: string;
  medida: string | null;
  stock: number;
  precioHoy: number;
  /** Promos parejas: el precio por llanta. Por cantidad: el del juego de 4 (o null). */
  precioPromo: number | null;
  porcentaje: number | null;
  /** Por cantidad: la regla y el precio por llanta con 1, 2, 3 y 4. */
  regla: string | null;
  porCantidad: Array<{ cantidad: number; unidad: number | null; total: number }> | null;
  advertencias: string[];
}

export interface VistaPrevia {
  entran: LlantaDeLaVistaPrevia[];
  noEntran: Array<{ fila: number | null; codigo: string; nombre: string | null; motivo: string }>;
  /** Filas del Excel que el negocio dejó sin llenar (no son error). */
  sinLlenar: number;
}

/** Qué le pasa hoy a cada llanta de la promoción, contra el inventario de hoy. */
export function vistaPreviaDe(
  tipo: TipoDePromocion,
  parametros: ParametrosDePromocion,
  filas: readonly (FilaDePromocion & { filaDelExcel?: number })[],
  items: readonly CatalogItem[],
  bases: ReadonlyMap<string, PrecioBase>,
): VistaPrevia {
  const porCodigo = new Map(items.map((i) => [clave(i.code), i]));
  const vista: VistaPrevia = { entran: [], noEntran: [], sinLlenar: 0 };
  const vistos = new Set<string>();
  for (const fila of filas) {
    const item = porCodigo.get(clave(fila.codigo));
    const base = bases.get(clave(fila.codigo));
    const nombre = item ? `${item.brand} ${item.design}`.trim() : null;
    const fuera = (motivo: string) => vista.noEntran.push({ fila: fila.filaDelExcel ?? null, codigo: fila.codigo, nombre, motivo });
    if (!item || !base) { fuera("ese código no está en el inventario de hoy"); continue; }
    if (vistos.has(clave(fila.codigo))) { fuera("el código está repetido en el Excel"); continue; }
    vistos.add(clave(fila.codigo));
    if (fila.medida && item.sizeLabel && fila.medida !== item.sizeLabel) { fuera(`la medida no coincide: Excel ${fila.medida}, inventario ${item.sizeLabel}`); continue; }
    const r = efectoDeLaFila(tipo, parametros, fila, base.hoy);
    if (!r.ok) { fuera(r.motivo); continue; }
    const advertencias = [...r.advertencias];
    let precioPromo: number | null = null;
    let regla: string | null = null;
    let porCantidad: LlantaDeLaVistaPrevia["porCantidad"] = null;
    if (r.efecto.clase === "pareja") {
      precioPromo = r.efecto.precio;
      const efectivo = item.preciosPorPago?.efectivoConIva;
      if (typeof efectivo === "number" && efectivo > 0 && precioPromo >= efectivo) {
        advertencias.push(`no baja del precio en efectivo de hoy ($${efectivo.toFixed(2)})`);
      }
    } else if (r.efecto.clase === "cantidad") {
      regla = reglaEnPalabras(r.efecto.regla, base.hoy);
      porCantidad = preciosPorCantidad({ regla: r.efecto.regla, base: base.hoy } as never);
      precioPromo = porCantidad[3]?.unidad ?? null;
    } else {
      regla = r.efecto.texto;
    }
    vista.entran.push({
      codigo: item.code,
      nombre: nombre ?? item.name,
      medida: item.sizeLabel,
      stock: item.stock,
      precioHoy: base.hoy,
      precioPromo,
      porcentaje: precioPromo !== null ? Math.round((1 - precioPromo / base.hoy) * 100) : null,
      regla,
      porCantidad,
      advertencias,
    });
  }
  return vista;
}

export interface PromocionParaElPanel extends Omit<Promocion, "filas"> {
  estado: EstadoDePromocion;
  tipoNombre: string;
  llantas: number;
  /** Cuántas de sus llantas tienen la promo aplicada HOY y cuántas no (con el porqué). */
  entranHoy: number;
  noEntranHoy: number;
  resumen: string | null;
}

export function paraElPanel(
  promo: Promocion,
  items: readonly CatalogItem[],
  bases: ReadonlyMap<string, PrecioBase>,
): PromocionParaElPanel {
  const vista = vistaPreviaDe(promo.tipo, promo.parametros, promo.filas, items, bases);
  const { filas: _filas, ...resto } = promo;
  void _filas;
  const p = promo.parametros;
  const resumen = promo.tipo === "nxm" ? `Lleva ${p.lleva}, paga ${p.paga}`
    : promo.tipo === "enesima" ? (p.porcentaje! >= 100 ? `La ${p.posicion}.ª llanta gratis` : `${p.porcentaje} % menos en la ${p.posicion}.ª llanta`)
    : promo.tipo === "escalonado" ? (p.escalones ?? []).map((e) => `${e.desde}+ llantas: ${e.porcentaje} %`).join(" · ")
    : promo.tipo === "regalo" ? (p.regalo ?? null)
    : p.todas ? `${p.porcentaje} % menos en todas las llantas`
    : null;
  return {
    ...resto,
    estado: estadoDePromocion(promo),
    tipoNombre: tipoParaElPanel(promo.tipo).nombre,
    llantas: p.todas ? items.length : promo.filas.length,
    entranHoy: p.todas ? items.length : vista.entran.length,
    noEntranHoy: vista.noEntran.length,
    resumen,
  };
}

// ── El Excel ────────────────────────────────────────────────────────────────

const aroDe = (medida: string | null) => Number(/R\s*(\d{2}(?:\.\d)?)/i.exec(medida ?? "")?.[1] ?? 0);

/** Las llantas en el orden del Excel: por aro, medida, marca y modelo. */
function ordenDelExcel(items: readonly CatalogItem[]): CatalogItem[] {
  return [...items].sort((a, b) =>
    aroDe(a.sizeLabel) - aroDe(b.sizeLabel)
    || String(a.sizeLabel ?? "").localeCompare(String(b.sizeLabel ?? ""))
    || a.brand.localeCompare(b.brand)
    || a.design.localeCompare(b.design));
}

const COMO_LLENARLO: Record<TipoDePromocion, string[]> = {
  precio_nuevo: [
    `Escriba en «${COL.precioNuevo}» el precio final por llanta, CON IVA, solo en las llantas que entran en la promoción.`,
    "Tiene que ser menor que el precio actual: el actual sale tachado y el bot calcula el porcentaje.",
  ],
  porcentaje: [
    `Escriba en «${COL.porcentaje}» el porcentaje (15 quiere decir 15 % menos), solo en las llantas que entran.`,
    "El bot calcula el precio sobre el precio actual con IVA.",
  ],
  monto: [`Escriba en «${COL.monto}» cuántos dólares menos por llanta (con IVA), solo en las llantas que entran.`],
  por_llanta: [
    "Escriba el precio CON IVA de la 1.ª, 2.ª, 3.ª y 4.ª llanta. Deje vacía la que va a precio normal; 0 quiere decir gratis.",
    "Ejemplo: solo «Precio llanta 4» en 50 = la cuarta llanta a $50 y las otras tres a precio normal.",
    "Con 5 o más llantas la cuenta se repite: la 5.ª vale como la 1.ª.",
  ],
  nxm: [`Escriba una X en «${COL.aplica}» en las llantas que entran en la promoción.`],
  enesima: [`Escriba una X en «${COL.aplica}» en las llantas que entran en la promoción.`],
  juego: [
    `Escriba el precio CON IVA del paquete entero: «${COL.juego2}» y/o «${COL.juego4}».`,
    "Lo que sobre de un paquete (la 3.ª llanta de 3) va a precio normal.",
  ],
  escalonado: [`Escriba una X en «${COL.aplica}» en las llantas que entran en la promoción.`],
  regalo: [`Escriba una X en «${COL.aplica}» en las llantas que llevan el regalo.`],
};

/**
 * El Excel que el negocio baja: una fila por llanta del inventario de hoy con
 * su precio actual, y las columnas del tipo vacías (o con lo ya guardado, si
 * `filas` trae la promoción que se está editando).
 */
export async function excelDePromocion(input: {
  tipo: TipoDePromocion;
  nombre?: string | null;
  filas?: readonly FilaDePromocion[];
  items: readonly CatalogItem[];
  bases: ReadonlyMap<string, PrecioBase>;
}): Promise<Buffer> {
  const tipo = tipoParaElPanel(input.tipo);
  const guardadas = new Map((input.filas ?? []).map((f) => [clave(f.codigo), f]));
  const conEfectivo = input.items.some((i) => i.preciosPorPago);
  const fijas = [COL.codigo, COL.marca, COL.modelo, COL.medida, COL.stock, COL.precioHoy, ...(conEfectivo ? [COL.precioEfectivo] : [])];
  const columnas = [...fijas, ...tipo.columnas];

  const libro = new ExcelJS.Workbook();
  libro.creator = "AutoVenta";
  const hoja = libro.addWorksheet("Promoción", { views: [{ state: "frozen", ySplit: 1, xSplit: 4 }] });
  hoja.addRow(columnas);
  const valorDe = (fila: FilaDePromocion | undefined, columna: string): number | string | null => {
    if (!fila) return null;
    switch (columna) {
      case COL.precioNuevo: return fila.precio ?? null;
      case COL.porcentaje: return fila.porcentaje ?? null;
      case COL.monto: return fila.monto ?? null;
      case COL.llanta1: return fila.porLlanta?.[0] ?? null;
      case COL.llanta2: return fila.porLlanta?.[1] ?? null;
      case COL.llanta3: return fila.porLlanta?.[2] ?? null;
      case COL.llanta4: return fila.porLlanta?.[3] ?? null;
      case COL.juego2: return fila.juego2 ?? null;
      case COL.juego4: return fila.juego4 ?? null;
      case COL.aplica: return "X";
      default: return null;
    }
  };
  for (const item of ordenDelExcel(input.items)) {
    const base = input.bases.get(clave(item.code));
    if (!base || !(base.hoy > 0)) continue;
    const guardada = guardadas.get(clave(item.code));
    hoja.addRow([
      item.code, item.brand, item.design, item.sizeLabel ?? "", item.stock, round2(base.hoy),
      ...(conEfectivo ? [item.preciosPorPago ? round2(item.preciosPorPago.efectivoConIva) : null] : []),
      ...tipo.columnas.map((c) => valorDe(guardada, c)),
    ]);
  }
  // Presentación: encabezado oscuro, lo que se llena en amarillo, anchos cómodos.
  const anchos: Record<string, number> = { [COL.codigo]: 18, [COL.marca]: 14, [COL.modelo]: 26, [COL.medida]: 14, [COL.stock]: 8 };
  columnas.forEach((nombre, i) => {
    const columna = hoja.getColumn(i + 1);
    columna.width = anchos[nombre] ?? 24;
    const seLlena = i >= fijas.length;
    if (nombre === COL.codigo) columna.numFmt = "@";
    if (nombre === COL.precioHoy || nombre === COL.precioEfectivo || (seLlena && nombre !== COL.aplica && nombre !== COL.porcentaje)) columna.numFmt = "0.00";
    const celda = hoja.getRow(1).getCell(i + 1);
    celda.font = { bold: true, color: { argb: seLlena ? "FF000000" : "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: seLlena ? "FFFFD54A" : "FF1F2937" } };
    celda.alignment = { vertical: "middle", wrapText: true };
    if (seLlena) {
      for (let r = 2; r <= hoja.rowCount; r++) {
        hoja.getRow(r).getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8DC" } };
      }
    }
  });
  hoja.getRow(1).height = 32;
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

  const ayuda = libro.addWorksheet("Cómo llenarlo");
  ayuda.getColumn(1).width = 110;
  const lineas = [
    `${tipo.nombre}${input.nombre ? ` — ${input.nombre}` : ""}`,
    "",
    "1. Llene SOLO las columnas amarillas de la hoja «Promoción». No cambie ni borre las demás columnas ni la fila de títulos.",
    ...COMO_LLENARLO[input.tipo].map((l, i) => `${i + 2}. ${l}`),
    `${COMO_LLENARLO[input.tipo].length + 2}. Las llantas que deje sin llenar quedan fuera de la promoción y siguen a su precio normal.`,
    `${COMO_LLENARLO[input.tipo].length + 3}. Guarde el archivo y súbalo en AutoVenta → Promociones. Antes de guardar va a ver cómo queda cada llanta.`,
    "",
    "Todos los precios son por llanta y CON IVA, que es como el bot se los dice al cliente.",
    "Puede usar el filtro de la fila de títulos para ver solo una marca o un aro.",
  ];
  lineas.forEach((l, i) => {
    ayuda.addRow([l]);
    if (i === 0) ayuda.getRow(1).font = { bold: true, size: 14 };
  });
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const claveDeColumna = (k: string) => k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const marcada = (v: string) => /^(x|si|s|1|ok|aplica|true|✓|✔)$/.test(claveDeColumna(v));

/** Un porcentaje escrito como «15», «15%», «15,5» o «0,15» (celda con formato de porcentaje). */
function porcentajeDelArchivo(texto: string): number | null {
  const n = numeroDelArchivo(String(texto ?? "").replace(/%/g, ""));
  if (n === null) return null;
  return n > 0 && n < 1 && !/%/.test(texto) ? round2(n * 100) : n;
}

/**
 * Lee el Excel que subió el negocio. Devuelve las filas LLENAS (las vacías no
 * son error: son llantas que quedan fuera) y los problemas del archivo en
 * palabras. No valida contra el inventario: eso lo hace `vistaPreviaDe`.
 */
export async function leerExcelDePromocion(
  tipo: TipoDePromocion,
  nombre: string,
  cuerpo: Buffer,
): Promise<{ filas: Array<FilaDePromocion & { filaDelExcel: number }>; sinLlenar: number; ilegibles: Array<{ fila: number; codigo: string; motivo: string }> }> {
  const definicion = tipoParaElPanel(tipo);
  const esperadas = [COL.codigo, COL.medida, COL.precioHoy, ...definicion.columnas];
  let crudas: Record<string, string>[];
  try {
    crudas = await filasDelArchivo(nombre, cuerpo, esperadas);
  } catch {
    throw new PromocionInvalida("No se pudo leer el archivo. Suba el Excel que bajó de esta pantalla (.xlsx, .xls o CSV).");
  }
  const filasLimpias = crudas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k === "__fila" ? k : claveDeColumna(k), String(v ?? "").trim()])));
  const col = (c: string) => claveDeColumna(c);
  const tiene = (c: string) => filasLimpias.some((f) => col(c) in f);
  if (!filasLimpias.length || !tiene(COL.codigo)) {
    throw new PromocionInvalida(`El archivo no tiene la columna «${COL.codigo}». Suba el Excel que bajó de esta pantalla, sin cambiarle los títulos.`);
  }
  const faltan = definicion.columnas.filter((c) => !tiene(c));
  if (faltan.length === definicion.columnas.length) {
    throw new PromocionInvalida(
      `El archivo no tiene ${faltan.length === 1 ? "la columna" : "las columnas"} ${faltan.map((c) => `«${c}»`).join(", ")}. `
      + `¿Es el Excel de otro tipo de promoción? Baje el de «${definicion.nombre}» y llene ese.`,
    );
  }

  const filas: Array<FilaDePromocion & { filaDelExcel: number }> = [];
  const ilegibles: Array<{ fila: number; codigo: string; motivo: string }> = [];
  let sinLlenar = 0;
  filasLimpias.forEach((f, i) => {
    const codigo = f[col(COL.codigo)] ?? "";
    if (!codigo) return;
    const filaDelExcel = Number(f.__fila) || i + 2;
    const medida = f[col(COL.medida)] || null;
    const texto = (c: string) => f[col(c)] ?? "";
    const numero = (c: string): number | null | "mal" => {
      const t = texto(c);
      if (!t) return null;
      const n = numeroDelArchivo(t);
      return n === null ? "mal" : n;
    };
    const mal = (c: string) => ilegibles.push({ fila: filaDelExcel, codigo, motivo: `«${texto(c)}» en «${c}» no es un número` });
    const base = { codigo, medida, filaDelExcel };
    switch (tipo) {
      case "precio_nuevo": {
        const n = numero(COL.precioNuevo);
        if (n === null) { sinLlenar += 1; return; }
        if (n === "mal") { mal(COL.precioNuevo); return; }
        filas.push({ ...base, precio: n });
        return;
      }
      case "porcentaje": {
        const t = texto(COL.porcentaje);
        if (!t) { sinLlenar += 1; return; }
        const n = porcentajeDelArchivo(t);
        if (n === null) { mal(COL.porcentaje); return; }
        filas.push({ ...base, porcentaje: n });
        return;
      }
      case "monto": {
        const n = numero(COL.monto);
        if (n === null) { sinLlenar += 1; return; }
        if (n === "mal") { mal(COL.monto); return; }
        filas.push({ ...base, monto: n });
        return;
      }
      case "por_llanta": {
        const columnas = [COL.llanta1, COL.llanta2, COL.llanta3, COL.llanta4];
        const valores = columnas.map((c) => numero(c));
        const malo = valores.findIndex((v) => v === "mal");
        if (malo >= 0) { mal(columnas[malo]); return; }
        if (valores.every((v) => v === null)) { sinLlenar += 1; return; }
        filas.push({ ...base, porLlanta: valores as Array<number | null> });
        return;
      }
      case "juego": {
        const j2 = numero(COL.juego2);
        const j4 = numero(COL.juego4);
        if (j2 === "mal") { mal(COL.juego2); return; }
        if (j4 === "mal") { mal(COL.juego4); return; }
        if (j2 === null && j4 === null) { sinLlenar += 1; return; }
        filas.push({ ...base, juego2: j2, juego4: j4 });
        return;
      }
      default: {
        const t = texto(COL.aplica);
        if (!t) { sinLlenar += 1; return; }
        if (!marcada(t)) { ilegibles.push({ fila: filaDelExcel, codigo, motivo: `«${t}» en «${COL.aplica}»: escriba una X para incluirla o déjela vacía` }); return; }
        filas.push(base);
      }
    }
  });
  return { filas, sinLlenar, ilegibles };
}

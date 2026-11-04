/**
 * Catálogo compartido por el Hub y el bot.
 *
 * La fuente la decide `fuentes/` EN CADA sincronización: Contífico (como
 * siempre), el archivo subido en el panel (Mundillantas: Fénix sin API) o
 * Google Sheets como respaldo de instalaciones antiguas. El catálogo se
 * normaliza una vez y se consulta desde memoria; una sincronización fallida
 * nunca borra el último snapshot válido.
 */
import { config } from "../config.js";
import {
  buscarConEscalera,
  buscarPorAro,
  resolveCatalogCandidates,
  searchCatalog,
  type CatalogItem,
  type ResultadoEscalera,
} from "../domain/catalog.js";
import { cargarArosDelCatalogo } from "../domain/aroProducto.js";
import { ordenarPorCercania, type Direccion } from "../domain/equivalencia.js";
import { mencionaProducto } from "../domain/guardianNoVendeSolo.js";
import { formatTireSize, type TireSize } from "../domain/tireSize.js";
import { fuenteDeCatalogo, type IdFuente } from "./fuentes/index.js";
import {
  ensureInterbotPricesFresh,
  getInterbotPrice,
  interbotDisponible,
  interbotPricesState,
} from "./interbotPrices.js";

export type { CatalogItem } from "../domain/catalog.js";

export interface SyncReport {
  ok: number;
  skipped: { row: number; reason: string }[];
  at: Date;
  source: IdFuente;
}

let items: CatalogItem[] = [];
let lastReport: SyncReport | null = null;
let lastError: string | null = null;
let syncInFlight: Promise<SyncReport> | null = null;

/**
 * Sobrescribe los precios calculados con los REALES del Interbot (7-ago: los
 * precios de venta se ponen ahí producto por producto y no siguen fórmula; los
 * divisores de normalizeContificoProduct solo aciertan el 27% del catálogo).
 * Los códigos que el Interbot no conoce conservan la fórmula como último recurso.
 *
 * Interbot es de quien tiene su snapshot en `assets/<negocio>/` (hoy: Depot).
 * Sin él no hace nada y no ensucia el log: otro cliente no hereda los precios
 * de Depot aunque un código de Fénix coincida con uno suyo (R-23).
 */
export function applyInterbotPrices(list: CatalogItem[]): number {
  if (!interbotDisponible()) return 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let applied = 0;
  for (const item of list) {
    const ib = getInterbotPrice(item.code);
    if (!ib) continue;
    // Precio hoy = el de venta del vendedor; si hay promo vigente, la promo.
    const hoy = ib.tienePromo && ib.precioPromoConIva ? ib.precioPromoConIva : ib.pvpMinConIva;
    item.minimumPriceWithTax = hoy;
    // El tachado solo vale si de verdad es mayor; si no, sin tachado engañoso.
    item.customerPriceWithTax = ib.pvpFullConIva > hoy ? ib.pvpFullConIva : hoy;
    item.price = round2(item.customerPriceWithTax / (1 + item.taxRate));
    applied += 1;
  }
  const st = interbotPricesState();
  console.log(
    `💲 Precios Interbot aplicados: ${applied}/${list.length} (fuente ${st.source}${st.at ? `, ${st.at.toISOString()}` : ""})`,
  );
  return applied;
}

export async function syncCatalog(): Promise<SyncReport> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      const fuente = await fuenteDeCatalogo();
      if (!fuente) throw new Error("Catálogo no configurado");
      if (fuente.id === "contifico") {
        // Nunca lanza: si el Interbot no responde, quedan el último barrido
        // bueno o el snapshot de assets/, y el catálogo sigue sincronizando.
        await ensureInterbotPricesFresh();
      }
      const resultado = await fuente.sincronizar();
      if (fuente.id === "contifico") applyInterbotPrices(resultado.items);
      items = resultado.items;
      cargarArosDelCatalogo(resultado.aros);
      lastReport = resultado.report;
      lastError = null;
      return lastReport;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Error de sincronización";
      throw error;
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

export async function ensureCatalogReady(): Promise<SyncReport> {
  if (items.length > 0 && lastReport) return lastReport;
  return syncCatalog();
}

export function startCatalogSync(): void {
  const intervalMs =
    config.contifico?.syncIntervalMs ?? config.catalog?.syncIntervalMs ?? 5 * 60_000;
  if (!config.contifico && !config.catalog) {
    // Puede haber (o llegar) un catálogo subido en el panel: no se sale
    // temprano. Si tampoco hay archivo, cada intento lo dice en el log.
    console.warn("⚠️ Sin Contífico ni Sheets: el catálogo saldrá del archivo subido en el panel.");
  }
  const run = () =>
    syncCatalog()
      .then((r) => {
        console.log(`📋 Catálogo ${r.source}: ${r.ok} llantas (${r.skipped.length} omitidas)`);
      })
      .catch((err) =>
        console.error(
          "❌ Error sincronizando catálogo:",
          err instanceof Error ? err.message : "error desconocido",
        ),
      );
  run();
  setInterval(run, intervalMs).unref();
}

/** Búsqueda exacta por medida (con o sin stock, el agente decide qué decir). */
export function searchBySize(size: TireSize): CatalogItem[] {
  return items.filter(
    (item) =>
      item.size !== null &&
      item.size.width === size.width &&
      item.size.rim === size.rim &&
      (size.aspect === null || item.size.aspect === size.aspect),
  );
}

/** Búsqueda estilo Interbot: medida, código, marca, diseño o combinación. */
export function searchByText(query: string, limit = 40): CatalogItem[] {
  return searchCatalog(items, query, limit);
}

/**
 * TODO el aro, sin tope: la única forma de no esconder stock.
 *
 * `searchByText("R17", 60)` parecía servir para esto y no servía — puntúa,
 * ordena y corta, así que en los aros grandes dejaba fuera decenas de llantas,
 * y las medidas en pulgadas no entraban nunca. Ver `domain/catalog.ts`.
 */
export function searchByRim(aro: number): CatalogItem[] {
  return buscarPorAro(items, aro);
}

/**
 * Productos reales que aparecen nombrados en un texto.
 *
 * Nació por las correcciones de las convs 11986 y 11972 (27-ago-2026): el
 * Ángel Guardián leyó el catálogo y agregó modelos que el borrador no traía.
 * El candado posterior necesita comparar contra el catálogo completo —no solo
 * contra la medida pedida— porque inventar una llanta de otra medida también
 * tiene que frenarse.
 */
export function productosDelCatalogoMencionados(texto: string): CatalogItem[] {
  return items.filter((item) => mencionaProducto(texto, item));
}

/** Búsqueda en escalera sobre el catálogo cargado (ver domain/catalog.ts). */
export function searchWithLadder(query: string, limit = 8): ResultadoEscalera {
  return buscarConEscalera(items, query, limit);
}

/**
 * Alternativas para cuando no hay la medida exacta: las que DE VERDAD le montan.
 *
 * Era «mismo aro y ancho ±10 mm», y el ancho solo no alcanza: una 225/40R18
 * está a 10 mm de una 235/45R18 y tiene 4,8 % menos de diámetro exterior —
 * otra llanta. Conv 18100 (9-sep): el cliente pidió 235/45R18 y en la misma
 * imagen recibió una 225/40R18 y una 225/55R18, una 5 % más baja y la otra 5 %
 * más alta, las dos presentadas como «equivalentes de su aro».
 *
 * Ahora el corte es el del taller: el diámetro dentro del 3 % (ver
 * `domain/equivalencia.ts`), y salen ordenadas de la más parecida a la menos,
 * no de la más barata a la más cara.
 */
export function searchAlternatives(size: TireSize, direccion: Direccion | null = null): CatalogItem[] {
  const pedida = formatTireSize(size);
  const mismoAro = items.filter(
    (item) =>
      item.size !== null &&
      item.size.rim === size.rim &&
      !(item.size.width === size.width && item.size.aspect === size.aspect) &&
      item.stock > 0,
  );
  // Con dirección («más ancha», conv 22975) solo quedan las que van para ese lado.
  return ordenarPorCercania(mismoAro, pedida, direccion);
}

export function findByCode(code: string): CatalogItem | undefined {
  return items.find((item) => item.code.toLowerCase() === code.toLowerCase());
}

/**
 * Resuelve la referencia que el agente conserva de una opción. Meta/LLM puede
 * devolver el código Contífico, el id o el diseño visible (p. ej. "KR203").
 *
 * Devuelve la LISTA de candidatos, no uno solo: ver `resolveCatalogCandidates`.
 * Quien llama distingue «no existe» (vacío) de «¿cuál de estas?» (varios), que
 * son dos respuestas muy distintas para el cliente.
 */
export function catalogCandidates(reference: string, sizeLabel?: string | null): CatalogItem[] {
  return resolveCatalogCandidates(items, reference, sizeLabel);
}

/** La referencia resuelta a UNA llanta, o undefined si no es inequívoca. */
export function resolveCatalogReference(
  reference: string,
  sizeLabel?: string | null,
): CatalogItem | undefined {
  const candidatos = catalogCandidates(reference, sizeLabel);
  return candidatos.length === 1 ? candidatos[0] : undefined;
}

export function findById(id: string): CatalogItem | undefined {
  return items.find((item) => item.id === id);
}

export function catalogStatus(): {
  items: number;
  lastSync: Date | null;
  source: IdFuente | null;
  error: string | null;
  /** Filas que la última sincronización dejó fuera, con su motivo (R-22). */
  descartadas: { row: number; reason: string }[];
} {
  return {
    items: items.length,
    lastSync: lastReport?.at ?? null,
    source: lastReport?.source ?? null,
    error: lastError,
    descartadas: lastReport?.skipped ?? [],
  };
}

export function catalogInventoryMetrics() {
  const available = items.filter((item) => item.availability === "available").length;
  const check = items.filter((item) => item.availability === "check").length;
  const out = items.filter((item) => item.availability === "out").length;
  const withImage = items.filter((item) => Boolean(item.imageUrl)).length;
  return {
    total: items.length,
    available,
    check,
    out,
    withImage,
    imageCoverage: items.length ? Math.round((withImage / items.length) * 100) : 0,
    brands: new Set(items.map((item) => item.brand).filter(Boolean)).size,
    source: lastReport?.source ?? null,
    lastSync: lastReport?.at?.toISOString() ?? null,
  };
}

export function catalogMediaReport() {
  const designs = new Map<
    string,
    {
      brand: string;
      design: string;
      products: number;
      activeProducts: number;
      imageUrl: string | null;
      imageSource: string | null;
    }
  >();

  for (const item of items) {
    const key = `${item.brand.trim().toLowerCase()}:${item.design.trim().toLowerCase()}`;
    const current = designs.get(key);
    if (current) {
      current.products += 1;
      if (item.availability !== "out") current.activeProducts += 1;
      current.imageUrl ||= item.imageUrl;
      current.imageSource ||= item.imageSource;
      continue;
    }
    designs.set(key, {
      brand: item.brand,
      design: item.design,
      products: 1,
      activeProducts: item.availability === "out" ? 0 : 1,
      imageUrl: item.imageUrl,
      imageSource: item.imageSource,
    });
  }

  const rows = [...designs.values()].sort((a, b) =>
    `${a.brand} ${a.design}`.localeCompare(`${b.brand} ${b.design}`, "es"),
  );
  const active = rows.filter((row) => row.activeProducts > 0);
  const missing = active.filter((row) => !row.imageUrl);
  return {
    designs: rows.length,
    activeDesigns: active.length,
    coveredActiveDesigns: active.length - missing.length,
    coverage: active.length
      ? Math.round(((active.length - missing.length) / active.length) * 100)
      : 0,
    missing,
    items: rows,
  };
}

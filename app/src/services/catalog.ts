/**
 * Catálogo compartido por el Hub y el bot.
 *
 * Fuente primaria: Contífico (productos, precios y stock). Google Sheets queda
 * como fallback para instalaciones antiguas. El catálogo se normaliza una vez
 * y se consulta desde memoria; una sincronización fallida nunca borra el
 * último snapshot válido.
 */
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { config } from "../config.js";
import {
  availabilityFromStock,
  buscarConEscalera,
  normalizeContificoProduct,
  resolveCatalogCandidates,
  searchCatalog,
  type CatalogItem,
  type ContificoProductWire,
  type ResultadoEscalera,
} from "../domain/catalog.js";
import { mencionaProducto } from "../domain/guardianNoVendeSolo.js";
import { extractTireSizes, formatTireSize, type TireSize } from "../domain/tireSize.js";
import {
  ensureInterbotPricesFresh,
  getInterbotPrice,
  interbotPricesState,
} from "./interbotPrices.js";

export type { CatalogItem } from "../domain/catalog.js";

export interface SyncReport {
  ok: number;
  skipped: { row: number; reason: string }[];
  at: Date;
  source: "contifico" | "sheets";
}

let items: CatalogItem[] = [];
let lastReport: SyncReport | null = null;
let lastError: string | null = null;
let syncInFlight: Promise<SyncReport> | null = null;

function getCell(row: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

async function syncSheetsCatalog(): Promise<SyncReport> {
  if (!config.catalog) throw new Error("Catálogo de Sheets no configurado");
  const auth = new JWT({
    email: config.catalog.serviceAccountEmail,
    key: config.catalog.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const doc = new GoogleSpreadsheet(config.catalog.sheetId, auth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  const next: CatalogItem[] = [];
  const skipped: SyncReport["skipped"] = [];

  rows.forEach((row, i) => {
    const raw = row.toObject() as Record<string, unknown>;
    // Normaliza claves a minúsculas para tolerar "Marca" vs "marca"
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) data[k.toLowerCase()] = v;

    const rowNum = i + 2; // +1 encabezado, +1 índice desde 1
    const medida = getCell(data, "medida", "size");
    const sizes = extractTireSizes(medida);
    if (sizes.length !== 1) {
      skipped.push({ row: rowNum, reason: `medida no reconocida: "${medida}"` });
      return;
    }
    const price = Number(getCell(data, "precio", "price").replace(/[$,]/g, ""));
    if (!Number.isFinite(price) || price <= 0) {
      skipped.push({ row: rowNum, reason: "precio inválido" });
      return;
    }
    const stock = Number(getCell(data, "stock", "cantidad") || "0");

    const size = sizes[0];
    next.push({
      id: getCell(data, "codigo", "código", "code") || `ROW${rowNum}`,
      code: getCell(data, "codigo", "código", "code") || `ROW${rowNum}`,
      name: [
        getCell(data, "marca", "brand"),
        getCell(data, "diseno", "diseño", "modelo", "design"),
        formatTireSize(size),
      ]
        .filter(Boolean)
        .join(" "),
      brand: getCell(data, "marca", "brand"),
      design: getCell(data, "diseno", "diseño", "modelo", "design"),
      size,
      sizeLabel: formatTireSize(size),
      price,
      sourcePrice: price,
      priceTier: "pvp1",
      prices: { pvp1: price, pvp2: null, pvp3: null, pvp4: null },
      taxRate: 0,
      customerPriceWithTax: price,
      minimumPriceWithTax: price,
      distributorPriceWithTax: price,
      stock: Number.isFinite(stock) ? stock : 0,
      availability: availabilityFromStock(Number.isFinite(stock) ? stock : 0),
      imageUrl: null,
      imageSource: null,
      loadSpeed: null,
      active: true,
      source: "sheets",
    });
  });

  items = next;
  return { ok: next.length, skipped, at: new Date(), source: "sheets" };
}

async function syncContificoCatalog(): Promise<{ report: SyncReport; items: CatalogItem[] }> {
  if (!config.contifico) throw new Error("Contífico no configurado");
  const next: CatalogItem[] = [];
  const skipped: SyncReport["skipped"] = [];
  let page = 1;
  let loaded = 0;
  let total: number | null = null;

  while (page <= 100) {
    const url = new URL(`${config.contifico.baseUrl}/producto/`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("estado", "A");
    const response = await fetchWithTimeout(url, config.contifico.apiKey);
    if (!response.ok) {
      throw new Error(`Contífico respondió HTTP ${response.status} al leer productos`);
    }
    const payload = (await response.json()) as
      | ContificoProductWire[]
      | { count?: unknown; next?: unknown; results?: ContificoProductWire[] };
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.results)
        ? payload.results
        : [];
    if (!Array.isArray(payload) && typeof payload.count === "number") total = payload.count;

    rows.forEach((row, index) => {
      const item = normalizeContificoProduct(row, config.contifico!.customerPriceTier, {
        customerDivisor: config.contifico!.customerPriceDivisor,
        minimumDivisor: config.contifico!.minimumPriceDivisor,
      });
      if (item?.sizeLabel) next.push(item);
      else {
        skipped.push({
          row: loaded + index + 1,
          reason: item ? `producto sin medida reconocible: "${item.name}"` : "producto inválido o sin precio",
        });
      }
    });

    loaded += rows.length;
    if (rows.length === 0) break;
    if (total !== null && loaded >= total) break;
    if (!Array.isArray(payload) && !payload.next && rows.length < 100) break;
    if (Array.isArray(payload) && rows.length < 100) break;
    page += 1;
  }

  if (next.length === 0) throw new Error("Contífico no devolvió llantas cotizables");
  applyInterbotPrices(next);
  return {
    items: next,
    report: { ok: next.length, skipped, at: new Date(), source: "contifico" },
  };
}

/**
 * Sobrescribe los precios calculados con los REALES del Interbot (7-ago: los
 * precios de venta se ponen ahí producto por producto y no siguen fórmula; los
 * divisores de normalizeContificoProduct solo aciertan el 27% del catálogo).
 * Los códigos que el Interbot no conoce conservan la fórmula como último recurso.
 */
export function applyInterbotPrices(list: CatalogItem[]): number {
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

async function fetchWithTimeout(url: URL, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Contífico agotó el tiempo de respuesta");
    }
    throw new Error("No se pudo conectar con Contífico");
  } finally {
    clearTimeout(timeout);
  }
}

export async function syncCatalog(): Promise<SyncReport> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      if (config.contifico) {
        // Nunca lanza: si el Interbot no responde, quedan el último barrido
        // bueno o el snapshot de assets/, y el catálogo sigue sincronizando.
        await ensureInterbotPricesFresh();
        const synced = await syncContificoCatalog();
        items = synced.items;
        lastReport = synced.report;
      } else if (config.catalog) {
        const report = await syncSheetsCatalog();
        lastReport = report;
      } else {
        throw new Error("Catálogo no configurado");
      }
      lastError = null;
      if (!lastReport) throw new Error("La sincronización no produjo un reporte");
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
    console.warn("⚠️ Catálogo no configurado. El bot no cotizará hasta conectar Contífico.");
    return;
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

/** Alternativas: mismo aro, ancho ±10mm (para cuando no hay la medida exacta). */
export function searchAlternatives(size: TireSize): CatalogItem[] {
  return items.filter(
    (item) =>
      item.size !== null &&
      item.size.rim === size.rim &&
      Math.abs(item.size.width - size.width) <= 10 &&
      !(item.size.width === size.width && item.size.aspect === size.aspect) &&
      item.stock > 0,
  );
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
  source: "contifico" | "sheets" | null;
  error: string | null;
} {
  return {
    items: items.length,
    lastSync: lastReport?.at ?? null,
    source: lastReport?.source ?? null,
    error: lastError,
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

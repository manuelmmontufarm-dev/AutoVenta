/**
 * Catálogo de llantas: Google Sheets del dueño como fuente de verdad,
 * sincronizado a un cache en memoria cada N minutos.
 *
 * Reusa: google-spreadsheet (theoephraim/node-google-spreadsheet, MIT).
 *
 * Columnas esperadas en la hoja (fila 1 = encabezados, sin distinguir mayúsculas):
 *   codigo | marca | diseno | medida | precio | stock
 * "medida" acepta cualquier formato que entienda el parser ("185/65R14", "185 65 14"…).
 */
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { config } from "../config.js";
import {
  extractTireSizes,
  formatTireSize,
  type TireSize,
} from "../domain/tireSize.js";

export interface CatalogItem {
  code: string;
  brand: string;
  design: string;
  size: TireSize;
  sizeLabel: string;
  /** Precio unitario SIN IVA. */
  price: number;
  stock: number;
}

export interface SyncReport {
  ok: number;
  skipped: { row: number; reason: string }[];
  at: Date;
}

let items: CatalogItem[] = [];
let lastReport: SyncReport | null = null;

function getCell(row: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

export async function syncCatalog(): Promise<SyncReport> {
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

    next.push({
      code: getCell(data, "codigo", "código", "code") || `ROW${rowNum}`,
      brand: getCell(data, "marca", "brand"),
      design: getCell(data, "diseno", "diseño", "modelo", "design"),
      size: sizes[0],
      sizeLabel: formatTireSize(sizes[0]),
      price,
      stock: Number.isFinite(stock) ? stock : 0,
    });
  });

  items = next;
  lastReport = { ok: next.length, skipped, at: new Date() };
  return lastReport;
}

export function startCatalogSync(): void {
  const run = () =>
    syncCatalog()
      .then((r) => {
        console.log(`📋 Catálogo: ${r.ok} items (${r.skipped.length} filas ignoradas)`);
        if (r.skipped.length > 0) console.warn(r.skipped);
      })
      .catch((err) => console.error("❌ Error sincronizando catálogo:", err));
  run();
  setInterval(run, config.catalog.syncIntervalMs);
}

/** Búsqueda exacta por medida (con o sin stock, el agente decide qué decir). */
export function searchBySize(size: TireSize): CatalogItem[] {
  return items.filter(
    (item) =>
      item.size.width === size.width &&
      item.size.rim === size.rim &&
      (size.aspect === null || item.size.aspect === size.aspect),
  );
}

/** Alternativas: mismo aro, ancho ±10mm (para cuando no hay la medida exacta). */
export function searchAlternatives(size: TireSize): CatalogItem[] {
  return items.filter(
    (item) =>
      item.size.rim === size.rim &&
      Math.abs(item.size.width - size.width) <= 10 &&
      !(item.size.width === size.width && item.size.aspect === size.aspect) &&
      item.stock > 0,
  );
}

export function findByCode(code: string): CatalogItem | undefined {
  return items.find((item) => item.code.toLowerCase() === code.toLowerCase());
}

export function catalogStatus(): { items: number; lastSync: Date | null } {
  return { items: items.length, lastSync: lastReport?.at ?? null };
}

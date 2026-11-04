/**
 * Fuente Google Sheets: el respaldo para instalaciones sin Contífico.
 *
 * Vivía en `services/catalog.ts:56-126`; se movió acá sin cambiar lo que
 * produce. La normalización de una fila (medida → CatalogItem) se separó en
 * `normalizarFilaDeCatalogo` porque la fuente `archivo` normaliza igual: una
 * fila es una fila, venga de una Sheet o de un Excel de Fénix.
 */
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { config } from "../../config.js";
import { availabilityFromStock, type CatalogItem } from "../../domain/catalog.js";
import { extractTireSizes, formatTireSize } from "../../domain/tireSize.js";
import type { FuenteDeCatalogo, IdFuente, ReporteDeCatalogo } from "./tipos.js";

export function getCell(row: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

export interface FilaCruda {
  medida: string;
  marca: string;
  diseno: string;
  codigo: string;
  nombre?: string;
  precio: string;
  stock: string;
  foto?: string;
  filaNumero: number;
}

/**
 * Una fila de catálogo → CatalogItem, con los MISMOS criterios de siempre
 * (medida única reconocible, precio > 0). Los precios opcionales con IVA
 * (lista/mínimo) los usa la fuente `archivo`; la Sheet no los trae y quedan
 * iguales al precio, como hoy.
 */
export function normalizarFilaDeCatalogo(
  fila: FilaCruda,
  source: IdFuente,
  precios?: { conIva: number; listaConIva: number; minimoConIva: number; taxRate: number },
): { item: CatalogItem | null; motivo: string | null } {
  const sizes = extractTireSizes(fila.medida);
  if (sizes.length !== 1) {
    return { item: null, motivo: `medida no reconocida: "${fila.medida}"` };
  }
  const price = Number(fila.precio.replace(/[$,]/g, ""));
  if (!Number.isFinite(price) || price <= 0) {
    return { item: null, motivo: "precio inválido" };
  }
  const stock = Number(fila.stock || "0");
  const size = sizes[0];
  const conIva = precios?.conIva ?? price;
  const listaConIva = precios?.listaConIva ?? price;
  const minimoConIva = precios?.minimoConIva ?? price;
  const taxRate = precios?.taxRate ?? 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // Mismo criterio que el Interbot: el tachado solo vale si de verdad es mayor.
  const customer = listaConIva > minimoConIva ? listaConIva : minimoConIva;
  return {
    motivo: null,
    item: {
      id: fila.codigo || `ROW${fila.filaNumero}`,
      code: fila.codigo || `ROW${fila.filaNumero}`,
      name:
        fila.nombre?.trim() ||
        [fila.marca, fila.diseno, formatTireSize(size)].filter(Boolean).join(" "),
      brand: fila.marca,
      design: fila.diseno,
      size,
      sizeLabel: formatTireSize(size),
      price: precios ? round2(customer / (1 + taxRate)) : price,
      sourcePrice: price,
      priceTier: "pvp1",
      prices: { pvp1: price, pvp2: null, pvp3: null, pvp4: null },
      taxRate,
      // Sin `precios` (la Sheet) los tres son el precio tal cual, sin redondear:
      // lo que producía `syncSheetsCatalog` byte a byte.
      customerPriceWithTax: precios ? round2(customer) : price,
      minimumPriceWithTax: precios ? round2(minimoConIva) : price,
      distributorPriceWithTax: precios ? round2(conIva) : price,
      stock: Number.isFinite(stock) ? stock : 0,
      availability: availabilityFromStock(Number.isFinite(stock) ? stock : 0),
      imageUrl: fila.foto?.trim() || null,
      imageSource: null,
      loadSpeed: null,
      active: true,
      source,
    },
  };
}

async function sincronizarSheets(): Promise<{ items: CatalogItem[]; report: ReporteDeCatalogo }> {
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
  const skipped: ReporteDeCatalogo["skipped"] = [];

  rows.forEach((row, i) => {
    const raw = row.toObject() as Record<string, unknown>;
    // Normaliza claves a minúsculas para tolerar "Marca" vs "marca"
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) data[k.toLowerCase()] = v;

    const rowNum = i + 2; // +1 encabezado, +1 índice desde 1
    const { item, motivo } = normalizarFilaDeCatalogo(
      {
        medida: getCell(data, "medida", "size"),
        marca: getCell(data, "marca", "brand"),
        diseno: getCell(data, "diseno", "diseño", "modelo", "design"),
        codigo: getCell(data, "codigo", "código", "code"),
        precio: getCell(data, "precio", "price"),
        stock: getCell(data, "stock", "cantidad"),
        filaNumero: rowNum,
      },
      "sheets",
    );
    if (item) next.push(item);
    else skipped.push({ row: rowNum, reason: motivo ?? "fila inválida" });
  });

  return { items: next, report: { ok: next.length, skipped, at: new Date(), source: "sheets" } };
}

export const fuenteSheetsCatalogo: FuenteDeCatalogo = {
  id: "sheets",
  async sincronizar() {
    const { items, report } = await sincronizarSheets();
    return { items, aros: [], report };
  },
};

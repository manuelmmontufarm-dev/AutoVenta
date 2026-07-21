/**
 * PDFs comerciales del cotizador.
 *
 * - Comparativa: 2-3 modelos alternativos, sin total combinado.
 * - Cotización: un modelo elegido, cantidad y total final.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import pdfmake from "pdfmake";
import helvetica from "pdfmake/standard-fonts/Helvetica.js";
import { PDFDocument } from "pdf-lib";
import { business } from "../config.js";
import type { CatalogItem } from "../domain/catalog.js";
import { warrantyForBrand } from "./quoteMessages.js";

pdfmake.addFonts(helvetica);

/**
 * PDF de cotización a partir del PNG renderizado (mismo diseño que la imagen —
 * una sola pieza visual que mantener). Página a la medida del PNG, ancho A4.
 */
export async function pngToQuotePdf(png: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(png);
  const width = 595.28; // ancho A4 en puntos
  const height = (image.height / image.width) * width;
  const page = doc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  return Buffer.from(await doc.save());
}

export interface QuoteLine {
  code: string;
  description: string;
  quantity: number;
  /** Precio de venta antes de IVA. */
  unitPrice: number;
  brand?: string;
  design?: string;
  sizeLabel?: string | null;
  listPriceWithTax?: number;
  salePriceWithTax?: number;
  availability?: CatalogItem["availability"];
  imageUrl?: string | null;
  loadSpeed?: CatalogItem["loadSpeed"];
  warrantyFactory?: string;
  warrantyRoadHazard?: string | null;
}

export interface Quote {
  number: string;
  customerName: string;
  customerPhone: string;
  lines: QuoteLine[];
  subtotal: number;
  tax: number;
  total: number;
}

const NAVY = "#14213d";
const RED = "#d62828";
const CREAM = "#f7f3ea";
const PAPER = "#fffdf7";
const GREEN = "#14835d";
const GOLD = "#f4bd4f";
const MUTED = "#667085";
const BORDER = "#dfe3ea";

export function buildQuote(
  lines: QuoteLine[],
  customerName: string,
  customerPhone: string,
): Quote {
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const tax = subtotal * business.taxRate;
  return {
    number: `COT-${Date.now().toString(36).toUpperCase()}`,
    customerName,
    customerPhone,
    lines,
    subtotal: round2(subtotal),
    tax: round2(tax),
    total: round2(subtotal + tax),
  };
}

export async function renderQuotePdf(quote: Quote): Promise<Buffer> {
  const line = quote.lines[0];
  if (quote.lines.length === 1 && line?.brand && line.design && line.salePriceWithTax) {
    const image = await localImageData(line.imageUrl);
    return pdfmake.createPdf(singleQuoteDocument(quote, line, image) as never).getBuffer();
  }
  return pdfmake.createPdf(legacyQuoteDocument(quote) as never).getBuffer();
}

export async function renderComparisonPdf(products: readonly CatalogItem[]): Promise<Buffer> {
  if (products.length < 2 || products.length > 3) {
    throw new Error("La comparativa requiere dos o tres llantas");
  }
  const images = await Promise.all(products.map((product) => localImageData(product.imageUrl)));
  return pdfmake
    .createPdf(comparisonDocument(products, images) as never)
    .getBuffer();
}

function comparisonDocument(products: readonly CatalogItem[], images: (string | null)[]) {
  const date = dateLabel();
  const columns = products.map((product, index) => {
    const warranty = warrantyForBrand(product.brand);
    const spec = specLabel(product);
    return {
      width: "*",
      margin: [6, 0, 6, 0],
      stack: [
        {
          table: {
            widths: ["*"],
            body: [
              [
                images[index]
                  ? {
                      image: images[index],
                      fit: [205, 205],
                      alignment: "center",
                      margin: [4, 8, 4, 8],
                    }
                  : photoPlaceholder(product.brand),
              ],
            ],
          },
          layout: cardLayout,
        },
        {
          text: product.brand.toUpperCase(),
          color: brandColor(product.brand),
          bold: true,
          fontSize: 19,
          alignment: "center",
          margin: [0, 12, 0, 2],
        },
        {
          text: product.design,
          bold: true,
          fontSize: 17,
          alignment: "center",
          color: NAVY,
        },
        {
          text: product.sizeLabel ?? product.name,
          fontSize: 10,
          alignment: "center",
          color: MUTED,
          margin: [0, 3, 0, 10],
        },
        {
          text: money(product.minimumPriceWithTax),
          fontSize: 25,
          bold: true,
          alignment: "center",
          color: RED,
        },
        {
          columns: [
            {
              text: `Antes ${money(product.customerPriceWithTax)}`,
              decoration: "lineThrough",
              color: MUTED,
              fontSize: 9,
              alignment: "right",
            },
            {
              text: `-${discount(product)}%`,
              color: GREEN,
              bold: true,
              fontSize: 9,
              alignment: "left",
              margin: [7, 0, 0, 0],
            },
          ],
          margin: [0, 2, 0, 9],
        },
        {
          table: {
            widths: ["*", "*"],
            body: [
              [
                warrantyBadge(`${warranty.roadHazardMonths ?? "-"} MESES`, "Golpes"),
                warrantyBadge("5 AÑOS", "Fábrica"),
              ],
            ],
          },
          layout: gapLayout,
        },
        {
          text: spec ? `Índice ${spec}` : "Índice por confirmar",
          alignment: "center",
          color: spec ? NAVY : MUTED,
          bold: Boolean(spec),
          fontSize: 10,
          margin: [0, 10, 0, 3],
        },
        {
          text: availabilityLabel(product.availability),
          alignment: "center",
          color: availabilityColor(product.availability),
          bold: true,
          fontSize: 9,
        },
      ],
    };
  });

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [24, 20, 24, 22],
    defaultStyle: { font: "Helvetica", color: NAVY },
    content: [
      headerBlock("COMPARATIVA DE LLANTAS", date),
      { columns, columnGap: 2 },
      {
        text: "Precios por unidad. La disponibilidad se confirma al momento de la compra.",
        alignment: "center",
        color: MUTED,
        fontSize: 8,
        margin: [0, 13, 0, 0],
      },
    ],
  };
}

function singleQuoteDocument(quote: Quote, line: QuoteLine, image: string | null) {
  const quantity = line.quantity;
  const listPrice = line.listPriceWithTax ?? quote.total;
  const salePrice = line.salePriceWithTax ?? quote.total / quantity;
  const saving = round2(listPrice - salePrice);
  const warranty = {
    factory: line.warrantyFactory ?? "5 años contra defectos de fabricación",
    roadHazard: line.warrantyRoadHazard ?? "Cobertura por golpes y estalladuras",
  };
  return {
    pageSize: "A4",
    pageMargins: [34, 20, 34, 24],
    defaultStyle: { font: "Helvetica", color: NAVY },
    content: [
      headerBlock("COTIZACIÓN DE LLANTA", `${dateLabel()} · ${quote.number}`),
      {
        columns: [
          {
            width: 235,
            table: {
              widths: ["*"],
              body: [
                [
                  image
                    ? { image, fit: [215, 245], alignment: "center", margin: [4, 8, 4, 8] }
                    : photoPlaceholder(line.brand ?? ""),
                ],
              ],
            },
            layout: cardLayout,
          },
          {
            width: "*",
            margin: [24, 8, 0, 0],
            stack: [
              { text: (line.brand ?? "").toUpperCase(), bold: true, color: brandColor(line.brand ?? ""), fontSize: 25 },
              { text: line.design ?? line.description, bold: true, fontSize: 23, margin: [0, 5, 0, 0] },
              { text: line.sizeLabel ?? "", color: MUTED, bold: true, fontSize: 15, margin: [0, 4, 0, 14] },
              { text: "ÍNDICE DE CARGA Y VELOCIDAD", color: MUTED, bold: true, fontSize: 8, characterSpacing: 1.2 },
              { text: line.loadSpeed ? loadSpeedLabel(line.loadSpeed) : "Por confirmar", bold: true, fontSize: 13, margin: [0, 6, 0, 10] },
              {
                text: availabilityLabel(line.availability ?? "check"),
                color: availabilityColor(line.availability ?? "check"),
                bold: true,
                fontSize: 11,
              },
            ],
          },
        ],
      },
      {
        table: {
          widths: ["*", "*"],
          body: [
            [
              {
                stack: [
                  { text: "PRECIO LISTA", color: MUTED, bold: true, fontSize: 8, characterSpacing: 1.2 },
                  { text: money(listPrice), decoration: "lineThrough", color: MUTED, bold: true, fontSize: 18, margin: [0, 8, 0, 4] },
                  { text: `Ahorras ${money(saving)} · -${Math.round((1 - salePrice / listPrice) * 100)}%`, color: GREEN, bold: true, fontSize: 10 },
                ],
                margin: [14, 12, 14, 12],
              },
              {
                stack: [
                  { text: "PRECIO HOY", color: RED, bold: true, fontSize: 8, alignment: "right", characterSpacing: 1.2 },
                  { text: money(salePrice), color: NAVY, bold: true, fontSize: 27, alignment: "right", margin: [0, 5, 0, 2] },
                  { text: "IVA y Ecovalor incluidos · por unidad", color: MUTED, fontSize: 8, alignment: "right" },
                ],
                margin: [14, 12, 14, 12],
              },
            ],
          ],
        },
        layout: cardLayout,
        margin: [0, 22, 0, 14],
      },
      {
        columns: [
          warrantyCard("GARANTÍA CONTRA GOLPES", warranty.roadHazard, "#fff0ef", RED),
          warrantyCard("GARANTÍA DE FÁBRICA", warranty.factory, "#edf2ff", "#315bd9"),
        ],
        columnGap: 12,
      },
      {
        table: {
          widths: ["*", "auto"],
          body: [
            [
              {
                stack: [
                  { text: quote.customerName || "Cliente", bold: true, fontSize: 11 },
                  { text: `${quantity} llanta${quantity === 1 ? "" : "s"} · ${line.brand} ${line.design}`, color: MUTED, fontSize: 9, margin: [0, 3, 0, 0] },
                ],
              },
              {
                stack: [
                  { text: "TOTAL", color: MUTED, bold: true, alignment: "right", fontSize: 8 },
                  { text: money(quote.total), color: RED, bold: true, alignment: "right", fontSize: 23 },
                ],
              },
            ],
          ],
        },
        layout: totalLayout,
        margin: [0, 16, 0, 0],
      },
      {
        text: "Válida por 3 días o hasta agotar stock. Instalación y retiro se coordinan con el asesor.",
        alignment: "center",
        color: MUTED,
        fontSize: 8,
        margin: [0, 13, 0, 0],
      },
    ],
  };
}

function headerBlock(title: string, detail: string) {
  return {
    stack: [
      {
        table: {
          widths: ["*"],
          heights: [6],
          body: [[{ text: "", fillColor: RED }]],
        },
        layout: "noBorders",
      },
      {
        table: {
          widths: ["*", "*"],
          body: [
            [
              {
                stack: [
                  { text: "DEPOT TIRE", bold: true, color: "white", fontSize: 22 },
                  { text: title, bold: true, color: GOLD, fontSize: 9, characterSpacing: 1.1 },
                ],
                fillColor: NAVY,
                margin: [14, 10, 14, 10],
              },
              {
                stack: [
                  { text: detail, alignment: "right", color: "white", bold: true, fontSize: 11 },
                  { text: "IVA Y ECOVALOR · VÁLIDA 3 DÍAS", alignment: "right", color: "#dce4f3", fontSize: 8, margin: [0, 5, 0, 0] },
                ],
                fillColor: NAVY,
                margin: [14, 10, 14, 10],
              },
            ],
          ],
        },
        layout: "noBorders",
      },
    ],
    margin: [0, 0, 0, 16],
  };
}

function legacyQuoteDocument(quote: Quote) {
  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 60],
    defaultStyle: { font: "Helvetica", fontSize: 10, color: NAVY },
    content: [
      { text: business.name.toUpperCase(), fontSize: 22, bold: true, color: NAVY },
      { text: `Cotización ${quote.number} · ${dateLabel()}`, color: MUTED, margin: [0, 2, 0, 20] },
      {
        table: {
          headerRows: 1,
          widths: ["auto", "*", "auto", "auto", "auto"],
          body: [
            ["Código", "Descripción", "Cant.", "P. Unit.", "Total"].map((text) => ({
              text,
              bold: true,
              color: "white",
            })),
            ...quote.lines.map((line) => [
              line.code,
              line.description,
              String(line.quantity),
              money(line.unitPrice),
              money(line.quantity * line.unitPrice),
            ]),
          ],
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? NAVY : rowIndex % 2 === 0 ? "#eef1f5" : null),
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingTop: () => 8,
          paddingBottom: () => 8,
        },
      },
      { text: `TOTAL CON IVA: ${money(quote.total)}`, bold: true, fontSize: 16, alignment: "right", color: RED, margin: [0, 18, 0, 0] },
    ],
  };
}

async function localImageData(publicUrl: string | null | undefined): Promise<string | null> {
  if (!publicUrl?.startsWith("/assets/catalog/")) return null;
  const relative = publicUrl.replace(/^\//, "");
  const file = path.resolve(process.cwd(), "site", relative);
  try {
    const bytes = await readFile(file);
    const mime = file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function warrantyBadge(value: string, label: string) {
  return {
    stack: [
      { text: value, color: NAVY, bold: true, fontSize: 11, alignment: "center" },
      { text: label, color: MUTED, fontSize: 7, alignment: "center", margin: [0, 2, 0, 0] },
    ],
    fillColor: "#fff6dc",
    margin: [4, 6, 4, 6],
  };
}

function warrantyCard(title: string, body: string, fill: string, color: string) {
  return {
    width: "*",
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              { text: title, color, bold: true, fontSize: 8 },
              { text: body, color: NAVY, bold: true, fontSize: 11, margin: [0, 6, 0, 0] },
            ],
            fillColor: fill,
            margin: [12, 12, 12, 12],
          },
        ],
      ],
    },
    layout: cardLayout,
  };
}

function photoPlaceholder(brand: string) {
  return {
    stack: [
      { text: "◉", fontSize: 68, color: "#9ca3af", alignment: "center" },
      { text: brand.toUpperCase(), fontSize: 11, bold: true, color: MUTED, alignment: "center" },
    ],
    margin: [0, 45, 0, 45],
  };
}

function specLabel(product: CatalogItem): string | null {
  return product.loadSpeed ? loadSpeedLabel(product.loadSpeed) : null;
}

function loadSpeedLabel(loadSpeed: NonNullable<CatalogItem["loadSpeed"]>): string {
  const detail = [
    loadSpeed.loadKg ? `${loadSpeed.loadKg} kg` : null,
    loadSpeed.speedKmh ? `${loadSpeed.speedKmh} km/h` : null,
  ].filter(Boolean);
  return detail.length ? `${loadSpeed.code} · ${detail.join(" · ")}` : loadSpeed.code;
}

function discount(product: CatalogItem): number {
  return Math.round((1 - product.minimumPriceWithTax / product.customerPriceWithTax) * 100);
}

function availabilityLabel(value: CatalogItem["availability"]): string {
  return value === "available"
    ? "✓ Disponible"
    : value === "check"
      ? "⚠ Consultar disponibilidad"
      : "Agotada";
}

function availabilityColor(value: CatalogItem["availability"]): string {
  return value === "available" ? GREEN : value === "check" ? "#a16600" : RED;
}

function brandColor(brand: string): string {
  const normalized = brand.toLowerCase();
  if (normalized.includes("falken")) return "#1f4e8c";
  if (normalized.includes("kenda")) return "#d62828";
  if (normalized.includes("winrun")) return "#16836b";
  return NAVY;
}

function dateLabel(): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Guayaquil",
  }).format(new Date());
}

const cardLayout = {
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 8,
  paddingBottom: () => 8,
};

const gapLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

const totalLayout = {
  fillColor: () => PAPER,
  hLineColor: () => BORDER,
  vLineColor: () => BORDER,
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  paddingLeft: () => 14,
  paddingRight: () => 14,
  paddingTop: () => 12,
  paddingBottom: () => 12,
};

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: business.currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

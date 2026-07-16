/**
 * Genera el PDF de cotización con pdfmake (layout declarativo, sin Chromium —
 * cabe en los 512MB de Railway). Estructura de plantilla inspirada en las
 * plantillas públicas de factura para pdfmake.
 */
import pdfmake from "pdfmake";
import helvetica from "pdfmake/standard-fonts/Helvetica.js";
import { business } from "../config.js";

pdfmake.addFonts(helvetica);

export interface QuoteLine {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
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

const money = (n: number) => `$${n.toFixed(2)}`;

// Colores de marca Depot Tire: oscuro con acentos azules
const DARK = "#1a1a1a";
const ACCENT = "#2563eb";
const LIGHT = "#f3f4f6";

export function buildQuote(
  lines: QuoteLine[],
  customerName: string,
  customerPhone: string,
): Quote {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function renderQuotePdf(quote: Quote): Promise<Buffer> {
  const date = new Date().toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 60],
    defaultStyle: { font: "Helvetica", fontSize: 10, color: DARK },
    content: [
      {
        columns: [
          [
            { text: business.name.toUpperCase(), fontSize: 22, bold: true, color: DARK },
            { text: "Cotización de llantas", fontSize: 11, color: ACCENT, margin: [0, 2, 0, 0] },
          ],
          [
            { text: quote.number, alignment: "right", bold: true, fontSize: 12 },
            { text: date, alignment: "right", color: "#6b7280" },
          ],
        ],
        margin: [0, 0, 0, 24],
      },
      {
        columns: [
          [
            { text: "CLIENTE", fontSize: 8, bold: true, color: "#6b7280" },
            { text: quote.customerName || "Cliente", bold: true },
            { text: quote.customerPhone, color: "#6b7280" },
          ],
          [
            { text: "ATENDEMOS", fontSize: 8, bold: true, color: "#6b7280", alignment: "right" },
            { text: business.schedule, alignment: "right" },
            { text: business.phone, alignment: "right", color: "#6b7280" },
          ],
        ],
        margin: [0, 0, 0, 20],
      },
      {
        table: {
          headerRows: 1,
          widths: ["auto", "*", "auto", "auto", "auto"],
          body: [
            [
              th("Código"),
              th("Descripción"),
              th("Cant."),
              th("P. Unit."),
              th("Total"),
            ],
            ...quote.lines.map((line) => [
              td(line.code),
              td(line.description),
              td(String(line.quantity), "center"),
              td(money(line.unitPrice), "right"),
              td(money(round2(line.quantity * line.unitPrice)), "right"),
            ]),
          ],
        },
        layout: {
          fillColor: (rowIndex: number) =>
            rowIndex === 0 ? DARK : rowIndex % 2 === 0 ? LIGHT : null,
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingTop: () => 8,
          paddingBottom: () => 8,
          paddingLeft: () => 8,
          paddingRight: () => 8,
        },
        margin: [0, 0, 0, 16],
      },
      {
        columns: [
          { width: "*", text: "" },
          {
            width: 200,
            table: {
              widths: ["*", "auto"],
              body: [
                [tot("Subtotal"), tot(money(quote.subtotal), "right")],
                [
                  tot(`IVA ${Math.round(business.taxRate * 100)}%`),
                  tot(money(quote.tax), "right"),
                ],
                [
                  { text: "TOTAL", bold: true, fontSize: 13, margin: [0, 6, 0, 0] },
                  {
                    text: money(quote.total),
                    bold: true,
                    fontSize: 13,
                    alignment: "right",
                    color: ACCENT,
                    margin: [0, 6, 0, 0],
                  },
                ],
              ],
            },
            layout: "noBorders",
          },
        ],
      },
      {
        text: [
          "Cotización válida por 3 días o hasta agotar stock. Precios incluyen IVA en el total. ",
          business.promo ? `Promoción vigente: ${business.promo}.` : "",
        ],
        fontSize: 8,
        color: "#6b7280",
        margin: [0, 30, 0, 0],
      },
      {
        text: business.stores
          .map((store) => `${store.name}: ${store.address}`)
          .join("  ·  "),
        fontSize: 8,
        color: "#6b7280",
        margin: [0, 6, 0, 0],
      },
    ],
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}

function th(text: string) {
  return { text, bold: true, color: "white", fontSize: 9 };
}
function td(text: string, alignment: "left" | "center" | "right" = "left") {
  return { text, alignment };
}
function tot(text: string, alignment: "left" | "right" = "left") {
  return { text, alignment, color: "#374151" };
}

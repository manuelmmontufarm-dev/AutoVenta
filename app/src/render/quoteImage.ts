/**
 * Motor de imágenes de cotización — satori (layout flex → SVG) + resvg (SVG → PNG).
 * Sin Chromium: cabe en los 512MB de Railway.
 *
 * Estilo: Racing Heritage de Depot Tire (crema/navy/rojo/dorado), estructura
 * inspirada en las piezas de referencia del cliente: logo de marca en vez del
 * nombre, precio hoy vs. PVP tachado, medallas de garantía, índice de carga
 * traducido y stock real al momento de generar.
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { business } from "../config.js";
import type { CatalogAvailability, CatalogItem } from "../domain/catalog.js";
import { warrantyForBrand } from "../services/quoteMessages.js";
import { loadFonts, brandLogo, productPhoto, type RasterImage } from "./assets.js";

// Paleta Racing Heritage (app/site/estilos/04-racing-heritage.html)
const CREAM = "#f6f1e4";
const PANEL = "#fffdf6";
const NAVY = "#14213d";
const RED = "#d62828";
const GOLD = "#fcbf49";
const GREEN = "#2a9d8f";
const MUTED = "#5c6273";
const BORDER = "#d9d2bf";

const money = (n: number) => `$${n.toFixed(2)}`;

// ---------------------------------------------------------------------------
// Mini-DSL para nodos de satori
// ---------------------------------------------------------------------------

type Child = SatoriNode | string | null | false;
interface SatoriNode {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
}

function el(style: Record<string, unknown>, ...children: Child[]): SatoriNode {
  const kids = children.filter((c): c is SatoriNode | string => Boolean(c));
  return { type: "div", props: { style: { display: "flex", ...style }, children: kids } };
}

function text(style: Record<string, unknown>, content: string): SatoriNode {
  return { type: "div", props: { style: { display: "flex", ...style }, children: content } };
}

function img(src: string, style: Record<string, unknown>): SatoriNode {
  return { type: "img", props: { src, style } };
}

const BLACK_FONT = { fontFamily: "Archivo Black", fontWeight: 900 };

// ---------------------------------------------------------------------------
// Datos de entrada
// ---------------------------------------------------------------------------

export interface RenderLine {
  brand: string;
  design: string;
  sizeLabel: string;
  /** Ej. "112T" y su traducción "1120 kg máx · 190 km/h máx". */
  loadSpeedLabel: string | null;
  loadSpeedTranslation: string | null;
  quantity: number;
  /** Precio unitario CON IVA (precio hoy). */
  unitConIva: number;
  /** PVP unitario CON IVA (tachado) o null si no hay. */
  pvpConIva: number | null;
  availability: CatalogAvailability;
  /** Meses de cobertura contra golpes (null si la marca no la trae). */
  golpesMeses: number | null;
  fabricaAnios: number;
  photo: RasterImage;
}

export interface QuoteRenderData {
  number: string;
  dateLabel: string;
  lines: RenderLine[];
  subtotal: number;
  iva: number;
  total: number;
  discountAmount?: number;
  discountCondition?: string;
  offerExpiresAt?: Date | null;
}

export interface CompareRenderData {
  dateLabel: string;
  products: RenderLine[]; // quantity ignorada
}

/** Etiqueta legible del índice de carga, ej. "112T = 1120 kg máx · 190 km/h máx". */
function loadSpeedText(line: RenderLine, separator = " = "): string | null {
  if (!line.loadSpeedLabel) return null;
  return line.loadSpeedTranslation
    ? `${line.loadSpeedLabel}${separator}${line.loadSpeedTranslation}`
    : line.loadSpeedLabel;
}

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

function header(title: string, subtitle: string, dateLabel: string, badge: string): SatoriNode {
  return el(
    { flexDirection: "column", width: "100%" },
    el(
      {
        backgroundColor: NAVY,
        padding: "28px 44px",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      },
      el(
        { alignItems: "center", gap: 24 },
        // Chip del negocio: nombre en Archivo Black sobre blanco con barra roja
        el(
          {
            backgroundColor: "#ffffff",
            borderRadius: 14,
            padding: "14px 22px",
            alignItems: "center",
            gap: 12,
          },
          el({ width: 10, height: 40, backgroundColor: RED, borderRadius: 3 }),
          text({ ...BLACK_FONT, fontSize: 30, color: NAVY }, business.name.toUpperCase()),
        ),
        el(
          { flexDirection: "column", gap: 4 },
          text({ ...BLACK_FONT, fontSize: 40, color: "#ffffff" }, title),
          text(
            { fontSize: 18, fontWeight: 700, color: GOLD, letterSpacing: 4 },
            subtitle.toUpperCase(),
          ),
        ),
      ),
      el(
        { flexDirection: "column", alignItems: "flex-end", gap: 10 },
        text({ ...BLACK_FONT, fontSize: 26, color: "#ffffff" }, dateLabel),
        text(
          {
            fontSize: 18,
            fontWeight: 700,
            color: NAVY,
            backgroundColor: GOLD,
            borderRadius: 999,
            padding: "8px 18px",
          },
          badge,
        ),
      ),
    ),
    // Franja racing
    el(
      { width: "100%", height: 12 },
      el({ width: "58%", height: "100%", backgroundColor: RED }),
      el({ width: "26%", height: "100%", backgroundColor: GOLD }),
      el({ width: "16%", height: "100%", backgroundColor: "#0d1730" }),
    ),
  );
}

function brandMark(brand: string, height: number): SatoriNode {
  const logo = brandLogo(brand);
  if (logo) {
    const w = logo.width && logo.height ? Math.round((logo.width / logo.height) * height) : undefined;
    return img(logo.dataUri, { height, ...(w ? { width: Math.min(w, height * 4.5) } : {}), objectFit: "contain" });
  }
  // Fallback: nombre estilizado tipo logo
  return el(
    { alignItems: "center", gap: 10 },
    el({ width: 8, height: Math.round(height * 0.8), backgroundColor: RED, borderRadius: 2 }),
    text({ ...BLACK_FONT, fontSize: Math.round(height * 0.72), color: NAVY, letterSpacing: 1 }, brand.toUpperCase()),
  );
}

const AVAILABILITY_STYLE: Record<
  CatalogAvailability,
  { label: string; bg: string; dot: string; fg: string }
> = {
  available: { label: "Disponible", bg: "#e8f4ea", dot: GREEN, fg: "#1d7268" },
  check: { label: "Consultar", bg: "#fdf0e0", dot: "#e08a00", fg: "#a36400" },
  out: { label: "Sin stock", bg: "#fdeaea", dot: RED, fg: "#a52020" },
};

function availabilityBadge(availability: CatalogAvailability, size = 20): SatoriNode {
  const style = AVAILABILITY_STYLE[availability] ?? AVAILABILITY_STYLE.check;
  return el(
    {
      alignItems: "center",
      gap: 10,
      backgroundColor: style.bg,
      borderRadius: 999,
      padding: `${Math.round(size * 0.45)}px ${size}px`,
    },
    el({
      width: Math.round(size * 0.55),
      height: Math.round(size * 0.55),
      borderRadius: 999,
      backgroundColor: style.dot,
    }),
    text({ fontSize: size, fontWeight: 700, color: style.fg }, style.label),
  );
}

function medallion(value: string, unit: string, label: string): SatoriNode {
  return el(
    {
      flexDirection: "column",
      alignItems: "center",
      gap: 14,
      backgroundColor: PANEL,
      border: `2px solid ${BORDER}`,
      borderRadius: 24,
      padding: "26px 30px",
      flexGrow: 1,
    },
    el(
      {
        width: 132,
        height: 132,
        borderRadius: 999,
        backgroundColor: NAVY,
        border: `6px solid ${GOLD}`,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      },
      text({ ...BLACK_FONT, fontSize: 44, color: GOLD, lineHeight: 1 }, value),
      text({ fontSize: 17, fontWeight: 700, color: "#ffffff", letterSpacing: 2 }, unit.toUpperCase()),
    ),
    text(
      { fontSize: 19, fontWeight: 700, color: NAVY, letterSpacing: 1, textAlign: "center" },
      label.toUpperCase(),
    ),
  );
}

function sectionLabel(label: string): SatoriNode {
  return text({ fontSize: 17, fontWeight: 700, color: MUTED, letterSpacing: 4 }, label.toUpperCase());
}

function footer(note: string): SatoriNode {
  const stores = business.stores.map((s) => `${s.name} · ${s.address}`).join("   |   ");
  return el(
    {
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      padding: "24px 44px 30px",
      borderTop: `2px solid ${BORDER}`,
      width: "100%",
    },
    text({ fontSize: 17, fontWeight: 700, color: NAVY }, note),
    text({ fontSize: 15, color: MUTED, textAlign: "center" }, stores),
    text({ fontSize: 15, color: MUTED }, `${business.phone} · ${business.schedule}`),
  );
}

function photoCard(photo: RasterImage, size: number): SatoriNode {
  return el(
    {
      width: size,
      height: size,
      backgroundColor: "#ffffff",
      border: `2px solid ${BORDER}`,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    img(photo.dataUri, { width: Math.round(size * 0.86), height: Math.round(size * 0.86), objectFit: "contain" }),
  );
}

// ---------------------------------------------------------------------------
// Plantilla: cotización (héroe con 1 producto, lista con 2+)
// ---------------------------------------------------------------------------

function priceBlock(line: RenderLine): SatoriNode {
  const discount =
    line.pvpConIva && line.pvpConIva > line.unitConIva
      ? Math.round((1 - line.unitConIva / line.pvpConIva) * 100)
      : null;
  return el(
    {
      backgroundColor: PANEL,
      border: `2px solid ${BORDER}`,
      borderRadius: 24,
      padding: "30px 40px",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
    },
    el(
      { flexDirection: "column", gap: 10 },
      sectionLabel("Precio lista"),
      line.pvpConIva
        ? text(
            { fontSize: 40, fontWeight: 700, color: MUTED, textDecoration: "line-through" },
            money(line.pvpConIva),
          )
        : text({ fontSize: 40, fontWeight: 700, color: MUTED }, "—"),
      discount
        ? el(
            { backgroundColor: "#e8f4ea", borderRadius: 999, padding: "8px 18px" },
            text(
              { fontSize: 20, fontWeight: 700, color: "#1d7268" },
              `Ahorras ${money(line.pvpConIva! - line.unitConIva)} · −${discount}%`,
            ),
          )
        : null,
    ),
    el(
      { flexDirection: "column", alignItems: "flex-end", gap: 6 },
      text({ fontSize: 17, fontWeight: 700, color: RED, letterSpacing: 4 }, "PRECIO HOY"),
      text({ ...BLACK_FONT, fontSize: 76, color: NAVY, lineHeight: 1.05 }, money(line.unitConIva)),
      text({ fontSize: 19, color: MUTED }, "IVA incluido · por unidad"),
    ),
  );
}

function heroBody(line: RenderLine): SatoriNode[] {
  return [
    el(
      { padding: "40px 44px 0", gap: 40, width: "100%" },
      photoCard(line.photo, 400),
      el(
        { flexDirection: "column", gap: 18, justifyContent: "center", flexGrow: 1 },
        brandMark(line.brand, 64),
        text({ ...BLACK_FONT, fontSize: 52, color: NAVY, lineHeight: 1.05 }, line.design.toUpperCase()),
        text({ fontSize: 40, fontWeight: 700, color: MUTED }, line.sizeLabel),
        el({ width: 320, height: 2, backgroundColor: BORDER }),
        loadSpeedText(line)
          ? el(
              { flexDirection: "column", gap: 6 },
              sectionLabel("Índice de carga y velocidad"),
              text({ fontSize: 24, fontWeight: 700, color: NAVY }, loadSpeedText(line)!),
            )
          : null,
        el({}, availabilityBadge(line.availability, 22)),
      ),
    ),
    el({ padding: "34px 44px 0", width: "100%" }, priceBlock(line)),
  ];
}

function totalsBand(data: QuoteRenderData, units: number): SatoriNode {
  const listTotal = data.lines.reduce((sum, line) => sum + (line.pvpConIva ?? line.unitConIva) * line.quantity, 0);
  const baseTotal = data.lines.reduce((sum, line) => sum + line.unitConIva * line.quantity, 0);
  const baseSaving = Math.max(0, listTotal - baseTotal);
  const basePercent = listTotal > 0 ? Math.round((baseSaving / listTotal) * 100) : 0;
  return el(
    { padding: "30px 44px 0", width: "100%" },
    el(
      {
        backgroundColor: NAVY,
        borderRadius: 24,
        padding: "26px 40px",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      },
      el(
        { flexDirection: "column", gap: 6 },
        text(
          { fontSize: 17, fontWeight: 700, color: GOLD, letterSpacing: 4 },
          `TOTAL · ${units} ${units === 1 ? "LLANTA" : "LLANTAS"}`,
        ),
        text({ fontSize: 18, color: "#c8d0e2" }, `PVP original ${money(listTotal)}`),
        baseSaving > 0
          ? text({ fontSize: 20, fontWeight: 700, color: "#9ee3c7" },
              `1. DESCUENTO BASE DEPOT TIRE −${money(baseSaving)} (−${basePercent}%) · precio base ${money(baseTotal)}`)
          : null,
        data.discountAmount
          ? text({ fontSize: 22, fontWeight: 900, color: GOLD }, `2. DESCUENTO EXTRA DEL ASESOR −${money(data.discountAmount)}`)
          : null,
        data.discountAmount
          ? text({ fontSize: 18, fontWeight: 900, color: "#ffffff" }, `CONDICIÓN OBLIGATORIA: ${data.discountCondition ?? "condición registrada"}`)
          : null,
        data.discountAmount
          ? text({ fontSize: 15, fontWeight: 700, color: "#ffffff" }, `Si no cumple la condición, conserva solo el precio base. Válido presentando ${data.number}`)
          : null,
      ),
      text({ ...BLACK_FONT, fontSize: 62, color: GOLD }, money(data.total)),
    ),
  );
}

function warrantyRow(line: RenderLine): SatoriNode {
  return el(
    { flexDirection: "column", gap: 16, padding: "34px 44px 0", width: "100%" },
    sectionLabel("Garantías"),
    el(
      { gap: 24, width: "100%" },
      line.golpesMeses
        ? medallion(String(line.golpesMeses), "meses", "Garantía contra golpes")
        : null,
      medallion(String(line.fabricaAnios), "años", "Garantía de fábrica"),
    ),
  );
}

function listBody(data: QuoteRenderData): SatoriNode[] {
  return [
    el(
      { flexDirection: "column", gap: 18, padding: "36px 44px 0", width: "100%" },
      ...data.lines.map((line) =>
        el(
          {
            backgroundColor: PANEL,
            border: `2px solid ${BORDER}`,
            borderRadius: 24,
            padding: "20px 28px",
            alignItems: "center",
            gap: 26,
            width: "100%",
          },
          photoCard(line.photo, 130),
          el(
            { flexDirection: "column", gap: 6, flexGrow: 1 },
            brandMark(line.brand, 36),
            text({ ...BLACK_FONT, fontSize: 28, color: NAVY }, line.design.toUpperCase()),
            text({ fontSize: 22, fontWeight: 700, color: MUTED }, line.sizeLabel),
            el({}, availabilityBadge(line.availability, 15)),
          ),
          el(
            { flexDirection: "column", alignItems: "flex-end", gap: 6 },
            text({ fontSize: 19, color: MUTED }, `${line.quantity} × ${money(line.unitConIva)}`),
            text({ ...BLACK_FONT, fontSize: 34, color: NAVY }, money(line.quantity * line.unitConIva)),
            text({ fontSize: 15, color: MUTED }, "IVA incluido"),
          ),
        ),
      ),
    ),
  ];
}

export async function renderQuoteImage(data: QuoteRenderData): Promise<Buffer> {
  const single = data.lines.length === 1;
  const units = data.lines.reduce((sum, l) => sum + l.quantity, 0);
  const first = data.lines[0];

  const children: Child[] = [
    header("Cotización de Llantas", `Cotización ${data.number}`, data.dateLabel, data.offerExpiresAt ? `Oferta hasta ${data.offerExpiresAt.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}` : "IVA incluido"),
    ...(single ? heroBody(first) : listBody(data)),
    ...(single && units === 1 && !data.discountAmount ? [] : [totalsBand(data, units)]),
    ...(single ? [warrantyRow(first)] : []),
    el({ flexGrow: 1 }),
    footer(`Cotización ${data.number} · Presenta este número en el local${data.offerExpiresAt ? ` · Oferta hasta ${data.offerExpiresAt.toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}` : ""}`),
  ];

  // header ~184 + padding + filas (~196 c/u con gap) + banda de total + footer
  const height = (single ? 1560 : 460 + data.lines.length * 214) + (data.discountAmount ? 130 : 0);

  return renderPng(el({ flexDirection: "column", width: "100%", height: "100%", backgroundColor: CREAM }, ...children), 1080, height);
}

// ---------------------------------------------------------------------------
// Plantilla: comparativa (2–3 productos lado a lado)
// ---------------------------------------------------------------------------

function compareColumn(line: RenderLine, colWidth: number): SatoriNode {
  const discount =
    line.pvpConIva && line.pvpConIva > line.unitConIva
      ? Math.round((1 - line.unitConIva / line.pvpConIva) * 100)
      : null;
  return el(
    {
      flexDirection: "column",
      alignItems: "center",
      gap: 14,
      backgroundColor: PANEL,
      border: `2px solid ${BORDER}`,
      borderRadius: 28,
      padding: "28px 24px",
      width: colWidth,
    },
    photoCard(line.photo, colWidth - 90),
    el({ height: 56, alignItems: "center", justifyContent: "center" }, brandMark(line.brand, 46)),
    text({ ...BLACK_FONT, fontSize: 30, color: NAVY, textAlign: "center" }, line.design.toUpperCase()),
    text({ fontSize: 24, fontWeight: 700, color: MUTED }, line.sizeLabel),
    el({ width: "70%", height: 2, backgroundColor: BORDER }),
    text({ ...BLACK_FONT, fontSize: 46, color: RED }, money(line.unitConIva)),
    line.pvpConIva && discount
      ? el(
          { alignItems: "center", gap: 10 },
          text(
            { fontSize: 20, fontWeight: 700, color: MUTED, textDecoration: "line-through" },
            `Antes ${money(line.pvpConIva)}`,
          ),
          el(
            { backgroundColor: "#e8f4ea", borderRadius: 999, padding: "4px 12px" },
            text({ fontSize: 18, fontWeight: 700, color: "#1d7268" }, `−${discount}%`),
          ),
        )
      : text({ fontSize: 18, color: MUTED }, "IVA incluido"),
    availabilityBadge(line.availability, 17),
    el(
      { flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 6 },
      line.golpesMeses
        ? text(
            { fontSize: 17, fontWeight: 700, color: NAVY },
            `${line.golpesMeses} meses contra golpes`,
          )
        : null,
      text({ fontSize: 17, color: MUTED }, `${line.fabricaAnios} años de fábrica`),
      loadSpeedText(line, " · ")
        ? text({ fontSize: 16, color: MUTED, textAlign: "center" }, loadSpeedText(line, " · ")!)
        : null,
    ),
  );
}

export async function renderCompareImage(data: CompareRenderData): Promise<Buffer> {
  const n = Math.min(data.products.length, 3);
  const width = n === 2 ? 1080 : 1440;
  const colWidth = Math.floor((width - 44 * 2 - 28 * (n - 1)) / n);
  const node = el(
    { flexDirection: "column", width: "100%", height: "100%", backgroundColor: CREAM },
    header("Comparativa de Llantas", `${business.name} · Elige la tuya`, data.dateLabel, "IVA incluido"),
    el(
      { gap: 28, padding: "36px 44px 0", width: "100%", justifyContent: "center" },
      ...data.products.slice(0, 3).map((p) => compareColumn(p, colWidth)),
    ),
    el({ flexGrow: 1 }),
    footer("Precios incluyen IVA · Confirma vigencia y stock al momento de comprar"),
  );
  return renderPng(node, width, 1180);
}

// ---------------------------------------------------------------------------
// Plantilla: opciones disponibles (catálogo agrupado por marca — pieza 3)
// ---------------------------------------------------------------------------

const BRAND_DOT: Record<string, string> = {
  falken: "#1f4e8c",
  kenda: RED,
  winrun: GREEN,
  maxxis: "#e07000",
  sunoco: "#c9a227",
};

function optionCard(line: RenderLine, cardWidth: number): SatoriNode {
  const discount =
    line.pvpConIva && line.pvpConIva > line.unitConIva
      ? Math.round((1 - line.unitConIva / line.pvpConIva) * 100)
      : null;
  return el(
    {
      flexDirection: "column",
      gap: 10,
      backgroundColor: PANEL,
      border: `2px solid ${BORDER}`,
      borderRadius: 22,
      padding: "18px 18px 20px",
      width: cardWidth,
    },
    el(
      { justifyContent: "center", width: "100%" },
      photoCard(line.photo, cardWidth - 60),
    ),
    text({ ...BLACK_FONT, fontSize: 24, color: NAVY }, line.design.toUpperCase()),
    text(
      { fontSize: 17, fontWeight: 500, color: MUTED },
      [line.sizeLabel, line.loadSpeedLabel].filter(Boolean).join(" · "),
    ),
    el(
      { alignItems: "center", gap: 12 },
      text({ ...BLACK_FONT, fontSize: 32, color: RED }, money(line.unitConIva)),
      line.pvpConIva && discount
        ? text(
            { fontSize: 16, fontWeight: 700, color: MUTED, textDecoration: "line-through" },
            money(line.pvpConIva),
          )
        : null,
      discount
        ? el(
            { backgroundColor: "#e8f4ea", borderRadius: 999, padding: "3px 10px" },
            text({ fontSize: 14, fontWeight: 700, color: "#1d7268" }, `−${discount}%`),
          )
        : null,
    ),
    el({}, availabilityBadge(line.availability, 14)),
    el(
      { flexDirection: "column", gap: 2 },
      line.golpesMeses
        ? text({ fontSize: 14, fontWeight: 700, color: NAVY }, `${line.golpesMeses} meses contra golpes`)
        : null,
      text({ fontSize: 14, color: MUTED }, `${line.fabricaAnios} años de fábrica`),
    ),
  );
}

export interface OptionsRenderData {
  dateLabel: string;
  /** Medida buscada, ej. "205/55R16" — va en el subtítulo. */
  sizeLabel?: string | null;
  products: RenderLine[]; // quantity ignorada
}

export async function renderOptionsImage(data: OptionsRenderData): Promise<Buffer> {
  const width = 1440;
  const PAD = 44;
  const GAP = 24;
  const perRow = 3;
  const cardWidth = Math.floor((width - PAD * 2 - GAP * (perRow - 1)) / perRow);
  const cardHeight = cardWidth - 60 + 235; // foto + textos

  // Agrupar por marca conservando el orden de aparición
  const groups = new Map<string, RenderLine[]>();
  for (const p of data.products) {
    const list = groups.get(p.brand) ?? [];
    list.push(p);
    groups.set(p.brand, list);
  }

  const sections: Child[] = [];
  let height = 196 + 36 + 150; // header + padding top + footer
  for (const [brand, lines] of groups) {
    const rows = Math.ceil(lines.length / perRow);
    height += 74 + rows * (cardHeight + GAP);
    const dot = BRAND_DOT[brand.toLowerCase()] ?? NAVY;
    sections.push(
      el(
        { alignItems: "center", gap: 14, padding: `10px ${PAD}px 14px`, width: "100%" },
        el({ width: 18, height: 18, borderRadius: 999, backgroundColor: dot }),
        brandMark(brand, 40),
        el({ flexGrow: 1, height: 2, backgroundColor: BORDER }),
      ),
    );
    for (let r = 0; r < rows; r++) {
      sections.push(
        el(
          { gap: GAP, padding: `0 ${PAD}px ${GAP}px`, width: "100%" },
          ...lines.slice(r * perRow, (r + 1) * perRow).map((l) => optionCard(l, cardWidth)),
        ),
      );
    }
  }

  const node = el(
    { flexDirection: "column", width: "100%", height: "100%", backgroundColor: CREAM },
    header(
      "Opciones de Llantas",
      data.sizeLabel ? `Disponibles en ${data.sizeLabel}` : `${business.name} · Disponibles hoy`,
      data.dateLabel,
      "IVA incluido",
    ),
    el({ height: 26 }),
    ...sections,
    el({ flexGrow: 1 }),
    footer("Precios por unidad incluyen IVA · Confirma vigencia y stock al momento de comprar"),
  );
  return renderPng(node, width, height);
}

// ---------------------------------------------------------------------------
// satori + resvg
// ---------------------------------------------------------------------------

async function renderPng(node: SatoriNode, width: number, height: number): Promise<Buffer> {
  const svg = await satori(node as never, {
    width,
    height,
    fonts: loadFonts().map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width * 2 } });
  return Buffer.from(resvg.render().asPng());
}

// ---------------------------------------------------------------------------
// Constructor de RenderLine desde el catálogo
// ---------------------------------------------------------------------------

/**
 * Convierte un producto del catálogo (Contífico) en una línea renderizable.
 * Los precios ya vienen con IVA calculado por el catálogo: `minimumPriceWithTax`
 * es el precio hoy y `customerPriceWithTax` el de lista (el tachado); la
 * garantía sale de la misma fuente que los mensajes de texto.
 */
export async function toRenderLine(
  product: CatalogItem,
  quantity = 1,
): Promise<RenderLine> {
  const warranty = warrantyForBrand(product.brand);
  const pvp =
    product.customerPriceWithTax > product.minimumPriceWithTax
      ? product.customerPriceWithTax
      : null;
  return {
    brand: product.brand,
    design: product.design,
    sizeLabel: product.sizeLabel ?? product.name,
    loadSpeedLabel: product.loadSpeed?.code ?? null,
    loadSpeedTranslation: loadSpeedTranslation(product.loadSpeed),
    quantity,
    unitConIva: product.minimumPriceWithTax,
    pvpConIva: pvp,
    availability: product.availability,
    golpesMeses: warranty.roadHazardMonths,
    fabricaAnios: 5,
    photo: await productPhoto(product.brand, product.design, product.imageUrl),
  };
}

function loadSpeedTranslation(loadSpeed: CatalogItem["loadSpeed"]): string | null {
  if (!loadSpeed) return null;
  const parts: string[] = [];
  if (loadSpeed.loadKg) parts.push(`${loadSpeed.loadKg} kg máx`);
  if (loadSpeed.speedKmh) parts.push(`${loadSpeed.speedKmh} km/h máx`);
  return parts.length ? parts.join(" · ") : null;
}

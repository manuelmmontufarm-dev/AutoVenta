/**
 * Motor de imágenes — satori (layout flex → SVG) + resvg (SVG → PNG).
 * Sin Chromium: cabe en la instancia chica de Railway y rinde en centenas de ms.
 *
 * El diseño de las tres piezas vive en `depotDesign.ts` (paletas, fuentes,
 * marcas, bloques compartidos) y `depotPosters.ts` (las piezas). Este módulo
 * solo traduce el catálogo al diseño y rasteriza.
 */
import satori from "satori";
import { renderAsync } from "@resvg/resvg-js";
import { compactCatalogText, type CatalogAvailability, type CatalogItem } from "../domain/catalog.js";
import { warrantyForBrand } from "../services/quoteMessages.js";
import { loadFonts, productPhoto, type RasterImage } from "./assets.js";
import { DEFAULT_BRAND_PROFILES, resolveTheme, type SatoriNode, type Theme } from "./depotDesign.js";
import { comparePoster, medidaGuidePoster, optionsPoster, quotePoster, type PosterLine } from "./depotPosters.js";

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

export interface QuoteRenderData extends PieceTheme {
  number: string;
  /** Beneficios vigentes (tabla `benefits`). Vacío = no se dibuja la franja. */
  benefits?: readonly string[];
  dateLabel: string;
  lines: RenderLine[];
  subtotal: number;
  iva: number;
  total: number;
  discountAmount?: number;
  discountCondition?: string;
  offerExpiresAt?: Date | null;
}

export interface CompareRenderData extends PieceTheme {
  dateLabel: string;
  /** Medida comparada, ej. "205/55R16" — va en el encabezado. */
  sizeLabel?: string | null;
  products: RenderLine[]; // quantity ignorada
}

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Piezas — diseño de Depot Tire (proyecto de Claude Design, portado a satori)
// ---------------------------------------------------------------------------

/** Tema y beneficios que el negocio configura desde Ajustes. */
export interface PieceTheme {
  paleta?: string | null;
  fuente?: string | null;
  /** Etiqueta y frase por marca. Sin esto caen los valores del diseño. */
  brandProfiles?: Record<string, { tag: string; posicionamiento: string }>;
}

function themeOf(data: PieceTheme): Theme {
  return resolveTheme(data.paleta, data.fuente);
}

/** RenderLine (catálogo) → PosterLine (diseño). */
function toPosterLine(
  line: RenderLine,
  profiles: Record<string, { tag: string; posicionamiento: string }> = DEFAULT_BRAND_PROFILES,
): PosterLine {
  const profile = profiles[line.brand.trim().toUpperCase()];
  return {
    brand: line.brand,
    design: line.design,
    sizeLabel: line.sizeLabel,
    loadSpeedLabel: line.loadSpeedLabel,
    loadSpeedTranslation: line.loadSpeedTranslation,
    quantity: line.quantity,
    unitConIva: line.unitConIva,
    pvpConIva: line.pvpConIva,
    availability: line.availability,
    golpesMeses: line.golpesMeses,
    fabricaAnios: line.fabricaAnios,
    photoUri: line.photo.dataUri,
    tag: profile?.tag ?? null,
    posicionamiento: profile?.posicionamiento ?? null,
  };
}

/**
 * Marca cada línea como «su medida exacta» o «equivalente», comparando contra
 * la medida que pidió el cliente.
 *
 * Se calcula AQUÍ y no en quien llama para que ninguna pieza pueda olvidarse
 * de marcarlo: si hay medida pedida, todas las tarjetas salen marcadas.
 */
function marcarExactitud(lines: PosterLine[], medidaPedida: string | null | undefined): PosterLine[] {
  if (!medidaPedida) return lines;
  const objetivo = compactCatalogText(medidaPedida);
  if (!objetivo) return lines;
  return lines.map((line) => ({
    ...line,
    medidaExacta: compactCatalogText(line.sizeLabel) === objetivo,
  }));
}

const POSTER_WIDTH = 1440;

export async function renderQuoteImage(data: QuoteRenderData): Promise<Buffer> {
  // El diseño cotiza UNA llanta; si llegaran varias, manda la primera (el
  // agente ya solo permite una por cotización).
  const line = data.lines[0];
  if (!line) throw new Error("La cotización no tiene ninguna línea que renderizar");
  const node = quotePoster(
    {
      number: data.number,
      dateLabel: data.dateLabel,
      line: toPosterLine(line, data.brandProfiles),
      subtotal: data.subtotal,
      iva: data.iva,
      total: data.total,
      discountAmount: data.discountAmount,
      discountCondition: data.discountCondition,
      expiresLabel: data.offerExpiresAt
        ? data.offerExpiresAt.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })
        : null,
      benefits: data.benefits,
    },
    themeOf(data),
  );
  return renderPng(node, POSTER_WIDTH);
}

export async function renderCompareImage(data: CompareRenderData): Promise<Buffer> {
  const node = comparePoster(
    {
      dateLabel: data.dateLabel,
      sizeLabel: data.sizeLabel ?? data.products[0]?.sizeLabel ?? null,
      lines: data.products.map((line) => toPosterLine(line, data.brandProfiles)),
    },
    themeOf(data),
  );
  return renderPng(node, POSTER_WIDTH);
}

export interface OptionsRenderData extends PieceTheme {
  dateLabel: string;
  /** Medida buscada, ej. "205/55R16" — va en el encabezado. */
  sizeLabel?: string | null;
  /**
   * La medida que pidió el cliente. Cuando viene, cada tarjeta sale marcada
   * como MEDIDA EXACTA (verde) o como equivalente (sello rojo).
   */
  medidaPedida?: string | null;
  products: RenderLine[]; // quantity ignorada
}

export async function renderOptionsImage(data: OptionsRenderData): Promise<Buffer> {
  const lines = marcarExactitud(
    data.products.map((line) => toPosterLine(line, data.brandProfiles)),
    data.medidaPedida,
  );
  const node = optionsPoster(
    {
      dateLabel: data.dateLabel,
      // Con medida pedida, el encabezado muestra ESA: es la referencia contra
      // la que el cliente compara los sellos de cada tarjeta.
      sizeLabel: data.medidaPedida ?? data.sizeLabel ?? data.products[0]?.sizeLabel ?? null,
      lines,
    },
    themeOf(data),
  );
  return renderPng(node, POSTER_WIDTH);
}


export interface MedidaGuideRenderData extends PieceTheme {
  dateLabel: string;
  /** Aro que ya dijo el cliente, si lo dijo. */
  aroDelCliente?: number | null;
}

/**
 * La guía de «cómo leer su medida». No toca el catálogo —no muestra ni un
 * precio— así que se renderiza sin haber buscado nada, que es justo el momento
 * en que hace falta: cuando todavía no sabemos qué llanta usa el cliente.
 */
export async function renderMedidaGuideImage(data: MedidaGuideRenderData): Promise<Buffer> {
  const node = medidaGuidePoster(
    { dateLabel: data.dateLabel, aroDelCliente: data.aroDelCliente ?? null },
    themeOf(data),
  );
  return renderPng(node, POSTER_WIDTH);
}

async function renderPng(node: SatoriNode, width: number, height?: number): Promise<Buffer> {
  const svg = await satori(node as never, {
    width,
    // Sin alto: satori lo mide del contenido. Calcularlo a mano dejaba una
    // banda muerta abajo cuando la pieza traía menos marcas o beneficios.
    ...(height ? { height } : {}),
    fonts: loadFonts().map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  });
  // renderAsync, no render() (16-ago). `render()` es SÍNCRONO: rasterizar
  // 2.880 px de ancho por el alto que mida satori (los pósters de opciones
  // pasan de 10 Mpx) bloqueaba el único hilo de Node cientos de milisegundos
  // seguidos. Durante esa ventana el proceso no atiende NADA: ni el POST del
  // webhook —que está en el camino crítico del ack a Meta—, ni /health que
  // vigila Railway, ni el SSE del panel. La variante asíncrona hace el mismo
  // trabajo en el threadpool de libuv y deja el event loop libre.
  const png = await renderAsync(svg, { fitTo: { mode: "width", value: width * 2 } });
  return Buffer.from(png.asPng());
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

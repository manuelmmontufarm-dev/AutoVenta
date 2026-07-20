import { extractTireSizes, formatTireSize, type TireSize } from "./tireSize.js";
import { resolveCatalogMedia } from "./catalogMedia.js";
import { extractLoadSpeed, type TireLoadSpeed } from "./tireSpecs.js";

export type CatalogAvailability = "available" | "check" | "out";
export type PriceTier = "pvp1" | "pvp2" | "pvp3" | "pvp4";

export interface ContificoProductWire {
  id?: unknown;
  codigo?: unknown;
  nombre?: unknown;
  descripcion?: unknown;
  marca_nombre?: unknown;
  estado?: unknown;
  tipo?: unknown;
  pvp1?: unknown;
  pvp2?: unknown;
  pvp3?: unknown;
  pvp4?: unknown;
  porcentaje_iva?: unknown;
  cantidad_stock?: unknown;
  imagen?: unknown;
}

export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  brand: string;
  design: string;
  size: TireSize | null;
  sizeLabel: string | null;
  /** Precio cliente antes de IVA; es el valor que consume el PDF. */
  price: number;
  /** Precio base de Contífico antes de IVA. */
  sourcePrice: number;
  priceTier: PriceTier;
  prices: Record<PriceTier, number | null>;
  taxRate: number;
  customerPriceWithTax: number;
  minimumPriceWithTax: number;
  distributorPriceWithTax: number;
  stock: number;
  availability: CatalogAvailability;
  imageUrl: string | null;
  imageSource: string | null;
  loadSpeed: TireLoadSpeed | null;
  active: boolean;
  source: "contifico" | "sheets";
}

const PRICE_TIERS: PriceTier[] = ["pvp1", "pvp2", "pvp3", "pvp4"];
const FLOTATION_RE = /(?<!\d)(\d{2})\s*[xX]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:Z?R\s*)?(\d{2})(?!\d)/;

export function numberFromWire(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCatalogText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}.]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactCatalogText(value: string): string {
  return normalizeCatalogText(value).replace(/[^a-z0-9]/g, "");
}

export function extractCatalogSizeLabel(text: string): {
  size: TireSize | null;
  sizeLabel: string | null;
} {
  const metric = extractTireSizes(text)[0] ?? null;
  if (metric) return { size: metric, sizeLabel: formatTireSize(metric) };

  const flotation = text.match(FLOTATION_RE);
  if (!flotation) return { size: null, sizeLabel: null };
  const width = flotation[1];
  const section = flotation[2].replace(",", ".");
  const rim = flotation[3];
  return { size: null, sizeLabel: `${width}X${section}R${rim}` };
}

export function availabilityFromStock(stock: number): CatalogAvailability {
  if (stock <= 0) return "out";
  if (stock < 4) return "check";
  return "available";
}

export function normalizeContificoProduct(
  wire: ContificoProductWire,
  preferredTier: PriceTier,
  pricing: { customerDivisor: number; minimumDivisor: number } = {
    customerDivisor: 0.5625,
    minimumDivisor: 0.75,
  },
): CatalogItem | null {
  const id = text(wire.id);
  const code = text(wire.codigo);
  const name = text(wire.nombre) || text(wire.descripcion);
  if (!id || !code || !name) return null;
  if (text(wire.estado).toUpperCase() === "I") return null;
  if (text(wire.tipo).toUpperCase() === "SER") return null;

  const prices = Object.fromEntries(
    PRICE_TIERS.map((tier) => {
      const value = numberFromWire(wire[tier]);
      return [tier, value !== null && value > 0 ? round2(value) : null];
    }),
  ) as Record<PriceTier, number | null>;

  let priceTier = preferredTier;
  let sourcePrice = prices[preferredTier];
  if (sourcePrice === null) {
    const fallback = PRICE_TIERS.find((tier) => prices[tier] !== null);
    if (!fallback) return null;
    priceTier = fallback;
    sourcePrice = prices[fallback];
  }
  if (sourcePrice === null) return null;

  const brand = text(wire.marca_nombre) || inferBrand(name);
  const { size, sizeLabel } = extractCatalogSizeLabel(name);
  const stock = Math.max(0, numberFromWire(wire.cantidad_stock) ?? 0);
  const taxPercent = numberFromWire(wire.porcentaje_iva) ?? 0;
  const taxRate = taxPercent > 1 ? taxPercent / 100 : taxPercent;
  const customerDivisor = validDivisor(pricing.customerDivisor, 0.5625);
  const minimumDivisor = validDivisor(pricing.minimumDivisor, 0.75);
  const distributorPriceWithTax = round2(sourcePrice * (1 + taxRate));
  const minimumPriceWithTax = round2(distributorPriceWithTax / minimumDivisor);
  const customerPriceWithTax = round2(distributorPriceWithTax / customerDivisor);
  const customerPriceBeforeTax = round2(customerPriceWithTax / (1 + taxRate));
  const design = inferCatalogDesign(name, brand, sizeLabel);
  const media = resolveCatalogMedia(brand, design);

  return {
    id,
    code,
    name,
    brand: brand || "Sin marca",
    design,
    size,
    sizeLabel,
    price: customerPriceBeforeTax,
    sourcePrice,
    priceTier,
    prices,
    taxRate,
    customerPriceWithTax,
    minimumPriceWithTax,
    distributorPriceWithTax,
    stock,
    availability: availabilityFromStock(stock),
    imageUrl: media?.publicUrl ?? imageUrlFromWire(wire.imagen),
    imageSource: media?.sourceLabel ?? null,
    loadSpeed: extractLoadSpeed(name),
    active: true,
    source: "contifico",
  };
}

export function searchCatalog(
  items: readonly CatalogItem[],
  query: string,
  limit = 40,
): CatalogItem[] {
  const normalizedQuery = normalizeCatalogText(query);
  const compactQuery = compactCatalogText(query);
  if (!normalizedQuery || !compactQuery) return [];
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const querySize = extractCatalogSizeLabel(query).sizeLabel;
  const compactSize = querySize ? compactCatalogText(querySize) : null;

  return items
    .map((item) => ({ item, score: scoreItem(item, normalizedQuery, compactQuery, compactSize, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const availability = availabilityRank(a.item.availability) - availabilityRank(b.item.availability);
      if (availability !== 0) return availability;
      if (a.item.price !== b.item.price) return a.item.price - b.item.price;
      return a.item.name.localeCompare(b.item.name, "es");
    })
    .slice(0, Math.max(1, Math.min(limit, 60)))
    .map((entry) => entry.item);
}

function scoreItem(
  item: CatalogItem,
  query: string,
  compactQuery: string,
  compactSize: string | null,
  queryTokens: string[],
): number {
  const code = normalizeCatalogText(item.code);
  const design = normalizeCatalogText(item.design);
  const brand = normalizeCatalogText(item.brand);
  const name = normalizeCatalogText(item.name);
  const size = compactCatalogText(item.sizeLabel ?? "");
  const blob = `${code} ${brand} ${design} ${name} ${item.sizeLabel ?? ""}`;
  const compactBlob = compactCatalogText(blob);
  const everyTokenMatches = queryTokens.every((token) => blob.includes(token));

  let score = 0;
  if (compactCatalogText(code) === compactQuery) score += 180;
  if (compactCatalogText(design) === compactQuery) score += 150;
  if (compactSize && size === compactSize) score += 130;
  if (compactQuery === size) score += 130;
  if (brand === query) score += 80;
  if (name === query) score += 110;
  if (everyTokenMatches) score += 60 + queryTokens.length * 5;
  else if (compactBlob.includes(compactQuery)) score += 35;
  else return 0;
  if (compactSize && size === compactSize && queryTokens.some((token) => brand.includes(token))) {
    score += 35;
  }
  if (item.availability === "available") score += 8;
  if (item.availability === "out") score -= 6;
  return score;
}

function inferBrand(name: string): string {
  const known = ["Falken", "Kenda", "Winrun", "Sunoco", "Eurolub"];
  const normalized = normalizeCatalogText(name);
  return known.find((brand) => normalized.includes(brand.toLowerCase())) ?? "";
}

export function inferCatalogDesign(
  name: string,
  brand: string,
  sizeLabel: string | null,
): string {
  const upper = name.toUpperCase();
  const normalizedBrand = brand.toUpperCase();

  if (normalizedBrand.includes("KENDA")) {
    const model = upper.match(/\bKR\s*[- ]?\s*(\d{2,3}[A-Z]?)\b/);
    if (model) return `KR${model[1]}`;
  }

  if (normalizedBrand.includes("FALKEN")) {
    if (/\bWPRT0?1\b/.test(upper)) return "WILDPEAK R/T01";
    const azenis = upper.match(/\bAZENIS\s+FK\s*([0-9]{3}[A-Z]?)\b/);
    if (azenis) return `AZENIS FK${azenis[1]}`;
    const fk = upper.match(/\bFK\s*([0-9]{3}[A-Z]?)\b/);
    if (fk) return `FK${fk[1]}`;
    const ze = upper.match(/\bZE\s*([0-9]{3}[A-Z]*)\b/);
    if (ze) return `ZE${ze[1]}`;
    if (/\b(?:ZIEX\s+)?CT\s*60\s*(?:A\s*\/?\s*S|AS)?\b/.test(upper)) {
      return "ZIEX CT60 A/S";
    }
    if (/\bWILDPEAK\s+R\s*\/?\s*T\s*0?1\b/.test(upper)) {
      return "WILDPEAK R/T01";
    }
    if (/\bWILDPEAK\s+M\s*\/?\s*T(?:\s+MT0?1)?\b/.test(upper)) {
      return /\bMT0?1\b/.test(upper) ? "WILDPEAK M/T01" : "WILDPEAK M/T";
    }
    const wildpeakAt = upper.match(
      /\bWILDPEAK\s+A\s*\/?\s*T\s*(4W|TRAIL|AT3W)?\b/,
    );
    if (wildpeakAt) {
      const variant = wildpeakAt[1] ?? "";
      if (variant === "4W") return "WILDPEAK A/T 4W";
      if (variant === "TRAIL") return "WILDPEAK A/T TRAIL";
      if (variant === "AT3W") return "WILDPEAK A/T3W";
      return "WILDPEAK A/T";
    }
  }

  if (normalizedBrand.includes("WINRUN")) {
    if (/\bR330\s*-?\s*E\b/.test(upper)) return "R330-E";
    const radial = upper.match(/\b(R330|R380)\b/);
    if (radial) return radial[1];
    if (/\bMT305\b/.test(upper)) return "MT305";
    if (/\bMAXCLAW\s+H\s*\/?\s*T2\b/.test(upper)) return "MAXCLAW H/T2";
    if (/\bMAXCLAW\s+R\s*\/?\s*T\b/.test(upper)) return "MAXCLAW R/T";
    if (/\bMAXCLAW\s+A\s*\/?\s*T\b/.test(upper)) return "MAXCLAW A/T";
  }

  let design = name;
  if (brand) design = replaceLiteral(design, brand, " ");
  if (sizeLabel) {
    const parts = sizeLabel.match(/\d+(?:[/.X]\d+)?/g) ?? [];
    for (const part of parts) design = replaceLiteral(design, part, " ");
  }
  design = design
    .replace(/\b\d{2,3}(?:\s*\/\s*\d{2,3})?\s*[A-Z]\b/gi, " ")
    .replace(/\b(?:\d{1,3}PR|\d{1,3}P|OWL|BL|TL|XL|E4)\b/gi, " ")
    .replace(/\b\d{2,3}\b/g, " ")
    .replace(/\b(?:LT|ZR|R|TL|XL)\b/gi, " ")
    .replace(/\b\d{2,3}[A-Z]\b/gi, " ")
    .replace(/[/()_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return design || name;
}

function imageUrlFromWire(value: unknown): string | null {
  if (typeof value === "string") return isHttp(value) ? value : null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = imageUrlFromWire(entry);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["url", "imagen", "ruta", "archivo", "src"]) {
    const found = imageUrlFromWire(record[key]);
    if (found) return found;
  }
  return null;
}

function isHttp(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function replaceLiteral(value: string, search: string, replacement: string): string {
  if (!search) return value;
  return value.replace(new RegExp(escapeRegExp(search), "gi"), replacement);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function availabilityRank(value: CatalogAvailability): number {
  return value === "available" ? 0 : value === "check" ? 1 : 2;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function validDivisor(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

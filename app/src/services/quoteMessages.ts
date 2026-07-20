import { business } from "../config.js";
import type { CatalogItem } from "../domain/catalog.js";

export interface CatalogQuoteSelection {
  product: CatalogItem;
  quantity: number;
}

export type CustomerMessageStyle = "comparison" | "customer";

export function buildComparisonMessage(products: readonly CatalogItem[]): string {
  const lines = products.flatMap((product) => [
    `🔹 ${product.brand} ${product.design} — ${product.sizeLabel ?? product.name}`,
    `   💰 ${money(product.minimumPriceWithTax)} (antes ${money(product.customerPriceWithTax)}, −${discount(product)}%)`,
    ...(specLine(product) ? [`   📦 ${specLine(product)}`] : []),
    `   ⭐ ${warrantyForBrand(product.brand).factory}`,
    ...(warrantyForBrand(product.brand).roadHazard
      ? [`   🔒 ${warrantyForBrand(product.brand).roadHazard}`]
      : []),
    "",
  ]);
  return [
    `Comparativa de Llantas — ${dateLabel()}`,
    "",
    ...lines,
    "Precios por unidad incluyen IVA y Ecovalor.",
  ]
    .join("\n")
    .trim();
}

export function buildCustomerOptionsMessage(
  products: readonly CatalogItem[],
  customerName = "",
): string {
  const groups = new Map<string, CatalogItem[]>();
  for (const product of products) {
    const current = groups.get(product.brand) ?? [];
    current.push(product);
    groups.set(product.brand, current);
  }
  const lines: string[] = [
    `Hola${cleanName(customerName) ? ` ${cleanName(customerName)}` : ""}, opciones disponibles:`,
    "",
  ];
  for (const [brand, brandProducts] of groups) {
    lines.push(`${brandEmoji(brand)} ${brand.toUpperCase()}`);
    for (const product of brandProducts) {
      const warranty = warrantyForBrand(product.brand);
      lines.push(
        `• ${product.design} — ${money(product.customerPriceWithTax)} → ${money(product.minimumPriceWithTax)}`,
        `  ${availabilityLine(product)}`,
        ...(specLine(product) ? [`  📦 ${specLine(product)}`] : []),
        `  ⭐ ${warranty.factory}`,
        ...(warranty.roadHazard ? [`  🔒 ${warranty.roadHazard}`] : []),
      );
    }
    lines.push("");
  }
  lines.push("Precios por unidad incluyen IVA y Ecovalor.", "Cotización válida por 3 días.");
  return lines.join("\n").trim();
}

export function buildDistributorOptionsMessage(
  products: readonly CatalogItem[],
): string {
  const lines = products.flatMap((product) => {
    const stock =
      product.availability === "available"
        ? `Disponible (${Math.floor(product.stock)})`
        : product.availability === "check"
          ? `Consultar (${Math.floor(product.stock)})`
          : "Agotada";
    return [
      `🔹 ${product.brand} ${product.design} — ${product.sizeLabel ?? product.name}`,
      `   Cliente ${money(product.minimumPriceWithTax)} · PVP ${money(product.customerPriceWithTax)}`,
      `   🔒 Distribuidor ${money(product.distributorPriceWithTax)}`,
      `   📦 ${stock}${specLine(product) ? ` · ${specLine(product)}` : ""}`,
      "",
    ];
  });
  return [
    `Opciones para distribuidor — ${dateLabel()}`,
    "",
    ...lines,
    "Valores incluyen IVA. Confirma stock antes de cerrar el pedido.",
  ]
    .join("\n")
    .trim();
}

export function buildSingleQuoteMessage(
  selection: CatalogQuoteSelection,
  customerName = "",
): string {
  const { product, quantity } = selection;
  const warranty = warrantyForBrand(product.brand);
  const total = product.minimumPriceWithTax * quantity;
  return [
    `Hola${cleanName(customerName) ? ` ${cleanName(customerName)}` : ""} 👋`,
    "",
    `Cotización — ${dateLabel()}`,
    `${brandEmoji(product.brand)} ${product.brand} ${product.design} — ${product.sizeLabel ?? product.name}`,
    `💰 ${money(product.minimumPriceWithTax)} c/u (antes ${money(product.customerPriceWithTax)}, −${discount(product)}%)`,
    `🛞 ${quantity} llanta${quantity === 1 ? "" : "s"}: ${money(total)}`,
    ...(specLine(product) ? [`📦 ${specLine(product)}`] : []),
    availabilityLine(product),
    `⭐ ${warranty.factory}`,
    ...(warranty.roadHazard ? [`🔒 ${warranty.roadHazard}`] : []),
    "",
    "Precio incluye IVA y Ecovalor. Válida por 3 días o hasta agotar stock.",
    "¿Deseas que coordinemos instalación o retiro?",
  ]
    .join("\n")
    .trim();
}

/** Compatibilidad temporal con consumidores anteriores. */
export function buildCustomerQuoteMessage(
  selections: readonly CatalogQuoteSelection[],
  customerName = "",
): string {
  return selections.length === 1
    ? buildSingleQuoteMessage(selections[0], customerName)
    : buildCustomerOptionsMessage(
        selections.map(({ product }) => product),
        customerName,
      );
}

export function warrantyForBrand(brand: string): {
  factory: string;
  roadHazard: string | null;
  roadHazardMonths: number | null;
} {
  const normalized = brand.toLowerCase();
  const roadHazardMonths = normalized.includes("falken")
    ? 18
    : normalized.includes("kenda")
      ? 12
      : normalized.includes("winrun")
        ? 6
        : null;
  return {
    factory: "5 años garantía de fábrica contra defectos de fabricación",
    roadHazard: roadHazardMonths
      ? `${roadHazardMonths} meses contra golpes y estalladuras`
      : null,
    roadHazardMonths,
  };
}

function specLine(product: CatalogItem): string | null {
  if (!product.loadSpeed) return null;
  const details = [
    product.loadSpeed.loadKg ? `${product.loadSpeed.loadKg}kg` : null,
    product.loadSpeed.speedKmh ? `${product.loadSpeed.speedKmh}km/h` : null,
  ].filter(Boolean);
  return details.length
    ? `${product.loadSpeed.code} (${details.join(" · ")})`
    : product.loadSpeed.code;
}

function availabilityLine(product: CatalogItem): string {
  return product.availability === "available"
    ? "✅ Disponible"
    : product.availability === "check"
      ? "⚠️ Consultar disponibilidad"
      : "⛔ Agotada";
}

function discount(product: CatalogItem): number {
  if (product.customerPriceWithTax <= 0) return 0;
  return Math.round(
    (1 - product.minimumPriceWithTax / product.customerPriceWithTax) * 100,
  );
}

function brandEmoji(brand: string): string {
  const normalized = brand.toLowerCase();
  if (normalized.includes("falken")) return "🔵";
  if (normalized.includes("kenda")) return "🔴";
  if (normalized.includes("winrun")) return "🟢";
  return "⚫";
}

function cleanName(value: string): string {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.toLowerCase() === "cliente" ? "" : clean;
}

function dateLabel(): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Guayaquil",
  }).format(new Date());
}

function money(value: number): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: business.currency,
    minimumFractionDigits: 2,
  }).format(value);
}

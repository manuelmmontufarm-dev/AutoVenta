import { business } from "../config.js";
import type { CatalogItem } from "../domain/catalog.js";
import { getTirePatternProfile } from "../domain/tireKnowledge.js";

export interface CatalogQuoteSelection {
  product: CatalogItem;
  quantity: number;
}

export type CustomerMessageStyle = "comparison" | "customer";

/**
 * Separador de bloques. El agente y las tools lo emiten; index.ts lo convierte
 * en varios mensajes cortos seguidos, que es como escribe un vendedor humano.
 */
export const BLOCK_SEPARATOR = "\n\n---\n\n";

/** Tope de bloques por turno: más que esto se lee como spam. */
export const MAX_BLOCKS = 4;

/** Une bloques descartando los vacíos y respetando el tope. */
export function composeBlocks(...blocks: (string | null | undefined)[]): string {
  return blocks
    .map((block) => block?.trim() ?? "")
    .filter(Boolean)
    .slice(0, MAX_BLOCKS)
    .join(BLOCK_SEPARATOR);
}

/**
 * Parte una respuesta en los mensajes que se van a enviar.
 * Tolerante con el modelo: acepta 3 o más guiones y espacios alrededor.
 */
export function splitBlocks(reply: string): string[] {
  return reply
    .split(/\n\s*-{3,}\s*\n/)
    .map((block) => aWhatsApp(block.trim()))
    .filter(Boolean)
    .slice(0, MAX_BLOCKS);
}

/**
 * Negrita de Markdown → negrita de WhatsApp.
 *
 * El prompt pide `*texto*`, pero el modelo se escapa a `**texto**` cada tantos
 * mensajes y WhatsApp lo muestra con los asteriscos a la vista. Se corrige aquí
 * y no con más instrucciones: una regla determinista no falla el 3 % de las
 * veces. También cae `__texto__`, que WhatsApp tampoco entiende.
 */
export function aWhatsApp(texto: string): string {
  return texto
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/__([^_\n]+)__/g, "*$1*");
}

/* ------------------------------------------------------------------ *
 * Captions — la imagen ES el mensaje.
 *
 * La pieza visual ya lleva marca, diseño, medida, precio tachado, precio de
 * hoy, índice de carga, disponibilidad y garantías. Repetir todo eso en texto
 * es el muro que el cliente reportó que nadie lee. El caption solo aporta lo
 * que la imagen no puede.
 * ------------------------------------------------------------------ */

/**
 * Cierre de las opciones. Antes aquí iba un bloque «Yo iría por la X porque…»
 * ANTES de la imagen, y el turno cerraba con «¿Cuál le llama más la atención?».
 *
 * Joaquín lo mandó a quitar el 6-ago viendo la conversación real: con el
 * preámbulo, la imagen, el INCLUYE y la pregunta, la cadena se volvía tan larga
 * que «los mijines ya no leen» — y la recomendación, que es lo que más pesa, se
 * perdía en el muro. Ahora la recomendación no se adelanta: se OFRECE. El bot
 * la tiene lista (`recomendado` + `motivo` de preparar_opciones) y la da en una
 * frase solo si el cliente dice que sí, cuando ya está mirando la pieza.
 */
export const PREGUNTA_RECOMENDACION = "¿Necesita alguna recomendación?";

/** Cotización: número, total y vigencia. El desglose ya está en la imagen. */
export function buildSingleQuoteCaption(
  selection: CatalogQuoteSelection,
  quoteNumber?: string,
  offerDiscount?: { finalTotal: number; condition: string; expiresAt?: Date | null },
): string {
  const { product, quantity } = selection;
  const total = offerDiscount?.finalTotal ?? product.minimumPriceWithTax * quantity;
  const lines = [
    `Aquí está su cotización${quoteNumber ? ` *${quoteNumber}*` : ""} 👆`,
    "",
    `${quantity} × ${product.brand} ${product.design}: ${money(total)} (${money(product.minimumPriceWithTax)} c/u, IVA incluido).`,
  ];
  if (offerDiscount) {
    lines.push(
      `El descuento extra aplica si ${offerDiscount.condition}${
        offerDiscount.expiresAt ? `, hasta el ${shortDate(offerDiscount.expiresAt)}` : ""
      }.`,
    );
  }
  if (quoteNumber) lines.push(`Presente el número *${quoteNumber}* en la tienda.`);
  return lines.join("\n");
}

/** Comparativa: una línea por modelo con la diferencia práctica, no la ficha. */
export function buildComparisonCaption(products: readonly CatalogItem[]): string {
  return [
    "Le dejo la comparativa 👆",
    "",
    ...products.map((product) => {
      const profile = getTirePatternProfile(product.brand, product.design);
      return `${brandEmoji(product.brand)} *${product.brand} ${product.design}* — ${
        profile ? profile.category : "ver ficha"
      } · ${money(product.minimumPriceWithTax)} c/u`;
    }),
  ].join("\n");
}

export function buildComparisonMessageDetallado(products: readonly CatalogItem[]): string {
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

/**
 * Muro completo de opciones. Ya NO es el camino normal: solo se usa cuando la
 * imagen no salió, para que el cliente nunca se quede sin la información.
 */
export function buildCustomerOptionsMessageDetallado(
  products: readonly CatalogItem[],
  _customerName = "",
): string {
  const groups = new Map<string, CatalogItem[]>();
  for (const product of products) {
    const current = groups.get(product.brand) ?? [];
    current.push(product);
    groups.set(product.brand, current);
  }
  // Esta pieza normalmente se envía a mitad de una conversación activa.
  // No reinicia el saludo ni repite el nombre del cliente.
  const lines: string[] = ["Opciones disponibles:", ""];
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
  lines.push("Precios por unidad incluyen IVA y Ecovalor.", "Confirma vigencia y stock al momento de comprar.");
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

/** Cotización completa en texto. Respaldo para cuando la imagen y el PDF fallan. */
export function buildSingleQuoteMessageDetallado(
  selection: CatalogQuoteSelection,
  customerName = "",
  quoteNumber?: string,
  saleNumber?: string,
  offerDiscount?: { amount: number; finalTotal: number; condition: string; expiresAt?: Date | null },
): string {
  const { product, quantity } = selection;
  const warranty = warrantyForBrand(product.brand);
  const total = offerDiscount?.finalTotal ?? product.minimumPriceWithTax * quantity;
  return [
    `📄 Cotización${quoteNumber ? ` ${quoteNumber}` : ""} — ${dateLabel()}`,
    `${brandEmoji(product.brand)} ${product.brand} ${product.design} — ${product.sizeLabel ?? product.name}`,
    `💰 ${money(product.minimumPriceWithTax)} c/u (antes ${money(product.customerPriceWithTax)}, −${discount(product)}%)`,
    `🛞 ${quantity} llanta${quantity === 1 ? "" : "s"}: ${money(total)}`,
    ...(offerDiscount ? [
      `1️⃣ Descuento base Depot Tire: de ${money(product.customerPriceWithTax)} a ${money(product.minimumPriceWithTax)} c/u (−${discount(product)}%).`,
      `2️⃣ Descuento EXTRA del asesor: −${money(offerDiscount.amount)}.`,
      `⚠️ Este segundo descuento aplica ÚNICAMENTE si: ${offerDiscount.condition}.`,
      `💰 Total final cumpliendo la condición: ${money(total)}. Si no la cumple, conserva solo el precio base.`,
      quoteNumber ? `🔖 Para validar el descuento en tienda, presenta la cotización *${quoteNumber}*.` : "",
    ] : []),
    ...(specLine(product) ? [`📦 ${specLine(product)}`] : []),
    availabilityLine(product),
    `⭐ ${warranty.factory}`,
    ...(warranty.roadHazard ? [`🔒 ${warranty.roadHazard}`] : []),
    "",
    offerDiscount?.expiresAt
      ? `Precio incluye IVA y Ecovalor. Oferta vigente hasta ${offerDiscount.expiresAt.toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}.`
      : "Precio incluye IVA y Ecovalor. Vigencia por confirmar con el asesor.",
    saleNumber ? `🔖 Número de venta: ${saleNumber}` : "",
    "📍 ¿En qué sector estás o puedes compartir tu ubicación? Así te indico el local más cercano.",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Compatibilidad temporal con consumidores anteriores. */
export function buildCustomerQuoteMessage(
  selections: readonly CatalogQuoteSelection[],
  customerName = "",
): string {
  return selections.length === 1
    ? buildSingleQuoteMessageDetallado(selections[0], customerName)
    : buildCustomerOptionsMessageDetallado(
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

function shortDate(value: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Guayaquil",
  }).format(value);
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

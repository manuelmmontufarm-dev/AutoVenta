export type DiscountKind = "total_amount" | "percentage" | "final_price";

export interface DiscountDraft {
  kind: DiscountKind;
  valueCents: number;
  confidence: "high" | "medium";
  condition: string | null;
}

export interface PriceBreakdown {
  baseTotalCents: number;
  discountAmountCents: number;
  finalTotalCents: number;
}

const moneyToCents = (value: string): number =>
  Math.round(Number(value.replace(",", ".")) * 100);

export function calculateDiscount(
  baseTotalCents: number,
  kind: DiscountKind,
  valueCents: number,
): PriceBreakdown {
  if (!Number.isInteger(baseTotalCents) || baseTotalCents <= 0) {
    throw new Error("La cotización base no es válida");
  }
  if (!Number.isInteger(valueCents) || valueCents <= 0) {
    throw new Error("El descuento debe ser mayor a cero");
  }
  const discountAmountCents =
    kind === "percentage"
      ? Math.round(baseTotalCents * (valueCents / 10_000))
      : kind === "final_price"
        ? baseTotalCents - valueCents
        : valueCents;
  if (discountAmountCents <= 0 || discountAmountCents >= baseTotalCents) {
    throw new Error("El descuento debe ser menor al total de la cotización");
  }
  return {
    baseTotalCents,
    discountAmountCents,
    finalTotalCents: baseTotalCents - discountAmountCents,
  };
}

/**
 * Detecta únicamente ofertas explícitas. Números de medida, IVA, garantías y
 * cantidades no se interpretan como descuento.
 */
export function detectManualDiscount(text: string): DiscountDraft | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const conditionMatch = normalized.match(/\bsi\s+(.{3,160}?)(?:[.!?]|$)/i);
  const condition = conditionMatch?.[1]?.trim() ?? null;

  const percent = normalized.match(/(?:descuento|rebaja|ahorro)[^\d]{0,20}(\d{1,2}(?:[.,]\d+)?)\s*%|(\d{1,2}(?:[.,]\d+)?)\s*%[^\n]{0,40}(?:(?:descuento|rebaja|ahorro)|\bsi\b)/i);
  if (percent) {
    const points = Math.round(Number((percent[1] ?? percent[2]).replace(",", ".")) * 100);
    if (points > 0 && points < 10_000) {
      return { kind: "percentage", valueCents: points, confidence: "high", condition };
    }
  }

  const finalPrice = normalized.match(/(?:te\s+(?:la|lo)?\s*dejo|te\s+queda|precio\s+final|total)[^$\d]{0,18}\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)/i);
  if (finalPrice && /descuento|rebaja|oferta|te\s+(?:la|lo)?\s*dejo|te\s+queda/i.test(normalized)) {
    return {
      kind: "final_price",
      valueCents: moneyToCents(finalPrice[1]),
      confidence: "medium",
      condition,
    };
  }

  const amount = normalized.match(/(?:descuento|rebaja|ahorro)[^$\d]{0,20}\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)(?:\s*(?:dolares|usd))?|\$\s*(\d{1,6}(?:[.,]\d{1,2})?)[^\n]{0,24}(?:de\s+)?(?:descuento|rebaja|ahorro)/i);
  if (amount) {
    const cents = moneyToCents(amount[1] ?? amount[2]);
    if (cents > 0) return { kind: "total_amount", valueCents: cents, confidence: "high", condition };
  }
  return null;
}

export function buildDiscountCustomerMessage(input: {
  quoteNumber?: string | null;
  discountAmountCents: number;
  finalTotalCents: number;
  condition: string;
  expiresAt?: Date | null;
  percentage?: number | null;
}): string {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const quote = input.quoteNumber ? ` en la cotización ${input.quoteNumber}` : "";
  const expiration = input.expiresAt
    ? ` Esta oferta está vigente hasta ${input.expiresAt.toLocaleString("es-EC", { timeZone: "America/Guayaquil", dateStyle: "medium", timeStyle: "short" })}.`
    : "";
  const amount = input.percentage
    ? `${input.percentage.toLocaleString("es-EC")}% (${money(input.discountAmountCents)})`
    : money(input.discountAmountCents);
  const validation = input.quoteNumber
    ? ` Para validarlo en la tienda, presenta el número de cotización *${input.quoteNumber}*.`
    : " Se aplicará en tu próxima cotización y, para validarlo en la tienda, deberás presentar ese número.";
  return `Un asesor decidió que eres elegible para un descuento de ${amount}${quote} si ${input.condition.trim()}. El total quedaría en ${money(input.finalTotalCents)}.${expiration}${validation} ¿Quieres que coordinemos el siguiente paso? 😊`;
}

/** Guardas deterministas del flujo: el LLM no puede saltárselas. */

export function isComparisonRequest(text: string): boolean {
  const normalized = normalize(text);
  return /\b(compar|diferencia|cual es mejor|cu[aá]l conviene|mejor entre)\w*/.test(normalized);
}

export function isExplicitPurchaseConfirmation(text: string): boolean {
  const normalized = normalize(text);
  return /\b(ya (?:las? )?compr[eé]|acabo de comprar|ya pagu[eé]|compra (?:hecha|realizada)|pago realizado)\b/.test(
    normalized,
  );
}

export function hasExplicitQuantity(text: string): boolean {
  return extractExplicitQuantity(text) !== null;
}

export function extractExplicitQuantity(text: string): number | null {
  const normalized = normalize(text);
  if (/^[1-8]$/.test(normalized)) return Number(normalized);
  const words: Record<string, number> = {
    un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
    cinco: 5, seis: 6, siete: 7, ocho: 8,
  };
  const match = normalized.match(
    /\b([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\s+(?:llantas?|unidades?)\b|\b(?:quiero|necesito|deme|dame|cotiza(?:me)?|llevo|serian|serían)\s+(?:las?\s+)?([1-8]|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho)\b/,
  );
  const value = match?.[1] ?? match?.[2];
  if (!value) return null;
  return /^\d$/.test(value) ? Number(value) : words[value] ?? null;
}

export function extractVehicleYear(text: string): number | null {
  const match = normalize(text).match(/\b(19[5-9]\d|20[0-2]\d|2030)\b/);
  return match ? Number(match[1]) : null;
}

export function canGenerateFinalQuote(
  text: string,
  comparedThisTurn = false,
  confirmedQuantity = false,
): boolean {
  return !comparedThisTurn && !isComparisonRequest(text) &&
    (hasExplicitQuantity(text) || confirmedQuantity);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

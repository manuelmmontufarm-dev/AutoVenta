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
  const normalized = normalize(text);
  return /\b([1-8]|un[ao]?|dos|tres|cuatro|cinco|seis|siete|ocho)\s*(?:llantas?|unidades?)?\b/.test(
    normalized,
  );
}

export function canGenerateFinalQuote(text: string, comparedThisTurn = false): boolean {
  return !comparedThisTurn && !isComparisonRequest(text) && hasExplicitQuantity(text);
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

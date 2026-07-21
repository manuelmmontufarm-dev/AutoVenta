function tokens(value: string): Set<string> {
  const stop = new Set(["para", "puedo", "puede", "necesito", "cliente", "mejor", "ayudarle", "ayudarte", "favor"]);
  return new Set(value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((word) => word.length > 3 && !stop.has(word)));
}

export function replySimilarity(a: string, b: string): number {
  const aa = tokens(a); const bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  return [...aa].filter((word) => bb.has(word)).length / Math.min(aa.size, bb.size);
}

export function looksRepetitiveReply(candidate: string, previous: string[]): boolean {
  const fitmentLoop = /(?:medida verificada|etiqueta de la puerta|version o motor|pa[ií]s.*fabricad)/i;
  return previous.some((message) => replySimilarity(candidate, message) >= 0.72) ||
    (fitmentLoop.test(candidate) && previous.some((message) => fitmentLoop.test(message)));
}

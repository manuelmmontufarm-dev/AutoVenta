/**
 * Cómo se le nombran al cliente los aros que hay.
 *
 * Nace del ticket 2150 (8-ago-2026): preguntar «¿qué aro usa?» en seco es una
 * pregunta más encima de las tres que ya se le hicieron. Preguntarlo diciendo
 * cuáles tenemos convierte la pregunta en una oferta, y de paso le ahorra al
 * cliente descubrir después que su aro no lo manejamos.
 *
 * Vive aquí y no en tools.ts porque es puro formato (sin base ni catálogo) y así
 * se puede probar sin levantar nada — mismo criterio que opcionesCandados.
 */

/**
 * "13 al 20" cuando los aros son corridos; "13, 15 y 17" cuando hay huecos.
 *
 * Decirlo como rango se lee mejor, pero solo vale si de verdad están todos: un
 * rango con huecos manda al cliente a preguntar por un aro que no existe, y esa
 * es justo la decepción que la frase venía a evitar. Devuelve null cuando no hay
 * nada que nombrar, para que quien llame decida callarse en vez de prometer.
 */
export function rangoDeAros(aros: readonly number[]): string | null {
  const limpios = [...new Set(aros)].sort((a, b) => a - b);
  if (!limpios.length) return null;
  if (limpios.length === 1) return String(limpios[0]);
  const corridos = limpios.every((aro, i) => i === 0 || aro === limpios[i - 1] + 1);
  if (corridos) return `${limpios[0]} al ${limpios[limpios.length - 1]}`;
  return `${limpios.slice(0, -1).join(", ")} y ${limpios[limpios.length - 1]}`;
}

/**
 * El aro que el cliente tiene sobre la mesa en un texto suyo.
 *
 * Producción, 31-ago-2026 (conv 3 c20): el cliente venía de «una rin 15»,
 * rechazó el ancho 185, y el turno siguiente le mandó opciones de 205/55R16 —
 * aro 16 — porque el modelo barato inventó la medida al buscar. El aro dicho
 * por el cliente es un dato suyo y tiene que poder leerse determinísticamente.
 *
 * Una medida completa manda sobre el aro suelto: «mejor una 205/55R16» cambia
 * el aro aunque antes haya dicho «rin 15».
 */
export function aroEnTexto(texto: string): number | null {
  const n = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const completas = [...n.matchAll(/\b\d{3}\/\d{2,3}\s*z?r?\s*(1[2-9]|2[0-4])\b/g)]
    .map((m) => Number(m[1]));
  if (completas.length) return completas[completas.length - 1];
  const sueltos = [...n.matchAll(/\b(?:rin(?:es)?|aros?|ring)\s*(1[2-9]|2[0-4])\b|\br(1[2-9]|2[0-4])\b/g)]
    .map((m) => Number(m[1] ?? m[2]));
  return sueltos.length ? sueltos[sueltos.length - 1] : null;
}

/** El aro vigente de la visita: la última mención del cliente manda. */
export function aroVigenteDeLaVisita(textosCronologicos: readonly string[]): number | null {
  for (let i = textosCronologicos.length - 1; i >= 0; i--) {
    const aro = aroEnTexto(textosCronologicos[i] ?? "");
    if (aro != null) return aro;
  }
  return null;
}

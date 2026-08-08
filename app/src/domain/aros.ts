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

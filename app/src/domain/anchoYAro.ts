/**
 * «235 rin 15»: el cliente dio ANCHO y ARO, sin el perfil.
 *
 * El error de la demo de Mundillantas (4-nov-2026, 28:14): a «235 rin 15» el
 * bot contestó con 205/65, 185/65 y 195/55 — la vitrina del aro 15 completa,
 * ignorando el 235. La búsqueda por aro no recibía el ancho, así que la
 * escalera elegía por precio entre TODOS los anchos del aro. Afecta a Depot
 * igual.
 *
 * Detecta «235 rin 15», «235 R15», «235 aro 15» y «rin 15 235». Una medida
 * completa (235/60R15) NO es de esta ruta: esa ya tiene la suya.
 */

export interface AnchoYAro {
  ancho: number;
  aro: number;
}

/** Anchos métricos reales: 125–355, terminados en 5. */
const ANCHO = "(?:1[2-9]5|2[0-9]5|3[0-5]5)";
const ARO = "(?:1[2-9]|2[0-4])";

export function anchoYAro(texto: string): AnchoYAro | null {
  const n = (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  // Una medida completa manda por su propia ruta: se tacha antes de buscar,
  // para que «mejor 235/60R15» no caiga aquí por el «235 … 15» que contiene.
  const sinCompletas = n.replace(/\d{2,3}\s*\/\s*\d{2,3}\s*z?r?\s*\d{2}/g, " ").replace(/\d{2}\s*x\s*\d{1,2}[.,]?\d{0,2}\s*r?\s*\d{2}/g, " ");
  // «235 rin 15», «235 r15», «235 aro 15»
  const directo = sinCompletas.match(
    new RegExp(`\\b(${ANCHO})\\s*(?:en\\s+)?(?:z?r|rin(?:es)?|aros?|ring)\\s*\\.?\\s*(${ARO})\\b`),
  );
  if (directo) return { ancho: Number(directo[1]), aro: Number(directo[2]) };
  // «rin 15 235»
  const invertido = sinCompletas.match(
    new RegExp(`\\b(?:rin(?:es)?|aros?|ring)\\s*(${ARO})\\b[^0-9]{0,12}\\b(${ANCHO})\\b`),
  );
  if (invertido) return { ancho: Number(invertido[2]), aro: Number(invertido[1]) };
  return null;
}

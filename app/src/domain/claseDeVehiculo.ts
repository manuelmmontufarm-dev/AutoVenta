/**
 * A UNA CAMIONETA NO SE LE MUESTRAN LLANTAS DE AUTO.
 *
 * Auditoría 13–18 sep, familia 2 (9 chats, 4 graves). La regla «el aro solo ya
 * alcanza para mostrar opciones» busca por aro sin mirar qué vehículo dijo el
 * cliente, y la escalera elige por precio: en un aro, lo más barato es lo más
 * angosto y de perfil más bajo.
 *
 *   conv 20211, 14-sep  «Precio Rin 17 para camioneta 4x4» → Falken ZE310,
 *     Kenda KR20 y Winrun R330 en 215/40R17 y 205/45R17. Era una 265/65R17.
 *   conv 20645, 15-sep  un SUV de 245/45R20 → las mismas tres tarjetas.
 *   conv 20527, 14-sep  anuncio de la Kenda KR601 + «en rin 16» → llantas de auto.
 *
 * Puro. Devuelve la clase solo cuando el texto la dice; ante la duda, null, y
 * la búsqueda se queda como estaba.
 */
const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const CAMIONETA =
  /\b(?:camionetas?|4\s?x\s?4|4wd|awd|pick\s?-?up|doble\s+cabina|cabina\s+(?:simple|doble)|todo\s?terreno|jeep|suv|hilux|d\s?-?max|dmax|luv|bt\s?-?50|b\s?-?2[026]00|ranger|f\s?-?150|amarok|frontier|navara|np300|l\s?200|triton|fortuner|prado|land\s?cruiser|4runner|montero|vitara|grand\s+vitara|tucson|santa\s?fe|sportage|sorento|rav\s?4|cr\s?-?v|x\s?-?trail|captiva|trailblazer|tahoe|explorer|wrangler|cherokee|duster|haval|jolion|tiggo|great\s?wall|wingle|poer|jac\s+t\d|t6|t8|mahindra|scorpio|pik\s?up|klever|cualquier\s+terreno|off\s?-?road|all\s+terrain|a\/t|r\/t|m\/t|h\/t)\b/;

/** «camioneta» cuando el texto nombra una camioneta, un SUV, un 4x4 o una llanta de ese mundo. */
export function claseDeVehiculoEnTexto(textos: readonly (string | null | undefined)[]): "camioneta" | null {
  return textos.some((t) => t && CAMIONETA.test(normalizar(t))) ? "camioneta" : null;
}

/** Tipos de llanta que monta una camioneta o un SUV. */
export const TIPOS_DE_CAMIONETA: readonly string[] = ["H/T", "A/T", "R/T", "M/T", "TURISMO SUV", "COMERCIAL"];

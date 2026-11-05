/**
 * Aros (rines) como PRODUCTO, no como la medida de una llanta.
 *
 * Nace del pitch de Mundillantas (4-nov-2026): Jenny vende aros además de
 * llantas, y todo el bot entendía «aro 15» como el rin de una llanta — «¿tienen
 * aros de 15?» disparaba la vitrina de llantas del aro 15. Los aros viven en
 * una lista APARTE del catálogo de llantas: nunca se mezclan con una búsqueda
 * de llantas, y las herramientas de aros solo existen si el catálogo los trae
 * (Depot no los ve; su ruteo por aro queda idéntico).
 */

export interface AroProducto {
  id: string;
  codigo: string;
  nombre: string;
  marca: string;
  /** Diámetro en pulgadas (12–24). */
  diametro: number;
  ancho?: number;
  pernos?: number;
  offset?: number;
  acabado?: string;
  /** Precio final al cliente, CON IVA (el IVA se sumó una sola vez al importar). */
  precio: number;
  stock: number;
  imageUrl: string | null;
}

let aros: AroProducto[] = [];

/** La lista vigente de aros del catálogo. Vacía = este negocio no vende aros. */
export function arosDelCatalogo(): AroProducto[] {
  return aros;
}

/** La fija la sincronización del catálogo (solo la fuente `archivo` trae aros). */
export function cargarArosDelCatalogo(lista: AroProducto[]): void {
  aros = lista;
}

const sinTildes = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Una medida de llanta (completa o «ancho + aro») delata que habla de llantas. */
const MEDIDA_DE_LLANTA = /\d{2,3}\s*\/\s*\d{2}|\d{2}\s*x\s*\d{1,2}[.,]?\d{0,2}\s*r?\s*\d{2}|\b(?:1[2-9]5|2[0-9]5|3[0-5]5)\s*(?:z?r|rin(?:es)?|aros?)\s*\.?\s*\d{2}\b/i;

/** Palabras que solo tienen sentido comprando el rin, no la llanta. */
const ATRIBUTO_DE_ARO = /\bpernos?\b|\bde\s+lujo\b|\bdeportivos?\b|\bcromados?\b|\bde\s+(?:magnesio|aluminio|acero)\b|\breplicas?\b|\boriginales?\b/;

/** Intención de compra alrededor de la palabra aros/rines. */
const INTENCION = /\b(?:tienen?|venden?|hay|busco|quiero|necesito|precios?\s+de|cotiza(?:me|r)?|manejan?|me\s+interesan?)\b/;

/**
 * ¿Pregunta por aros/rines COMO PRODUCTO? Puro, sin catálogo.
 *
 * Verdadero: «tienen aros de 15?», «rines de 4 pernos», «aros de lujo»,
 * «venden rines?». Falso cuando menciona llanta o una medida de llanta
 * («llantas rin 15», «235 rin 15») o cuando el aro es solo el dato de la
 * medida («aro 15» a secas, que es la ruta de llantas de siempre).
 */
export function pideAroComoProducto(texto: string): boolean {
  const n = sinTildes(texto ?? "");
  if (!/\baros?\b|\brin(?:es)?\b/.test(n)) return false;
  if (/\bllantas?\b|\bneumaticos?\b|\bruedas?\b/.test(n)) return false;
  if (MEDIDA_DE_LLANTA.test(n)) return false;
  return INTENCION.test(n) || ATRIBUTO_DE_ARO.test(n);
}

/**
 * Los aros que calzan con lo pedido, CON stock, hasta `limite`.
 * Sin filtros devuelve los primeros con stock: la regla de la herramienta
 * obliga a no afirmar compatibilidad con el vehículo.
 */
export function buscarAros(
  lista: readonly AroProducto[],
  filtro: { diametro?: number | null; pernos?: number | null; texto?: string | null },
  limite = 5,
): AroProducto[] {
  const texto = filtro.texto ? sinTildes(filtro.texto) : null;
  return lista
    .filter((a) => a.stock > 0)
    .filter((a) => (filtro.diametro == null ? true : a.diametro === filtro.diametro))
    .filter((a) => (filtro.pernos == null ? true : a.pernos === filtro.pernos))
    .filter((a) => (texto ? sinTildes(`${a.nombre} ${a.marca} ${a.acabado ?? ""}`).includes(texto) : true))
    .slice(0, limite);
}

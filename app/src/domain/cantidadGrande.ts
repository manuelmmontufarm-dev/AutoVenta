/**
 * LA CANTIDAD RARA SE AVISA, NO SE PREGUNTA.
 *
 * Producción, 27-ago-2026 (conv 3, ciclo 9). El cliente tenía cotizada 1 llanta
 * y escribió «sabe que quiero 20 llantas en vez». El bot contestó:
 *
 *   «Para 20 llantas WINRUN MAXCLAW A/T 215/75R14 hay que actualizar la
 *    cotización antes de confirmarle el total. No le confirmo el precio final
 *    todavía para no darle un valor incorrecto.»
 *
 * Honesto e inútil: lo dejó sin precio y sin siguiente paso. La causa era un
 * TOPE DE 8 que nadie le había contado al modelo —`extractExplicitQuantity`
 * solo lee 1–8 y el esquema de `generar_cotizacion` topaba ahí—. La prueba
 * está en el mismo chat: 30 s después escribió «perdon deme 8 llantas» y se
 * recotizó al instante.
 *
 * El primer arreglo preguntaba «¿me confirma que son 20 llantas?». Manuel lo
 * probó y lo bajó: «no me gustó que pregunte que confirme el número; mejor que
 * solo cotice, pero si son más de 8 o menos de 4 que diga en un mensaje corto
 * "aquí le mando la cotización con X llantas"». Tiene razón — preguntar cuesta
 * un turno para llegar a la misma respuesta, y el aviso hace el mismo trabajo:
 * si se equivocó, lo ve y lo corrige; si no, ya tiene su precio.
 *
 * OJO: esto NO reemplaza a `extractExplicitQuantity`, que sigue leyendo 1–8 y
 * es lo que alimenta `selected_quantity`. Es un detector aparte, con un solo
 * trabajo: notar el número que aquél no sabe leer.
 */

/** El juego es 4; con repuesto, 5. Fuera de 4–8 la cantidad se avisa. */
export const MINIMO_NORMAL = 4;
export const MAXIMO_NORMAL = 8;

/** Más de esto ya no es un cliente con un cero de más: es otra conversación. */
const TOPE_ABSURDO = 500;

const NUMERO_GRANDE =
  /\b(\d{1,3})\s*(?:llantas?|unidades?|neum[áa]ticos?)\b|\b(?:quiero|necesito|deme|dame|dele|cotiza(?:me)?|ser[íi]an?|son|llevo|p[oó]ngame|mandeme)\s+(?:las?\s+|los\s+)?(\d{1,3})\b/i;

/**
 * El número que el cliente pidió, solo si pasa del juego máximo. `null` para
 * todo lo demás — incluido lo que ya sabe leer el extractor de siempre.
 */
export function cantidadGrandePedida(text: string): number | null {
  const m = text.match(NUMERO_GRANDE);
  const crudo = m?.[1] ?? m?.[2];
  if (!crudo) return null;
  const n = Number(crudo);
  if (!Number.isFinite(n) || n <= MAXIMO_NORMAL || n > TOPE_ABSURDO) return null;
  return n;
}

/**
 * ¿Merece que el bot la nombre al mandar la cotización?
 *
 * Fuera de 4–8: o pidió menos de un juego (1, 2, 3 — puede ser a propósito o un
 * dedo) o pidió más de lo normal (9, 20). En los dos casos vale decirlo en una
 * línea, porque es el número que multiplica el total.
 */
export function esCantidadInusual(cantidad: number): boolean {
  return cantidad < MINIMO_NORMAL || cantidad > MAXIMO_NORMAL;
}

/**
 * La línea que acompaña a la pieza. Corta y sin preguntar nada: el número va
 * en negrita porque es lo único que el cliente tiene que revisar de un vistazo.
 */
export function avisoDeCantidad(cantidad: number): string {
  return `Aquí le mando la cotización con *${cantidad} ${cantidad === 1 ? "llanta" : "llantas"}* 👍`;
}

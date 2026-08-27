/**
 * «SABE QUE QUIERO 20 LLANTAS EN VEZ» — el pedido grande, confirmado antes de
 * firmarlo.
 *
 * Producción, 27-ago-2026 (conv 3, ciclo 9). El cliente tenía cotizada 1 llanta
 * y escribió «sabe que quiero 20 llantas en vez». El bot contestó:
 *
 *   «Para 20 llantas WINRUN MAXCLAW A/T 215/75R14 hay que actualizar la
 *    cotización antes de confirmarle el total. No le confirmo el precio final
 *    todavía para no darle un valor incorrecto.»
 *
 * Honesto e inútil: lo dejó sin precio y sin siguiente paso. Y no fue el modelo
 * inventando — fue un TOPE DE 8 que nadie le había contado. `extractExplicitQuantity`
 * solo lee 1–8 (así que devolvía `null` y la ruta determinística ni se enteraba)
 * y el esquema de `generar_cotizacion` topaba en 8. La prueba está en el mismo
 * chat: 30 segundos después escribió «perdon deme 8 llantas» y se recotizó al
 * instante.
 *
 * La regla la puso Manuel: «cuando piden más de 8 que pregunte si escribió bien,
 * y si dice que sí no hay tope y se cotiza nomás, porque puede que se
 * equivocaron». O sea: el tope deja de ser un muro y pasa a ser una pregunta.
 *
 * OJO: esto NO reemplaza a `extractExplicitQuantity`, que sigue leyendo 1–8 y
 * es lo que alimenta `selected_quantity` y el resto del sistema. Es un detector
 * aparte, con un solo trabajo: notar el número raro para poder preguntarlo.
 */

/** Hasta acá se cotiza sin preguntar: 4 es el juego y 5 con repuesto. */
export const TOPE_SIN_CONFIRMAR = 8;

/** Más de esto ya no es un error de tipeo, es otra cosa: no se ofrece cotizar. */
const TOPE_ABSURDO = 500;

const NUMERO_GRANDE =
  /\b(\d{1,3})\s*(?:llantas?|unidades?|neum[áa]ticos?)\b|\b(?:quiero|necesito|deme|dame|dele|cotiza(?:me)?|ser[íi]an?|son|llevo|p[oó]ngame|mandeme)\s+(?:las?\s+|los\s+)?(\d{1,3})\b/i;

/**
 * El número que el cliente pidió, solo si pasa del tope. `null` para todo lo
 * demás — incluido lo que ya sabe leer el extractor de siempre.
 */
export function cantidadGrandePedida(text: string): number | null {
  const m = text.match(NUMERO_GRANDE);
  const crudo = m?.[1] ?? m?.[2];
  if (!crudo) return null;
  const n = Number(crudo);
  if (!Number.isFinite(n) || n <= TOPE_SIN_CONFIRMAR || n > TOPE_ABSURDO) return null;
  return n;
}

/**
 * Lo que se le pregunta. Corta y sin drama: no se lo trata de equivocado, se le
 * confirma. Lleva el número en negrita porque es lo único que tiene que revisar.
 */
export function preguntaDeConfirmacion(cantidad: number): string {
  return `Antes de cotizarle: ¿me confirma que son *${cantidad} llantas*? 👍`;
}

/**
 * ¿Nuestro último mensaje preguntó por una cantidad, y por cuál?
 *
 * Es lo que convierte un «sí» pelado en una orden de cotizar. Misma idea que
 * `preguntamosElLocal` y `preguntamosElDia`: la respuesta seca solo significa
 * algo contra la pregunta que la provocó.
 */
export function cantidadQueConfirmamos(ultimoMensajeNuestro: string | null | undefined): number | null {
  if (!ultimoMensajeNuestro) return null;
  const m = ultimoMensajeNuestro.match(/¿me confirma que son \*(\d{1,3}) llantas\*\?/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

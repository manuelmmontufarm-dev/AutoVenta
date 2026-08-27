/**
 * CERRAR UNA VENTA COMO PERDIDA BORRA LA CONVERSACIÓN. Que no lo decida una
 * queja de precio.
 *
 * Producción, 27-ago-2026, conv 3. El cliente tenía cotizadas 8 llantas por
 * $821.53 y escribió: **«chuta ta carisisimo oe»**. El clasificador lo leyó
 * como venta perdida:
 *
 *   02:30:24  cotizacion_enviada → perdido   «Clasificación del último mensaje»
 *
 * Cerrar deja `status='closed'`, y el mensaje siguiente REABRE la conversación
 * en un ciclo nuevo: se vacían `tire_size`, el producto, la cantidad y la
 * cotización. Por eso, dos mensajes después, el bot le pidió la medida que ya
 * tenía — no se le había olvidado, se la habían borrado. Manuel: «hasta regresó
 * a pedirme la medida que ya sabía, no entiendo por qué si ya la tenía».
 *
 * Y una queja de precio es justo lo contrario de una venta perdida: es la
 * objeción más común del oficio y el momento en que hay que vender. La rúbrica
 * ya decía «el cliente rechazó explícitamente continuar»; el modelo igual la
 * estiró. Así que el permiso deja de ser una petición y pasa a ser evidencia:
 * sin un rechazo de verdad en el texto del cliente, no se cierra.
 *
 * Las pérdidas reales siguen teniendo su camino: el asesor cierra desde el
 * panel, y el sistema le recomienda hacerlo con la alerta `recommend_close_lost`
 * cuando el cliente lleva días sin contestar.
 */
import { isNegativeResponse } from "./salesIntent.js";

/**
 * Rechazos que sí cierran: el cliente dice que no sigue, que ya compró en otro
 * lado, o pide que no le escriban más.
 */
const RECHAZO_EXPLICITO =
  /\b(?:no me interesa|ya no me interesa|no quiero|ya compre|ya lo compre|ya consegui|compre en otro|en otro lado|otro lugar|deje?n? de escribir\w*|no me escriba\w*|no me contacte\w*|dar de baja|desuscribir\w*|ya no necesito|encontre en otro)\b/;

/**
 * Quejarse del precio NUNCA cierra, ni con un «no» al lado.
 *
 * «No me alcanza» tiene un «no» y `isNegativeResponse` lo marca, pero es la
 * objeción de precio con otras palabras: el cliente sigue queriendo la llanta,
 * lo que no le cuadra es la plata. Cerrar ahí tira la cotización, la medida y
 * el local — y ese es el turno en que un vendedor recién empieza a trabajar.
 */
const QUEJA_DE_PRECIO =
  /\b(?:car[oa]s?|car[ií]simo|costoso|muy alto|elevado|no me alcanza|no alcanza|mucha plata|mucho dinero|fuera de mi presupuesto|se pasa)\b/;

const normalizar = (texto: string) =>
  texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * ¿El mensaje del cliente alcanza para cerrar la venta como perdida?
 *
 * Se exige evidencia en SU texto: o un rechazo explícito, o una de las
 * negativas que ya reconoce `isNegativeResponse` («no gracias», «mejor no»,
 * «solo estoy preguntando»). Todo lo demás —quejarse del precio, pedir tiempo,
 * discutir la marca— es la conversación de venta, no su final.
 */
export function puedeCerrarComoPerdido(mensajeDelCliente: string): boolean {
  const n = normalizar(mensajeDelCliente);
  // Un rechazo explícito manda siempre: si dice «no me interesa» aunque además
  // se queje del precio, se respeta.
  if (RECHAZO_EXPLICITO.test(n)) return true;
  // En la duda NO se cierra: dejar viva una conversación muerta la cierra el
  // asesor con un clic; cerrar una viva le borra el ciclo al cliente.
  if (QUEJA_DE_PRECIO.test(n)) return false;
  return isNegativeResponse(mensajeDelCliente);
}

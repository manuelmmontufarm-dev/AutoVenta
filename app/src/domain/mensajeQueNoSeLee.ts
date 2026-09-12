/**
 * QUÉ HACER CON LO QUE EL BOT NO PUEDE LEER.
 *
 * Un sticker, un video o un contacto se registran igual —un cliente que manda
 * algo y no recibe nada es un lead perdido en silencio— y viajan al modelo
 * como un texto entre corchetes que además le dice qué hacer. Hasta hoy ese
 * texto era uno solo: «Pídele con amabilidad la medida escrita o una foto del
 * costado de la llanta».
 *
 * Correcto para quien todavía no dio su medida. Absurdo para el resto:
 *
 *  · conv 18821 · visita confirmada para el lunes, cliente despidiéndose con
 *    «Correcto todo bien gracias». Mandó un sticker y el bot le contestó
 *    «Envíeme la medida escrita o una foto del costado de la llanta».
 *  · conv 16982 · con cotización y visita para el sábado, un sticker disparó
 *    saludo, guía de medida y «¿Me dice la medida…?».
 *  · conv 11 · un «.» disparó el saludo de presentación completo y dos
 *    mensajes pidiendo la medida.
 *
 * La instrucción ahora depende de dónde está la venta. Lo que NO cambia nunca
 * es avisar que el mensaje no se pudo ver: si el modelo cree que lo leyó,
 * inventa lo que decía.
 */

export interface EstadoDeLaVenta {
  /** ¿La ficha ya tiene medida de trabajo? */
  tieneMedida: boolean;
  /** ¿Ya salió la lámina de opciones en este ciclo? */
  vioOpciones: boolean;
  tieneCotizacion: boolean;
  tieneVisita: boolean;
}

const PIDE_LA_MEDIDA =
  "[El cliente mandó un mensaje que el bot no puede ver (video, sticker o similar). "
  + "Pídele con amabilidad la medida escrita o una foto del costado de la llanta.]";

/**
 * Con la venta en marcha, un sticker es casi siempre un «ok» o un «gracias»:
 * se acusa recibo y se sigue donde estaba, sin volver a pedir datos que ya
 * están sobre la mesa.
 */
const NO_DESCARRILES =
  "[El cliente mandó un mensaje que el bot no puede ver (sticker, video o similar). "
  + "Probablemente sea un gesto de acuerdo o agradecimiento: NO reinicies la conversación, "
  + "NO vuelvas a pedir la medida ni mandes la guía, y NO te presentes de nuevo. "
  + "Sigue donde estaba el hilo: responde breve y, si hay algo pendiente, recuérdalo en una línea.]";

export function textoParaMensajeQueNoSeLee(estado: EstadoDeLaVenta): string {
  const ventaEnMarcha =
    estado.tieneVisita || estado.tieneCotizacion || estado.vioOpciones || estado.tieneMedida;
  return ventaEnMarcha ? NO_DESCARRILES : PIDE_LA_MEDIDA;
}

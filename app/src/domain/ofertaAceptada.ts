/**
 * «GRACIAS» DESPUÉS DE UNA OFERTA ES UN SÍ.
 *
 * Producción, 27-ago-2026, conv 11070. El cliente pidió precio, el bot le dio
 * el número y ofreció —«Se la puedo cotizar por *4 llantas*»—, el cliente
 * contestó **«Gracias»** y el bot volvió a ofrecer lo mismo:
 *
 *   10:00  «La más económica en 245/70R16 es KENDA KR628 a $144.44 c/u…
 *           Se la puedo cotizar por 4 llantas»
 *   10:00  cliente: «Gracias»
 *   10:00  «Con gusto 😊 Si desea, le dejo la cotización formal por 4 llantas…»
 *
 * Dos turnos, la misma oferta, cero cotizaciones. Manuel: «cuando le ponen
 * gracias no sabe si es gracias de "sí, cotíceme" o gracias de "no quiero";
 * que solo asuma que sí, al menos de que sea obvio que es no».
 *
 * POR QUÉ EL PROMPT NO ALCANZABA. La regla existía —«Si no es un NO, es un SÍ»,
 * regla 5 de `prompts.ts`— pero producción corre con
 * `AI_COMPACT_PROMPT_ENABLED=true`, y el playbook compacto **reemplaza el
 * prompt entero del vendedor**. La regla 5 nunca se copió: el bot de los
 * clientes nunca la tuvo. Se copia (ver `compactPlaybook.ts`) y además se
 * hornea acá, porque una regla de estilo puesta en un prompt es una petición y
 * esto tiene que pasar siempre.
 *
 * Puro a propósito: se prueba sin base y sin modelo.
 */

const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * El último mensaje del bot OFRECIÓ cotizar (en vez de cotizar de una).
 *
 * Lista positiva y cerrada a propósito. La primera versión era «un verbo de
 * entrega cerca de la palabra cotización» y se comía «Aquí le mando su
 * cotización 👍» — que no es una oferta sino la entrega, y donde un «gracias»
 * es de verdad solo un gracias. Forzar ahí una cotización sería duplicarla.
 */
const OFRECIO_COTIZAR =
  /(?:puedo|podemos|podria|podriamos)\s+(?:\w+\s+){0,2}cotiz|¿\s*le\s+cotizo|\ble\s+cotizo\b[^.?!]{0,60}\?|(?:si\s+(?:desea|gusta|quiere)|si\s+le\s+parece|quiere\s+que|desea\s+que)[^.?!]{0,60}cotiz|(?:le|se\s+la|te\s+la)\s+(?:dejo|paso|hago|armo|preparo)\s+(?:la\s+|una\s+)?cotiza/;

/**
 * El cliente contestó con un acuse y nada más.
 *
 * ANCLADO de principio a fin, y es lo que lo hace seguro: «gracias» dispara,
 * «gracias, ¿y en aro 17?» no (trae una pregunta que hay que contestar), y
 * «gracias, ya compré en otro lugar» tampoco (eso lo agarra
 * `domain/cierrePerdido.ts`, que además cierra la venta).
 */
const ACUSE_SIN_MAS =
  /^(?:muchas\s+|mil\s+)?(?:gracias|grax|ok|oka|okay|okey|listo|list|dale|ya|bueno|buenos|perfecto|de\s+una|hagale|por\s+favor|porfa|porfis|si|sip|claro|va|bien|excelente|genial|de\s+acuerdo|correcto|👍|🙏|😊|🤝)(?:\s+(?:gracias|amigo|amiga|men|ps|pues|senor|senora|don|dona|master|bro))?[\s.,!¡👍🙏😊🤝🙌✅]*$/;

/** Un «no» a secas nunca es un sí, por más corto que sea. */
const NEGATIVA_CORTA = /^(?:no|nop|nel|no\s+gracias|todavia\s+no|aun\s+no|ahorita\s+no|por\s+ahora\s+no|mejor\s+no|otro\s+dia|luego|despues|mas\s+tarde)[\s.,!]*$/;

/**
 * ¿El cliente aceptó la oferta de cotizar que le acaba de hacer el bot?
 *
 * `ultimoMensajeDelBot` es el último saliente de texto; `null` cuando el turno
 * abre la conversación y no hay ninguno.
 */
export function ofertaDeCotizarAceptada(
  ultimoMensajeDelBot: string | null | undefined,
  mensajeDelCliente: string,
): boolean {
  const bot = normalizar(ultimoMensajeDelBot ?? "");
  if (!bot || !OFRECIO_COTIZAR.test(bot)) return false;
  const cliente = normalizar(mensajeDelCliente);
  if (!cliente || NEGATIVA_CORTA.test(cliente)) return false;
  return ACUSE_SIN_MAS.test(cliente);
}

/**
 * El hecho duro que se le mete al modelo cuando pasa. Va entre los bloques
 * volátiles de `agent.ts` —detrás del historial, pegado al mensaje del
 * cliente—, que es donde más se respetan.
 */
export function ordenDeCotizarYa(mensajeDelCliente: string): string {
  return (
    "EL CLIENTE ACEPTÓ (fuente determinística): tu mensaje anterior le OFRECIÓ la cotización y él " +
    `respondió «${mensajeDelCliente.trim().slice(0, 60)}», que no es una negativa. Eso es un SÍ. ` +
    "Llama generar_cotizacion AHORA con la llanta que le ofreciste y la cantidad ya conocida " +
    "(4 llantas si no dijo otra). PROHIBIDO volver a ofrecérsela, PROHIBIDO preguntar «¿le dejo la " +
    "cotización?» otra vez y PROHIBIDO pedir cualquier confirmación adicional: ya la diste una vez."
  );
}

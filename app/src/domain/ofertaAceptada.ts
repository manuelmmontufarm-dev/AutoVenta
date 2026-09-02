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
 * POR QUÉ EL PROMPT NO ALCANZABA. La regla existía en un manual que producción
 * no recibía. Hoy hay una sola política activa (`compactPlaybook.ts`) y además
 * se hornea acá, porque una instrucción al modelo es una petición y esto tiene
 * que pasar siempre.
 *
 * Puro a propósito: se prueba sin base y sin modelo.
 */

const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    // Tono de piel y selector de variante: «👍🏻» (turno real de la conv 11620)
    // es el mismo acuse que «👍», pero el modificador rompía el ancla del regex.
    .replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}]/gu, "")
    .trim();

/**
 * El último mensaje del bot OFRECIÓ algo (en vez de entregarlo de una).
 *
 * Lista positiva y cerrada a propósito. La primera versión era «un verbo de
 * entrega cerca de la palabra cotización» y se comía «Aquí le mando su
 * cotización 👍» — que no es una oferta sino la entrega, y donde un «gracias»
 * es de verdad solo un gracias. Forzar ahí una cotización sería duplicarla.
 *
 * Y LA SEGUNDA VERSIÓN SOLO MIRABA LA COTIZACIÓN, que era la mitad del
 * problema. Conv 11001, 26-ago: el bot ofreció OPCIONES —«Si quiere, le dejo
 * 2–3 opciones para esa medida y usted compara costo, equilibrio o premium»—,
 * el cliente contestó «Ok gracias» y el bot volvió a ofrecer lo mismo con otras
 * palabras: «Con gusto. Si luego quiere comparar opciones para esa medida, se
 * las dejo al toque». Dos turnos, la misma oferta, cero opciones enviadas — y
 * ahí murió la conversación. Un «gracias» es un sí para TODO lo que el bot
 * pueda entregar en ese turno, no solo para la cotización.
 */
const LO_QUE_SE_OFRECE = "(?:cotiza|opcion|opciones|alternativ|comparaci|comparar|precios)";

const OFRECIO_ALGO =
  new RegExp(
    `(?:puedo|podemos|podria|podriamos)\\s+(?:\\w+\\s+){0,3}${LO_QUE_SE_OFRECE}`
    + `|¿\\s*(?:le|se\\s+las?)\\s+cotizo|\\b(?:le|se\\s+las?)\\s+cotizo\\b[^.?!]{0,60}\\?`
    + `|(?:si\\s+(?:desea|gusta|quiere)|si\\s+le\\s+parece|si\\s+quiere|quiere\\s+que|desea\\s+que)[^.?!]{0,70}${LO_QUE_SE_OFRECE}`
    + `|(?:le|se\\s+la|se\\s+las|te\\s+la|te\\s+las)\\s+(?:dejo|paso|hago|armo|preparo)\\s+(?:\\w+\\s+){0,4}${LO_QUE_SE_OFRECE}`
    + `|\\ble\\s+dejo\\s+\\d\\s*[-–]\\s*\\d\\s+${LO_QUE_SE_OFRECE}`,
  );

/** Oferta inequívoca de FIRMA, no de opciones ni de comparación. */
// La raíz `cotiz` y no `cotiza`: el modelo también ofrece con «¿le cotice…?»
// y «¿Le genero la cotización…?» — la corrida T115 del 30-ago (conv 9684,
// corrida 3) mostró al modelo ACEPTANDO el «Ok» y al candado bloqueándolo
// porque su propio verbo no estaba en esta lista.
// «¿Se la cotizo?» / «¿Se las cotizo?» es la pregunta de consentimiento de una
// EQUIVALENTE (conv 13635, 1-sep: la recomendación salió sin pregunta, el
// cliente dijo «Ok» y nadie supo a qué). Ahora la pregunta existe y el «Ok»
// que le sigue tiene que abrir la cotización.
const OFRECIO_COTIZAR =
  /(?:puedo|podemos|podria|podriamos)\s+(?:\w+\s+){0,3}coti[zc]\w*|¿\s*(?:le|se\s+las?)\s+(?:cotizo|genero)|\b(?:le|se\s+las?)\s+cotizo\b[^.?!]{0,60}\?|\ble\s+genero\b[^.?!]{0,60}coti[zc]\w*|(?:si\s+(?:desea|gusta|quiere)|si\s+le\s+parece|quiere\s+que|desea\s+que|prefiere\s+que)[^.?!]{0,70}coti[zc]\w*|(?:le|se\s+la|te\s+la)\s+(?:dejo|paso|hago|armo|preparo|genero)\s+(?:\w+\s+){0,4}coti[zc]\w*/;

/**
 * El cliente contestó con un acuse y nada más.
 *
 * ANCLADO de principio a fin, y es lo que lo hace seguro: «gracias» dispara,
 * «gracias, ¿y en aro 17?» no (trae una pregunta que hay que contestar), y
 * «gracias, ya compré en otro lugar» tampoco (eso lo agarra
 * `domain/cierrePerdido.ts`, que además cierra la venta).
 */
const ACUSE_SIN_MAS =
  /^(?:muchas\s+|mil\s+)?(?:gracias|grax|ok|oka|okay|okey|listo|list|dale|dele|ya|bueno|buenos|perfecto|de\s+una|hagale|hagalo|por\s+favor|porfa|porfis|si|sip|claro|va|bien|excelente|genial|de\s+acuerdo|correcto|ayudeme|uyedeme|👍|🙏|😊|🤝)(?:\s+(?:por\s+favor|porfa|porfis|gracias|amigo|amiga|men|ps|pue|pues|nomas|senor|senora|don|dona|master|bro))?[\s.,!¡👍🙏😊🤝🙌✅]*$/;

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
  if (!bot || !OFRECIO_ALGO.test(bot)) return false;
  const cliente = normalizar(mensajeDelCliente);
  if (!cliente || NEGATIVA_CORTA.test(cliente)) return false;
  return ACUSE_SIN_MAS.test(cliente);
}

/**
 * Versión estricta para autorizar `generar_cotizacion`.
 *
 * `ofertaDeCotizarAceptada` conserva su semántica histórica amplia porque
 * también hace avanzar ofertas de opciones/comparación. Esta función no: un
 * «Ok» solo permite firmar si el bot realmente ofreció una cotización.
 */
export function ofertaDeCotizacionAceptada(
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
    "EL CLIENTE ACEPTÓ (fuente determinística): tu mensaje anterior le OFRECIÓ algo —la cotización, " +
    `las opciones o una comparación— y él respondió «${mensajeDelCliente.trim().slice(0, 60)}», que no ` +
    "es una negativa. Eso es un SÍ. ENTREGA ESO MISMO EN ESTE TURNO con la herramienta que " +
    "corresponda: generar_cotizacion si ofreciste cotizar (4 llantas si no dijo otra cantidad), " +
    "preparar_opciones si ofreciste opciones, la comparación si ofreciste comparar. PROHIBIDO volver " +
    "a ofrecer lo mismo con otras palabras, PROHIBIDO condicionarlo a un «si luego quiere» y " +
    "PROHIBIDO pedir cualquier confirmación adicional: ya la pediste una vez y te dijo que sí."
  );
}

/**
 * La oferta de cotizar no caduca porque el cliente meta una pregunta en el
 * medio.
 *
 * 30-ago-2026, corrida T115 conv 9684: el bot ofreció «¿Le cotizo el juego de
 * 4?», el cliente preguntó si el precio era fijo, el bot contestó, y el «Ok»
 * siguiente ya no autorizó nada porque `ofertaDeCotizacionAceptada` solo mira
 * el último saliente. El turno terminó preguntando «¿cuál opción le cotizo?»
 * — la misma oferta con otras palabras — y la venta nunca tuvo cotización.
 *
 * Esta versión recorre los últimos mensajes buscando la oferta viva:
 * - muere con cualquier negativa o despedida del cliente en el medio;
 * - aguanta como mucho DOS mensajes del cliente desde la oferta — una oferta
 *   no vive para siempre;
 * - el acuse sigue siendo el mismo `ACUSE_SIN_MAS` anclado: «Ok, ¿y en aro
 *   17?» no dispara nada.
 */
/** El acuse anclado, exportado para el descanso del acuse en agent.ts. */
export function esAcuseSimple(mensajeDelCliente: string): boolean {
  const cliente = normalizar(mensajeDelCliente);
  return Boolean(cliente) && !NEGATIVA_CORTA.test(cliente) && ACUSE_SIN_MAS.test(cliente);
}

export function ofertaDeCotizacionVigenteAceptada(
  historial: readonly { role: string; content: unknown }[],
  mensajeDelCliente: string,
): boolean {
  const cliente = normalizar(mensajeDelCliente);
  if (!cliente || NEGATIVA_CORTA.test(cliente) || !ACUSE_SIN_MAS.test(cliente)) return false;
  // El mensaje actual ya suele estar guardado y llega al final del historial:
  // no cuenta como «mensaje en el medio».
  const previos = historial.length && historial[historial.length - 1].role === "user"
    ? historial.slice(0, -1)
    : historial;
  let clientesEnMedio = 0;
  for (let i = previos.length - 1; i >= 0 && clientesEnMedio <= 2; i--) {
    const m = previos[i];
    const texto = typeof m.content === "string" ? normalizar(m.content) : "";
    if (m.role === "user") {
      // «Voy a mirar en Ibarra», «lo voy a pensar» (y el typo real «boy»):
      // el cliente se apartó a comparar; la oferta vieja ya no se acepta sola.
      if (NEGATIVA_CORTA.test(texto) || /\bno\s+gracias\b|\bya\s+compre\b|\bya\s+no\b|\b[bv]oy\s+a\s+(?:mirar|ver|pensar|comparar)\b|\blo\s+(?:voy\s+a\s+)?pienso\b/.test(texto)) return false;
      clientesEnMedio += 1;
    } else if (m.role === "assistant" && OFRECIO_COTIZAR.test(texto)) {
      return true;
    }
  }
  return false;
}

/**
 * El hecho suave para la oferta que quedó pendiente unos turnos atrás. No es
 * `ordenDeCotizarYa` a propósito: aquella ORDENA porque el sí llegó pegado a
 * la oferta; esta recuerda una oferta viva pero deja que el modelo confirme
 * que el contexto sigue siendo esa compra (el acuse pudo ser de otra cosa).
 */
export function recordatorioDeOfertaPendiente(mensajeDelCliente: string): string {
  return (
    "OFERTA DE COTIZACIÓN PENDIENTE (fuente determinística): hace uno o dos turnos ofreciste " +
    `cotizar y el cliente acaba de responder «${mensajeDelCliente.trim().slice(0, 60)}», un acuse sin ` +
    "pedido nuevo ni negativa. Si el contexto sigue siendo esa compra, GENERA la cotización en este " +
    "turno con generar_cotizacion (juego de 4 llantas si no dijo otra cantidad, sobre el producto " +
    "recomendado vigente) en vez de volver a ofrecerla o pedir otra confirmación."
  );
}

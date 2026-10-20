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

import { ES_PRESENTACION_DEL_NEGOCIO } from "./saludo.js";
import { ofrecioCotizarLaUnica } from "./cotizarLaUnica.js";
import { eligePosicionDelMenu, pidioPrecioOCotizacion, respuestaDePreferencia } from "./salesIntent.js";

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
// «¿Prefiere que avancemos con esta opción M/T para su medida?» es esa misma
// pregunta reescrita por el guardián (conv 19710, 14-sep; conv 20427): con UNA
// llanta nombrada sobre la mesa, avanzar con ella ES cotizarla. El cliente dijo
// «Sí por favor» y la cotización quedó bloqueada porque el verbo no era cotizar.
const OFRECIO_COTIZAR =
  /(?:puedo|podemos|podria|podriamos)\s+(?:\w+\s+){0,3}coti[zc]\w*|¿\s*(?:le|se\s+las?)\s+(?:cotizo|genero)|\b(?:le|se\s+las?)\s+cotizo\b[^.?!]{0,60}\?|\ble\s+genero\b[^.?!]{0,60}coti[zc]\w*|(?:si\s+(?:desea|gusta|quiere)|si\s+le\s+parece|quiere\s+que|desea\s+que|prefiere\s+que)[^.?!]{0,70}coti[zc]\w*|(?:le|se\s+la|te\s+la)\s+(?:dejo|paso|hago|armo|preparo|genero)\s+(?:\w+\s+){0,4}coti[zc]\w*|¿[^?]{0,40}\bavan[cz]\w+\s+con\s+(?:esta|esa|la)\s+(?:opcion|llanta|misma)\b[^?]{0,80}\?/;

/**
 * ENTREGAR NO ES OFRECER (simulador, 18-sep, guion de la conv 19879).
 *
 * «La opción premium es la KENDA KR628 — $157.57 c/u con IVA. Le dejo la
 * cotización 👍» calza en `OFRECIO_COTIZAR` por «le dejo … cotización», y es la
 * ENTREGA. Dos mensajes después el cliente dijo «Ok» a otra cosa, la oferta
 * «seguía viva», se ordenó cotizar otra vez y salió «Su cotización sigue
 * vigente» con la pregunta del local repetida. Las frases de entrega se quitan
 * antes de buscar la oferta.
 */
const ENTREGA_DE_COTIZACION =
  /\b(?:le|te)\s+(?:dejo|mando|envio|paso)\s+(?:la|su|tu)\s+cotizacion\b(?!\s+(?:si|cuando|apenas)\b)|\baqui\s+(?:le\s+|te\s+)?(?:mando|dejo|envio|tiene|va)\b[^.?!]{0,30}cotizacion|\bcotizacion\s+(?:lista|enviada|reenviada)\b|\bsu\s+cotizacion\s+sigue\s+vigente\b/g;

const CONDICIONAL = /\bsi\s+(?:desea|gusta|quiere|le\s+parece|prefiere)\b|\bquiere\s+que\b|\bdesea\s+que\b|\?/;

/** Frase por frase: la que entrega sin condicional ni pregunta no ofrece nada. */
const ofreceCotizar = (botNormalizado: string): boolean =>
  botNormalizado
    .split(/(?<=[.!?\n])/)
    .filter((frase) => CONDICIONAL.test(frase) || !new RegExp(ENTREGA_DE_COTIZACION.source).test(frase))
    .some((frase) => OFRECIO_COTIZAR.test(frase));

/** ¿Este texto del bot ofrece cotizar (y no es la presentación ni una entrega)? */
export function ofreceCotizarEn(textoDelBot: string | null | undefined): boolean {
  const bot = normalizar(textoDelBot ?? "");
  return Boolean(bot) && !ES_PRESENTACION.test(bot) && ofreceCotizar(bot);
}

/**
 * El cliente contestó con un acuse y nada más.
 *
 * TODO EL MENSAJE ES AFIRMACIÓN O CORTESÍA, y eso es lo que lo hace seguro:
 * «gracias» dispara, «gracias, ¿y en aro 17?» no (trae una pregunta que hay que
 * contestar), y «gracias, ya compré en otro lugar» tampoco (eso lo agarra
 * `domain/cierrePerdido.ts`, que además cierra la venta).
 *
 * HASTA EL 20-OCT ERA UNA LISTA CERRADA DE FRASES, anclada de punta a punta
 * (auditoría 19-oct, familia 1: 47 chats). «Si por favor» entraba y «Si, por
 * favor» no —la coma rompía el grupo—; tampoco «Si porfavor», «Claro que si»,
 * «Sí claro», «Ok si», «Siii». Sin acuse, `generar_cotizacion` se bloqueaba
 * «por falta de autorización» y el Guardián volvía a poner «¿Se la cotizo?»:
 * en 9 chats el cliente dijo que sí y nunca recibió la cotización (29029,
 * 26675, 25889…). Ahora se normaliza (minúsculas, sin tildes, la puntuación
 * separa, «siii» → «si») y se mira palabra por palabra.
 */
const colapsar = (p: string) => (/[a-z]/.test(p) ? p.replace(/([a-z])\1+/g, "$1") : p);

const PALABRAS_DE_ACUSE = new Set([
  // afirmaciones
  "si", "sip", "ok", "oka", "okay", "okey", "oki", "dale", "dele", "listo", "list", "ya", "bueno",
  "perfecto", "claro", "va", "bien", "excelente", "genial", "correcto", "hagale", "hagalo",
  "ayudeme", "uyedeme", "deuna", "deacuerdo", "estabien", "obvio", "exacto", "eso",
  // cortesías
  "gracias", "grax", "porfavor", "porfa", "favor", "porfis", "xfa", "muchas", "mil", "amigo", "amiga", "men",
  "ps", "pue", "pues", "nomas", "senor", "senora", "don", "dona", "master", "bro", "jefe",
  // «claro que sí»: el «que» solo de relleno; un «que» con otra cosa ya no es acuse
  "que",
  // emojis de acuerdo (ya sin tono de piel)
  "👍", "🙏", "😊", "🤝", "🙌", "✅", "👌", "💯", "👏", "💪", "🙂", "😀", "😁", "😃", "😄", "☺",
].map(colapsar));

/**
 * Las palabras del mensaje, listas para comparar. Las frases de varias palabras
 * se pegan antes («de una» → «deuna») y las letras repetidas se colapsan
 * («siii», «porfavorr», «okk»): el vocabulario de arriba ya está colapsado.
 */
export function palabrasDelAcuse(texto: string): string[] {
  const emojis = [...PALABRAS_DE_ACUSE].filter((p) => !/[a-z]/.test(p));
  let t = normalizar(texto);
  for (const e of emojis) t = t.split(e).join(` ${e} `);
  t = t
    .replace(/\b(?:por|x)\s*fa(vor)?\b/g, "porfa$1")
    .replace(/\bde\s+una\b/g, "deuna")
    .replace(/\bde\s+acuerdo\b/g, "deacuerdo")
    .replace(/\besta\s+bien\b/g, "estabien");
  return t
    .split(/[^\p{L}\p{N}\p{Extended_Pictographic}]+/u)
    .filter(Boolean)
    .map(colapsar);
}

// Una letra suelta de tecla resbalada no vuelve pregunta un sí: «Si por favor q»
// (chat 26841, 14-oct 16:35). Solo consonantes que no son palabra en español.
const LETRA_SUELTA = /^[qkxjwzhgfdcbvñ]$/;

function soloAfirmacionYCortesia(todas: readonly string[]): boolean {
  const palabras = todas.filter((p) => !LETRA_SUELTA.test(p));
  if (!palabras.length) return false;
  if (!palabras.every((p) => PALABRAS_DE_ACUSE.has(p))) return false;
  // El «que» de relleno solo vale detrás de «claro» («claro que si»).
  return palabras.every((p, i) => p !== "que" || palabras[i - 1] === "claro");
}

/**
 * EL SALUDO NO ES UNA OFERTA (auditoría 2-6 sep, familia D).
 *
 * La presentación fija dice «…comparo modelos y le armo su cotización para
 * tienda», y «le armo … cotización» calzaba en `OFRECIO_COTIZAR`. Resultado:
 * cualquier «Listo», «Por favor», «Gracias» o «👍» en los dos mensajes
 * siguientes al saludo se leía como «sí, cotíceme» — y así salieron 18
 * cotizaciones tras un acuse en 4,6 días: la Falken de Rolando (conv 14506,
 * «Listo» a la imagen de opciones), la 205/55R16 de un cliente de aro 17
 * (14687), y una por $511.72 a quien acababa de decir «No me interesa» y
 * contestó «👍» al saludo del ciclo reabierto (16277). Una capacidad que el
 * bot anuncia de sí mismo no es una oferta que el cliente pueda aceptar.
 */
// El patrón vive con la firma, en `domain/saludo.ts`: si cambia cómo se presenta
// el bot, esta puerta no puede quedarse reconociendo el saludo viejo.
const ES_PRESENTACION = ES_PRESENTACION_DEL_NEGOCIO;

/** Un «no» a secas nunca es un sí, por más corto que sea. */
const NEGATIVA_CORTA = /^(?:no|nop|nel|no\s+gracias|todavia\s+no|aun\s+no|ahorita\s+no|por\s+ahora\s+no|mejor\s+no|otro\s+dia|luego|despues|mas\s+tarde)[\s.,!]*$/;

/**
 * «PRECIO POR FAVOR» A «ES LA ÚNICA QUE TENGO… ¿SE LA COTIZO?» ES UN SÍ.
 *
 * Producción, conv +593 99 842 8277, 25-sep: el bot ofreció cotizar la única
 * llanta, el cliente contestó «Precio por favor» —pedir el número a quien te
 * ofrece el número— y el turno volvió a preguntar «¿se la cotizo?». No es un
 * acuse (no es afirmación ni cortesía) pero es una respuesta directa
 * a la oferta. Solo vale con la oferta de la ÚNICA opción y un mensaje corto:
 * «precio, y ¿en aro 17 tienen?» sigue siendo una pregunta que hay que contestar.
 */
function preguntaElPrecioDeLaUnica(
  ultimoMensajeDelBot: string | null | undefined,
  mensajeDelCliente: string,
  turnoDelBot?: string | null,
): boolean {
  // El marcador se busca en TODO el último turno (varias filas), no solo en la
  // última: el «¿Se la cotizo?» sale aparte de «Es la única que tengo…».
  return ofrecioCotizarLaUnica(turnoDelBot || ultimoMensajeDelBot)
    && mensajeDelCliente.length <= 60
    && !/\?[^?]*\?|,\s*y\b/.test(mensajeDelCliente)
    && pidioPrecioOCotizacion(mensajeDelCliente);
}

/**
 * ¿El cliente aceptó la oferta de cotizar que le acaba de hacer el bot?
 *
 * `ultimoMensajeDelBot` es el último saliente de texto; `null` cuando el turno
 * abre la conversación y no hay ninguno.
 */
export function ofertaDeCotizarAceptada(
  ultimoMensajeDelBot: string | null | undefined,
  mensajeDelCliente: string,
  /** Todas las filas del último turno del bot (`ultimoTurnoDelBot`), para el marcador de la única. */
  turnoDelBot?: string | null,
): boolean {
  const bot = normalizar(ultimoMensajeDelBot ?? "");
  if (!bot || ES_PRESENTACION.test(bot) || !OFRECIO_ALGO.test(bot)) return false;
  const cliente = normalizar(mensajeDelCliente);
  if (!cliente || NEGATIVA_CORTA.test(cliente)) return false;
  // Un sí a un MENÚ no dice cuál (familia 2): ver `esMenuDeOpciones`.
  if (esMenuDeOpciones(turnoDelBot || ultimoMensajeDelBot)) return false;
  return esAcuseSimple(mensajeDelCliente) || preguntaElPrecioDeLaUnica(ultimoMensajeDelBot, mensajeDelCliente, turnoDelBot);
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
  turnoDelBot?: string | null,
): boolean {
  const bot = normalizar(ultimoMensajeDelBot ?? "");
  if (!bot || ES_PRESENTACION.test(bot) || !ofreceCotizar(bot)) return false;
  const cliente = normalizar(mensajeDelCliente);
  if (!cliente || NEGATIVA_CORTA.test(cliente)) return false;
  if (esMenuDeOpciones(turnoDelBot || ultimoMensajeDelBot)) return false;
  return respondeQueSi(mensajeDelCliente) || preguntaElPrecioDeLaUnica(ultimoMensajeDelBot, mensajeDelCliente, turnoDelBot);
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
 * - el acuse sigue siendo el mismo `esAcuseSimple`: «Ok, ¿y en aro 17?» no
 *   dispara nada;
 * - una oferta que era un MENÚ no se acepta con un acuse (familia 2).
 */
/**
 * EL dueño de «esto es un acuse»: lo usan agent.ts, tools.ts, index.ts,
 * prepararSalida.ts, rafaga.ts y medidaQueConfirmoAlAsesor.ts. Las negaciones
 * se miran primero y ganan.
 */
export function esAcuseSimple(mensajeDelCliente: string): boolean {
  const cliente = normalizar(mensajeDelCliente);
  if (!cliente || NEGATIVA_CORTA.test(cliente)) return false;
  return soloAfirmacionYCortesia(palabrasDelAcuse(mensajeDelCliente));
}

export function ofertaDeCotizacionVigenteAceptada(
  historial: readonly { role: string; content: unknown }[],
  mensajeDelCliente: string,
): boolean {
  if (!esAcuseSimple(mensajeDelCliente)) return false;
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
    } else if (m.role === "assistant" && !ES_PRESENTACION.test(texto) && ofreceCotizar(texto)) {
      return !esMenuDeOpciones(texto);
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

/**
 * UN SÍ SOLO AUTORIZA LO QUE LA ÚLTIMA OFERTA NOMBRÓ (auditoría 19-oct,
 * familia 2: al menos 19 cotizaciones).
 *
 * El bot preguntó «¿Le cotizo la 1, la 2 o la 3?» y el cliente contestó «Ok
 * gracias» (chat 29367), «Gracias» (27512), «👍🏼» (28116). La regla de agosto
 * —un gracias después de una oferta es un sí— está bien para UNA llanta
 * nombrada, pero un menú no nombra ninguna: el sí no dice cuál, y el modelo
 * elegía por su cuenta (en 29367, la más cara: $1.186,20). Ante un menú, el
 * acuse no firma nada: se pregunta cuál.
 *
 * Devuelve true cuando el texto pide ELEGIR entre varias opciones.
 */
export function esMenuDeOpciones(texto: string | null | undefined): boolean {
  const t = normalizar(texto ?? "");
  return /\bla\s+[1-3]\s*(?:,\s*(?:la\s+)?[1-3]\s*)*(?:,\s*)?\bo\s+(?:la\s+)?[1-3]\b/.test(t)
    || t.includes("que prioriza usted")
    || /¿\s*cual\s+(?:de\s+(?:las|ellas|estas)\s+)?(?:le\s+cotizo|se\s+la\s+cotizo|prefiere|le\s+gusta|quiere\s+que\s+le\s+cotice)\b/.test(t);
}

const COTIZACION_ENVIADA = /\bcotizacion\s+(?:cot-\S+\s+)?(?:enviada|lista|reenviada)\b/;

/**
 * ¿Sigue abierto un menú de cotizar que el cliente todavía no contestó?
 * Devuelve cuántas opciones tenía (2 o 3), o 0 si no hay menú abierto.
 *
 * No alcanza con el último mensaje: en el chat 28606 (16-oct 12:22) el bot
 * mostró el menú, el cliente preguntó «Que ciudad», el bot contestó, y recién
 * ahí llegó «4 llantas / Quiero» — y se cotizó la Winrun. Se recorre hacia
 * atrás hasta la última oferta de cotizar del bot: si era un menú, sigue
 * abierto; si nombraba UNA llanta, o si ya salió una cotización, no.
 */
export function menuDeCotizarAbierto(historial: readonly { role: string; content: unknown }[]): number {
  // Los mensajes del cliente del final son el turno que se está evaluando: no
  // cierran nada. Los de ANTES sí: si después del menú ya eligió («La 2») y el
  // bot no pudo cotizar por otra traba (stock, medida), un «ok» posterior no
  // reabre «¿Cuál le cotizo…?» (revisión de la coordinadora, 20-oct).
  let fin = historial.length - 1;
  while (fin >= 0 && historial[fin].role === "user") fin--;
  let yaEligio = false;
  let revisados = 0;
  for (let i = fin; i >= 0 && revisados < 10; i--) {
    const m = historial[i];
    if (m.role === "user" && typeof m.content === "string") {
      if (respuestaDePreferencia(m.content) !== null || eligePosicionDelMenu(m.content)) yaEligio = true;
      continue;
    }
    if (m.role !== "assistant" || typeof m.content !== "string") continue;
    revisados += 1;
    const texto = normalizar(m.content);
    if (COTIZACION_ENVIADA.test(texto)) return 0;
    if (esMenuDeOpciones(m.content)) {
      if (yaEligio) return 0;
      return /\bla\s+3\b|\b3\s*[·).]/.test(texto) || /\b3\s*[·).]/.test(normalizar(String(historial[i - 1]?.content ?? ""))) ? 3 : 2;
    }
    if (ofreceCotizar(texto)) return 0;
  }
  return 0;
}

/**
 * Un sí a la oferta de UNA llanta: el acuse, y además «las 4», «el juego»,
 * «esa» — el cliente que compra por juego contesta así (conv 23580, chat 21710).
 * Es la lectura que comparten `ofertaDeCotizacionAceptada`, el candado de marca
 * y el de la equivalente de `generar_cotizacion`.
 */
export function respondeQueSi(mensajeDelCliente: string): boolean {
  if (esAcuseSimple(mensajeDelCliente)) return true;
  if (siConPedidoDeCotizar(mensajeDelCliente)) return true;
  const n = normalizar(mensajeDelCliente).replace(/[.,!¡]/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:(?:si|ok|dale|listo|claro)\s+)?(?:el\s+juego(?:\s+(?:de\s+)?(?:4|cuatro))?|las\s+(?:4|cuatro)|esa|esa\s+mism[ao]|ese|ese\s+mism[ao])(?:\s+(?:necesito|quiero|por\s+favor|porfa|gracias))*$/.test(n);
}

/**
 * «Sí, cotíceme», «Si cotizame esa», «dale, cotice», «sí, hágala»: el sí con el
 * verbo de cotizar también es un sí a la oferta de UNA llanta (revisión de la
 * coordinadora, 20-oct: sin esto la equivalente pedía su sí otra vez). Todo lo
 * demás del mensaje tiene que ser afirmación, cortesía o un pronombre; «¿y en
 * 185?» o «Precio» no entran.
 */
const PRONOMBRES_DEL_PEDIDO = new Set(["esa", "ese", "esas", "esos", "la", "las", "lo", "me", "mela", "nos", "nomas", "una"].map(colapsar));

function siConPedidoDeCotizar(mensajeDelCliente: string): boolean {
  const palabras = palabrasDelAcuse(mensajeDelCliente).filter((p) => !LETRA_SUELTA.test(p));
  const pide = (p: string) => /^coti[cz]/.test(p) || /^hagal[ao]s?$/.test(p) || /^generel[ao]$/.test(p);
  return palabras.some(pide)
    && palabras.every((p) => pide(p) || PALABRAS_DE_ACUSE.has(p) || PRONOMBRES_DEL_PEDIDO.has(p));
}

const PALABRAS_DE_CANTIDAD = new Set([
  "la", "las", "el", "los", "de", "llanta", "llantas", "unidad", "unidades", "juego", "completo",
  "quiero", "necesito", "deme", "dame", "seria", "serian", "son", "nomas", "solo",
  "1", "2", "3", "4", "5", "6", "7", "8", "una", "dos", "tres", "cuatro", "cinco", "seis",
].map(colapsar));

/**
 * El mensaje es un acuse, o solo dice CUÁNTAS («Las 4», «4 llantas / Quiero»,
 * «necesito 2»): con un menú abierto, nada de eso dice CUÁL. Un número del 1
 * al 3 con artículo singular («la 2») sí elige y no entra; tampoco entra lo que
 * traiga otra cosa («…con tarjeta», «¿y en aro 17?»), que lo atiende el agente.
 */
export function soloAcuseOCantidad(mensajeDelCliente: string): boolean {
  if (esAcuseSimple(mensajeDelCliente)) return true;
  const n = normalizar(mensajeDelCliente);
  if (/\b(?:la|el|opcion|numero)\s+[1-3]\b|^\s*[1-3]\s*$|\b(?:primera|segunda|tercera)\b/.test(n)) return false;
  const palabras = palabrasDelAcuse(mensajeDelCliente);
  return palabras.some((p) => /^[1-8]$|^(?:una|dos|tres|cuatro|cinco|seis)$|^juego$/.test(p))
    && palabras.every((p) => PALABRAS_DE_CANTIDAD.has(p) || PALABRAS_DE_ACUSE.has(p));
}

/**
 * «¿Cuál le cotizo, la 1, la 2 o la 3?» — con las posiciones que el menú tenía,
 * y la cantidad por delante si el cliente la dijo (se guarda; no se pierde).
 */
export function preguntaCualLeCotizo(opciones: number, cantidad?: number | null): string {
  const pregunta = opciones >= 3 ? "¿Cuál le cotizo, la 1, la 2 o la 3?" : "¿Cuál le cotizo, la 1 o la 2?";
  return cantidad ? `Perfecto, ${cantidad} ${cantidad === 1 ? "llanta" : "llantas"}.\n---\n${pregunta}` : pregunta;
}

/** ¿Este texto es (o cierra con) la pregunta de elegir del menú? */
export function esPreguntaCualLeCotizo(texto: string | null | undefined): boolean {
  return /¿Cuál le cotizo, la 1/.test(texto ?? "");
}

/**
 * El hecho que reciben el modelo y el Guardián cuando el cliente contestó un
 * menú sin elegir. Dice lo mismo que el candado de `generar_cotizacion`.
 */
export function hechoDeMenuSinElegir(mensajeDelCliente: string, opciones: number): string {
  return (
    "MENÚ SIN ELEGIR (fuente determinística): el bot le mostró varias opciones y preguntó cuál cotizar; " +
    `el cliente respondió «${mensajeDelCliente.trim().slice(0, 60)}», que NO elige ninguna (un acuse o una ` +
    "cantidad no dice cuál). PROHIBIDO generar o anunciar una cotización y PROHIBIDO elegir por él. " +
    `Contesta lo que haya preguntado y cierra, sola en su bloque, con «${preguntaCualLeCotizo(opciones)}».`
  );
}

/**
 * QUÉ LLANTA NOMBRÓ LA OFERTA que el cliente acaba de aceptar, entre las de la
 * última lámina. Devuelve su código, o null si la oferta no señala una sola.
 *
 * Simulador, 20-oct, chat 29029: el bot ofreció «*FALKEN WILDPEAK A/T TRAIL*
 * … ¿Se la cotizo?», el cliente dijo «Si, por favor», el turno ya reconocía el
 * sí… y el modelo, con la orden genérica de cotizar, buscó la OTRA medida que
 * el cliente había nombrado y firmó una WINRUN. Un sí autoriza exactamente lo
 * que la oferta nombró: se resuelve acá y se cotiza eso, sin modelo.
 */
export function codigoDeLoOfrecido(
  turnoDelBot: string | null | undefined,
  vitrina: readonly { codigo: string; marca: string; diseno: string }[],
): string | null {
  const turno = normalizar(turnoDelBot ?? "");
  if (!turno || !vitrina.length || esMenuDeOpciones(turnoDelBot)) return null;
  const nombradas = [...new Map(
    vitrina
      .filter((o) => {
        const diseno = normalizar(o.diseno);
        return diseno.length >= 3 && turno.includes(diseno);
      })
      .map((o) => [o.codigo, o]),
  ).values()];
  if (nombradas.length === 1) return nombradas[0].codigo;
  // Varias del mismo diseño en otras medidas: decide la medida que nombró.
  if (nombradas.length > 1) return null;
  const distintas = new Set(vitrina.map((o) => o.codigo));
  return distintas.size === 1 && ofrecioCotizarLaUnica(turnoDelBot) ? [...distintas][0] : null;
}

/**
 * La última OFERTA de cotizar del bot que sigue viva: la que el «sí» de ahora
 * puede estar contestando aunque no sea la última fila. Muere con una
 * cotización enviada o con más de dos mensajes del cliente en el medio (las
 * mismas reglas que `ofertaDeCotizacionVigenteAceptada`).
 *
 * Simulador, 20-oct, chat 27992: «¿Le cotizo la KENDA KR20 en 195/45R15?» →
 * «Precio» → el bot dio el precio y el candado anti-calco le recortó la
 * pregunta repetida → «Si». El sí contestaba la pregunta de un turno atrás, y
 * el candado de la equivalente solo miraba la última fila: no cotizó.
 */
export function ultimaOfertaDeCotizar(historial: readonly { role: string; content: unknown }[]): string | null {
  const previos = historial.length && historial[historial.length - 1].role === "user"
    ? historial.slice(0, -1)
    : historial;
  let clientesEnMedio = 0;
  for (let i = previos.length - 1; i >= 0 && clientesEnMedio <= 2; i--) {
    const m = previos[i];
    if (typeof m.content !== "string") continue;
    if (m.role === "user") { clientesEnMedio += 1; continue; }
    if (m.role !== "assistant") continue;
    const texto = normalizar(m.content);
    if (COTIZACION_ENVIADA.test(texto)) return null;
    if (ofreceCotizarEn(m.content)) return m.content;
  }
  return null;
}

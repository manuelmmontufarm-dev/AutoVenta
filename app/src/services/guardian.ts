/**
 * EL ÁNGEL GUARDIÁN — revisión con IA de cada respuesta ANTES de enviarla.
 *
 * Pedido por Depot el 13-ago-2026, el mismo día en que se descubrió que el bot
 * había firmado una cotización en otra medida y se la confirmó al cliente como
 * si fuera la suya. El guardián de salida determinístico (outboundGuard) caza
 * patrones fijos; este caza lo que solo se ve ENTENDIENDO la conversación:
 * un precio que no cuadra con la cotización, la pregunta que el cliente ya
 * respondió, la contradicción con lo dicho dos mensajes atrás.
 *
 * Diseño:
 *  · Ve las cosas DESDE AFUERA: recibe lo que el bot quiere decir + los hechos
 *    duros (medida pedida, cotización vigente con sus números, historial) y
 *    decide: aprobar o corregir. Nunca bloquea — dejar al cliente sin
 *    respuesta es peor que cualquier error de estilo (lección de los chats
 *    mudos del 13-ago).
 *  · FALLA ABIERTO. Si el modelo revisor no contesta, contesta tarde o
 *    contesta basura, se envía el borrador original. El guardián existe para
 *    quitar errores, no para agregar un punto de fallo.
 *  · TODO queda registrado en guardian_reviews — aprobaciones incluidas. Al
 *    final de la semana eso ES la lista documentada de errores chicos y
 *    grandes que Depot pidió, con su categoría y su chat, para atacar causas.
 *  · Se prende y apaga desde Ajustes (settings guardian_config): cuando el
 *    asesor no quiere gastar tokens lo apaga; cuando quiere cero errores lo
 *    prende. El costo es ~1 llamada extra por turno, sin herramientas.
 *
 * El modelo revisor es el MISMO nivel que el vendedor (gpt-5.5 en producción,
 * OPENAI_GUARDIAN_MODEL para cambiarlo): un revisor más débil que el redactor
 * no ve los errores que el redactor no vio.
 */
import OpenAI from "openai";
import { z } from "zod";
import { config } from "../config.js";
import { sql } from "../db/client.js";
import type { Stage } from "../domain/pipeline.js";
import { ahorroDeLaCotizacion } from "../domain/ahorro.js";
import { medidaEstaPedida, mensajesDeLaVisitaActual } from "../domain/medidaPedida.js";
import { hechosDeRestricciones, restriccionesDeLlanta } from "../domain/restriccionesLlanta.js";
import { CIERRE_COTIZAR } from "../domain/preguntasProhibidas.js";
import { medidasDelPedido } from "./medidasDelPedido.js";
import { ensureCatalogReady, searchBySize, searchByText } from "./catalog.js";
import { parseTireSize } from "../domain/tireSize.js";
import { respaldoCompleto } from "../domain/respaldoMarcas.js";
import { logAiRun } from "./conversations.js";
import { crearAlertaRepeticion } from "./conversationQuality.js";
import { createBotAlert } from "./followUps.js";
import { getActiveBenefits } from "./benefits.js";
import { formatStoreHours, getGuardianConfig, getStoreHours } from "./settings.js";
import { faltanteDeCotizacion } from "./stockCorto.js";
import { alcanzaParaVender } from "../domain/stockCorto.js";
import { despedidaQueCorresponde } from "../domain/cierrePerdido.js";
import { ofertaDeCotizarAceptada } from "../domain/ofertaAceptada.js";
import { JUEGO_COMPLETO, opcionesQueAlcanzan } from "../domain/opcionesCandados.js";
import { tipoDeProducto } from "../domain/tireTypes.js";
import { chatReasoningEffort } from "../agent/aiRequestPolicy.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Tiempo máximo de la revisión. Pasado esto, gana el borrador original.
 *
 * Medición del 26-ago-2026: p90=10,6 s, p95=11,1 s y máxima=12,3 s. El corte
 * viejo de 12 s estaba dentro de la cola real y dejó 31/496 mensajes sin
 * revisar. En el lote real del 30-ago, 4/110 revisiones todavía agotaron 15 s;
 * veinte cubre esa cola sin permitir que un revisor caído frene
 * indefinidamente la venta.
 */
export const GUARDIAN_TIMEOUT_MS = 20_000;

/** Mensajes de contexto que ve el revisor. Más historia ≈ más tokens del cliente. */
const MENSAJES_DE_CONTEXTO = 16;

export const CATEGORIAS = [
  "hecho_comercial_inventado",
  "stock_prometido",
  "precio_incorrecto",
  "medida_incorrecta",
  "tipo_negado_con_stock",
  "re-pregunta",
  "contradiccion",
  "repeticion",
  "ignora-pregunta",
  "estado_desincronizado",
  "promesa_incumplible",
  "pregunta_de_mas",
  "insiste_tras_rechazo",
  "reofrece_lo_aceptado",
  "tono",
  "otro",
] as const;

/**
 * Categorías que NO generan aviso en el tab de Errores, por más alta que sea la
 * severidad. No es que no importen: es que no son «mira este chat ahora», y una
 * alerta que no pide acción entrena al asesor a ignorar las que sí la piden.
 * Siguen contadas en el informe (`/api/guardian/informe`), que es donde se
 * atacan las causas.
 */
const CATEGORIAS_SIN_ALERTA = new Set<string>(["tono", "otro"]);

const HallazgoSchema = z.object({
  categoria: z.enum(CATEGORIAS),
  severidad: z.enum(["alta", "media", "baja"]),
  detalle: z.string(),
});

const VeredictoSchema = z.object({
  veredicto: z.enum(["aprobar", "corregir"]),
  texto_corregido: z.string(),
  hallazgos: z.array(HallazgoSchema),
});

export type VeredictoGuardian = z.infer<typeof VeredictoSchema>;

/** Lo que el guardián decidió para un envío. `texto` es SIEMPRE enviable. */
export interface RevisionGuardian {
  texto: string;
  veredicto: "aprobar" | "corregir" | "sin_revision";
  hallazgos: z.infer<typeof HallazgoSchema>[];
}

export const ESQUEMA_SALIDA = {
  type: "json_schema",
  json_schema: {
    name: "revision_guardian",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["veredicto", "texto_corregido", "hallazgos"],
      properties: {
        veredicto: { type: "string", enum: ["aprobar", "corregir"] },
        texto_corregido: {
          type: "string",
          description: "El borrador corregido, completo y listo para enviar. Vacío si el veredicto es aprobar.",
        },
        hallazgos: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["categoria", "severidad", "detalle"],
            properties: {
              categoria: { type: "string", enum: [...CATEGORIAS] },
              severidad: { type: "string", enum: ["alta", "media", "baja"] },
              detalle: { type: "string", description: "Qué está mal, en una o dos frases concretas, citando el dato." },
            },
          },
        },
      },
    },
  },
} as const;

export const INSTRUCCIONES = `Eres el ÁNGEL GUARDIÁN del bot de ventas de Depot Tire (llantas, Quito). Revisas el BORRADOR que el bot está por enviar y lo apruebas o lo corriges. No eres el vendedor: eres el auditor que ve la conversación desde afuera.

REVISA, en este orden de gravedad:
0. NO VENDAS POR TU CUENTA. El CATÁLOGO DE HOY sirve para AUDITAR afirmaciones del borrador, no para crear una oferta nueva. Una corrección NO puede agregar un modelo, producto, precio, cantidad ni disponibilidad que el BORRADOR no traía. Si el borrador no nombró precio o producto, conserva ese límite aunque el catálogo tenga datos. Si el borrador dice que no hay stock vendible, no lo contradigas ofreciendo unidades sueltas: el juego comercial es de 4 y las filas marcadas NO VENDIBLE no se ofrecen. Si para corregir hiciera falta una tool o una nueva cotización, deja el borrador y reporta **hecho_comercial_inventado**; no improvises la venta. **LA REGLA 0 MANDA SOBRE TODAS LAS DEMÁS:** si una regla inferior parece pedirte agregar una llanta o un precio que el borrador no nombró, aplica la regla 0; corrige solo con palabras genéricas o aprueba con el hallazgo. **ÚNICA EXCEPCIÓN, y es quirúrgica (regla 21):** cuando el CLIENTE pidió un TIPO de llanta (A/T, H/T, R/T, M/T…) y el borrador lo niega o disfraza otra llanta de ese tipo, la corrección SÍ nombra la llanta de ese tipo que el CATÁLOGO DE HOY trae con stock para el juego — marca, diseño y precio copiados de esa fila, sin inventar nada. Ahí no estás vendiendo por tu cuenta: estás entregando el dato determinístico que el cliente pidió y el borrador escondió.
1. PRECIOS Y COTIZACIONES. Todo número que el borrador afirme (precio unitario, total, número de cotización, meses de garantía) debe coincidir EXACTAMENTE con los datos duros del contexto. Si el borrador confirma que una cotización corresponde a una medida y los datos dicen otra medida, eso es un error ALTO. Si el contexto trae la sección CATÁLOGO DE HOY, los precios de esas medidas SÍ son verificables — nada de «no puedo verificar la cifra»: un precio dicho FUERA de una cotización (una oferta, una recomendación, «la más económica es…») tiene que coincidir con la fila de esa llanta, y si no coincide es error ALTO **precio_incorrecto** cuya corrección usa el número del catálogo. El precio de la COTIZACIÓN vigente es aparte: es un número ya firmado y se compara contra la cotización, no contra el catálogo. La DISPONIBILIDAD sale de la misma sección: ofrecer, recomendar o prometer una llanta cuya fila dice «stock hoy: 0 (AGOTADA)» es error ALTO **stock_prometido**, y la corrección quita ESA llanta. Puede conservar otras alternativas que YA estaban en el borrador; el catálogo por sí solo NO autoriza a nombrar alternativas, precios ni disponibilidad nuevos. Solo si la llanta que el borrador nombra NO aparece en la sección se reporta y se aprueba sin cambiar la cifra.
2. MEDIDA. Si el cliente pidió una medida concreta y el borrador ofrece o confirma otra sin decirle con todas las letras que es una equivalente, error ALTO.
3. RE-PREGUNTAS. Si el borrador pregunta algo que el cliente ya respondió en la conversación (local, fecha, medida, uso), error ALTO. La corrección usa el dato ya dado y avanza. OJO: preguntar CUÁNTAS llantas quiere no es re-pregunta aunque lo parezca —el cliente puede no haberlo dicho nunca— y tiene su propia categoría en la regla 15; clasifícalo ahí.
4. CONTRADICCIONES con lo que el propio bot dijo antes.
5. IGNORAR LA PREGUNTA del último mensaje del cliente: el borrador debe responderla antes de seguir con su guion.
6. REPETICIÓN: bloques, frases o preguntas calcadas de mensajes anteriores del bot.
7. TONO: trato de «usted» consistente, sin saludos a mitad de conversación, sin muletillas robóticas.
8. LO QUE EL BOT HIZO vs LO QUE DICE. Si te doy la sección de herramientas del turno, el borrador debe ser consistente con ella: si una búsqueda devolvió opciones que el borrador niega u omite, o si la búsqueda usó un texto visiblemente distinto a lo que el cliente pidió, es error ALTO — corrige usando SOLO lo que la herramienta devolvió.
9. PROMESAS DE SERVICIO. Todo lo que el borrador presente como incluido (mantenimiento, rotación, alineación, revisiones, su periodicidad en km o meses) tiene que estar respaldado por la lista de «servicios y beneficios respaldados» del contexto. Prometer un servicio o una periodicidad que NO está en esa lista es error ALTO: lo cobra el local y lo reclama el cliente. Corrige dejando solo lo que sí está. Al revés también cuenta: si el borrador promete algo que SÍ está en la lista, no lo toques — quitar un beneficio real cuesta la venta.
10. DISPONIBILIDAD. Si los HECHOS traen la línea «STOCK CORTO», la cotización vigente promete más llantas de las que hay hoy. Entonces: TODO borrador que afirme esa cotización —su número, su cantidad («4 × …», «4 unidades», «el juego de 4») o su total— tiene que decir cuántas hay hoy y que el resto lo confirma el asesor. Omitirlo es error ALTO de categoría **stock_prometido**: el cliente se lleva un número por un juego que no existe y se entera en el local, que es el peor momento posible. La corrección AGREGA el dato, no borra la venta ni cambia la cantidad cotizada. Ojo con las dos formas de equivocarse: si el borrador NO menciona la cotización (por ejemplo solo pregunta el día de la visita), no le metas el aviso — repetirlo en cada turno lo vuelve ruido; y si ya lo trae con sus palabras, tampoco lo dupliques.
11. UNA NEGATIVA TIENE QUE SER ESPECÍFICA Y VENIR CON LA ALTERNATIVA. Decir «no tenemos» a secas es un error ALTO: deja al cliente sin salida y no es lo que dicen los datos. Esta regla se aplica cuando la HUELLA DE HERRAMIENTAS del turno ya devolvió qué SÍ hay ("en_esa_medida" o "ese_modelo_en_otras_medidas") o cuando el propio borrador ya nombró la alternativa. Entonces puede conservar esos nombres y corregir la negativa: «esa no la manejo en su medida, pero tengo estas». Sin esa huella, el catálogo por sí solo NO autoriza a nombrar alternativas: reporta el hallazgo y aprueba, o corrige de forma genérica sin productos ni precios. Solo cuando la herramienta reportó que no hay nada en ninguna lista vale un «no lo manejamos», y aun así tiene que ofrecer el siguiente paso (buscar por vehículo o por aro). Si la herramienta reportó el catálogo caído o vacío, NINGUNA negativa es válida: no se puede afirmar que algo no existe sin catálogo.

12. LO QUE EL BOT PROMETE vs LO QUE EL SISTEMA TIENE ANOTADO. Compara el borrador y lo que el BOT ya dijo en la conversación contra la sección de HECHOS REGISTRADOS. Si el bot confirmó una visita («listo, el jueves de 4 a 5 en Quito Sur») y los hechos dicen «Visita registrada: ninguna», eso es **estado_desincronizado** de severidad ALTA: el asesor no se va a enterar, no sale el cupón y el seguimiento le va a repreguntar el día. Lo mismo con el local, la medida o la cantidad confirmadas de palabra y ausentes de los hechos. IMPORTANTE: este hallazgo NO se arregla reescribiendo el mensaje al cliente —el mensaje está bien, lo que falla es el registro—. Repórtalo y APRUEBA el texto tal cual. Solo corrige si el borrador además promete algo que contradice un hecho que SÍ está anotado.

13. PROMESAS QUE EL BOT NO PUEDE CUMPLIR. El bot solo puede prometer lo que está saliendo en ESE mismo turno. «Le paso la cotización correcta apenas esté confirmada», «se la mando en un momento», «le envío el PDF enseguida» son **promesa_incumplible** de severidad ALTA cuando el turno no lleva esa pieza: nada la genera después, y el cliente se queda esperando un archivo que no existe. Pasó el 26-ago (Andrés Tamayo): tres turnos seguidos prometiendo la cotización buena y ninguna salió. La corrección NO repite la promesa: si la pieza no se puede mandar, el borrador dice lo que sí es cierto y pide el dato que falta. Si los HECHOS traen «COTIZACIÓN DESALINEADA», el borrador tiene PROHIBIDO presentar esa cotización como válida y PROHIBIDO prometer la nueva — quien la genera es la herramienta, no el texto.

14. NÚMEROS DE COTIZACIÓN: NUNCA en el mensaje al cliente. Ni «COT-…» ni «AV-…». El cliente no llega al local recitándolos y ponerlos compite con lo único que sí tiene que recordar, su código de cupón. Si el borrador los trae, quítalos y habla de la cotización por su contenido («su cotización de 4 Falken Wildpeak en 235/75R15»). Y jamás los uses TÚ para explicarle al cliente por qué algo está mal: discutir números de cotización con él es ruido, no servicio.

15. LO QUE EL BOT TIENE PROHIBIDO PREGUNTAR, TÚ TAMPOCO. Tu corrección ES un mensaje del bot y hereda sus prohibiciones. La que más se cuela: **preguntar cuántas llantas quiere**. No se pregunta nunca — sin cantidad dicha son 4, que es el juego, y se cotizan de una; si después el cliente dice otra cantidad, se cotiza de nuevo con esa. Tampoco se pregunta el nombre, ni «¿cliente final?», ni nada que los HECHOS ya traigan. **Y DESDE EL 31-AGO TAMPOCO SE PIDE PERMISO PARA COTIZAR:** «${CIERRE_COTIZAR}» y sus variantes son pregunta_de_mas — cuando el cliente ya pidió precio, eligió una opción o dio su señal, la cotización SALE en ese turno; la única pregunta de permiso legítima es ante un CAMBIO DE MEDIDA (una equivalente necesita su consentimiento: «si le parece, ¿se la cotizo?»). Cualquier otra forma de pedir permiso para la cantidad («¿se la cotizo por 6?», «¿cuántas lleva?») sigue siendo error. **OJO con lo que NO es una pregunta:** cuando la cantidad se sale de lo normal (menos de 4 o más de 8) el bot AVISA al mandar la pieza —«Aquí le mando la cotización con *9 llantas* 👍»—. Eso es una afirmación correcta y pedida por el negocio: no la toques ni la marques. Si el borrador trae una de las preguntas prohibidas es **pregunta_de_mas** de severidad ALTA —cada una cuesta un turno para llegar a la misma respuesta— y la corrección la reemplaza por el paso que sí corresponde (cotizar), no la reescribe más bonita.

17. AVISAR DEL STOCK NO SIEMPRE ALCANZA. Si los HECHOS traen «STOCK NO ALCANZA», el bot firmó —o está por firmar— una cantidad de la que hoy hay menos de la mitad. Ahí la regla 10 se queda corta: pegarle el aviso a una promesa no deshace la promesa, y el cliente igual se lleva un número por un juego que no existe. Cualquier borrador que presente esa cantidad como cotizada —su total, su «4 × …», su «el juego»— es error ALTO de categoría **stock_prometido** AUNQUE traiga el aviso pegado. La corrección dice cuántas hay hoy y ofrece las dos salidas reales: cotizar las que hay, o que el asesor consiga el resto por pedido. Y no inventes un total nuevo: si no tienes el precio unitario en los datos duros, hablas de unidades y no de plata.

18. AL QUE SE DESPIDIÓ NO SE LE INSISTE. Si los HECHOS traen «EL CLIENTE SE DESPIDIÓ», el cliente acaba de decir que ya compró en otro lado, que no le interesa o que no le escriban más. Cualquier borrador que le pregunte el día de la visita, le ofrezca un descuento, le mande links del local o le proponga cualquier siguiente paso comercial es error ALTO de categoría **insiste_tras_rechazo**. Pasó el 27-ago (conv 4732): el cliente escribió «Gracias ya compré en otro lugar» y en el mismo turno recibió «¿Qué día cree que puede pasar por Depot Tire Cumbayá? … con 25 % de descuento, $73.92 menos». La corrección es una despedida corta y cálida que agradece, se alegra por su compra si compró, y deja la puerta abierta sin pedir nada. Ninguna pregunta.

19. AL QUE YA DIJO QUE SÍ NO SE LE VUELVE A PREGUNTAR. Si los HECHOS traen «EL CLIENTE YA ACEPTÓ», el bot ofreció la cotización y el cliente contestó «gracias», «ok», «listo» o parecido. Eso es un sí. Un borrador que vuelve a ofrecer lo mismo —«si desea, le dejo la cotización formal», «¿quiere que se la cotice?»— es error ALTO de categoría **reofrece_lo_aceptado**: son dos turnos para llegar al mismo sitio y es donde el cliente deja de contestar. Pasó el 27-ago (conv 11070). OJO con lo que NO puedes hacer: TÚ no puedes generar la cotización, así que no prometas que sale ni inventes su total. Corrige a un mensaje que confirme que va en camino solo si el turno la lleva; si no, repórtalo ALTO y aprueba — el que tiene que llamar a la herramienta es el bot.

20. EL ANCHO QUE EL CLIENTE RECHAZÓ NO SE LE VUELVE A OFRECER. Si los HECHOS traen «RESTRICCIONES DEL CLIENTE», el cliente ya dijo que ese ancho no lo quiere (por calce, roce, consumo o simple gusto). Cualquier borrador que le ofrezca, recomiende, muestre o cotice una llanta de un ancho rechazado es error ALTO de categoría **insiste_tras_rechazo**. Pasó el 31-ago (conv 3): el cliente escribió «ya no 185, ¿qué otras tiene?» y el turno siguiente le mandó dos 185. La corrección quita ESAS llantas; si con eso el borrador se queda sin opciones, la corrección lo dice con todas las letras —«en su aro solo manejo esa medida»— y ofrece confirmar por su vehículo o con el asesor qué medida alternativa sí le calza. La regla 0 sigue mandando: no inventes tú la alternativa.

16. EL CIERRE DESPUÉS DE LA COTIZACIÓN VA EN DOS MENSAJES. Primero los dos locales con sus links y un «sin compromiso»; después, en mensaje aparte, la pregunta de a cuál le queda mejor. El DÍA no se pregunta en ese turno: se pregunta recién cuando el cliente ya eligió local. Si el borrador junta las dos preguntas —local y día— o mete la pregunta dentro del bloque de los links, corrígelo respetando los separadores '---'.

21. EL TIPO DE LLANTA SALE DEL CATÁLOGO, NUNCA DEL BORRADOR. Cada fila del CATÁLOGO DE HOY trae su tipo entre corchetes ([A/T], [H/T], [R/T], [M/T]…). Dos errores ALTOS de categoría **tipo_negado_con_stock**: (a) el borrador presenta una llanta como de un tipo que el catálogo no le da — pasó el 1-sep (conv 13645): ofreció la KR50 [H/T] como si fuera la A/T pedida; (b) el borrador dice que un tipo «no hay», «no está disponible» o «no se lo ofrezco» cuando el catálogo trae una llanta de ese tipo con stock para el juego de ${JUEGO_COMPLETO} — ese mismo día el cliente pidió A/T y el catálogo tenía la KR28 [A/T] con 89 y la KR608 [A/T] con 74. TU CORRECCIÓN NO INVENTA, PERO TAMPOCO SE ESCONDE: si el catálogo trae el tipo pedido con stock para el juego, la corrección lo ofrece NOMBRÁNDOLO — marca, diseño y precio copiados de ESA fila («la *KENDA KR28* a *$238.37 c/u con IVA*»). PROHIBIDO el genérico «le confirmo una opción A/T»: eso deja al cliente sin llanta otra vez. Solo si el dato no está en el catálogo del contexto, la corrección no niega ni afirma — dice que lo confirmas enseguida, y reportas el hallazgo. PROHIBIDO deducir «no hay» de que una lista no lo mencione: las listas del bot vienen recortadas; la única fuente para negar un tipo es el CATÁLOGO DE HOY completo de esa medida.

REGLAS DE CORRECCIÓN (innegociables):
- NUNCA inventes precios, medidas, stock, plazos ni datos que no estén en el contexto. Si no puedes verificar una cifra, NO la cambies: repórtala como hallazgo y aprueba.
- La corrección conserva la intención de venta del borrador, su idioma y su formato (los separadores '---' se respetan; los *negritas* de WhatsApp también).
- La corrección debe ser un mensaje COMPLETO y natural, listo para el cliente. Nunca entregues un texto vacío ni notas para el bot.
- Corrige solo cuando haga falta: un borrador correcto se aprueba sin tocar. Corregir por gusto es ruido.
- En la duda, aprueba y reporta el hallazgo. Peor que un error de estilo es un guardián que rompe una venta.`;

/**
 * Lo que cambia cuando lo revisado NO es una respuesta sino un seguimiento
 * automático — el mensaje que sale solo cuando el cliente lleva horas callado.
 *
 * Es otro animal: no contesta a nadie, no puede saludar como si empezara la
 * conversación, y sobre todo no puede preguntar lo que ya está anotado. Los dos
 * seguimientos del 24-ago («¿te ayudo a dejar lista la visita?» y «¿qué día te
 * quedaría más cómodo?») salieron DESPUÉS de que el bot confirmara «jueves de 4
 * a 5 pm», y ninguno pasó por aquí: el guardián solo miraba las respuestas.
 */
const INSTRUCCIONES_SEGUIMIENTO = `
== ESTO ES UN SEGUIMIENTO AUTOMÁTICO, NO UNA RESPUESTA ==
El cliente NO acaba de escribir: este mensaje sale solo tras un rato de silencio. Revísalo con esta vara:
- Si los HECHOS ya traen la visita registrada (día y local), el seguimiento CONFIRMA y recuerda; preguntar otra vez el día, el local o «¿te ayudo a coordinar?» es **re-pregunta** de severidad ALTA. Corrígelo por una confirmación que diga el día y el local que están en los hechos.
- No puede contradecir lo que el bot ya dijo en la conversación, ni pedir un dato que el cliente ya dio.
- No saluda de nuevo dentro de una conversación viva, no inventa urgencia, escasez ni descuentos, y no nombra un día que no esté en los hechos.
- Es un solo mensaje corto de WhatsApp. Si está bien, apruébalo sin tocarlo.`;

interface FilaMensaje {
  direction: string;
  author_kind: string | null;
  content: string | null;
}

interface CotizacionVigente {
  quote_number: string;
  total: string | number;
  created_at: Date;
  items: Array<{ code?: string; brand?: string; design?: string; sizeLabel?: string; quantity?: number; salePriceWithTax?: number }>;
}

export interface HuellaHerramienta {
  herramienta: string;
  argumentos: string;
  resultado: string;
}

/** El contexto que ve el revisor, armado con los mismos datos que usa el bot. */
export interface OpcionesRevision {
  /**
   * `respuesta` es el turno normal; `seguimiento` es el mensaje automático que
   * sale tras el silencio del cliente y que hasta el 26-ago no se revisaba.
   */
  tipo?: "respuesta" | "seguimiento";
}

type RespuestaOpenAI = OpenAI.Chat.Completions.ChatCompletion;

/** Inyección mínima para poder probar un timeout real sin esperar 15 segundos. */
export interface DependenciasGuardian {
  timeoutMs?: number;
  completar?: () => Promise<RespuestaOpenAI>;
}

async function conTiempoMaximo<T>(promesa: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Guardián sin respuesta en ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function registrarFalloAbierto(input: {
  conversation: { id: number; current_cycle: number };
  borrador: string;
  model: string;
  latencyMs: number;
  timeoutMs: number;
  error: unknown;
}): Promise<void> {
  const mensaje = input.error instanceof Error ? input.error.message : String(input.error);
  const fueTimeout = /sin respuesta|timeout|timed out/i.test(mensaje);
  const detalle = fueTimeout
    ? `Mensaje enviado sin revisión: el guardián agotó el tiempo máximo de ${input.timeoutMs} ms.`
    : `Mensaje enviado sin revisión: el guardián falló (${mensaje.slice(0, 180)}).`;
  const hallazgos = [{ categoria: "otro", severidad: "alta", detalle }] as const;

  // 27-ago-2026: 31/496 mensajes fallaron abierto y no dejaron ni fila ni
  // alerta. Las dos escrituras son independientes: si una falla, la otra puede
  // conservar el rastro. Ninguna puede bloquear el mensaje al cliente.
  await Promise.allSettled([
    sql`
      insert into guardian_reviews (
        conversation_id, cycle, model, verdict, findings, original_text,
        corrected_text, latency_ms
      ) values (
        ${input.conversation.id}, ${input.conversation.current_cycle}, ${input.model},
        'sin_revision', ${sql.json(hallazgos as never)}, ${input.borrador}, null,
        ${input.latencyMs}
      )
    `,
    createBotAlert({
      conversationId: input.conversation.id,
      cycle: input.conversation.current_cycle,
      type: "guardian_sin_revision",
      priority: "high",
      summary: "Un mensaje salió sin revisar por el Ángel Guardián",
      exactReason: `${detalle} El borrador que salió fue: «${input.borrador.slice(0, 220)}».`,
      suggestedAction:
        "Revisa este turno: el bot siguió contestando, pero la segunda línea de defensa no estuvo disponible.",
      dedupeKey: `guardian_sin_revision:${input.conversation.id}:${input.conversation.current_cycle}`,
    }),
  ]);
}

/**
 * EL CATÁLOGO DE HOY, PARA LAS MEDIDAS DE ESTA CONVERSACIÓN.
 *
 * Sin esto el guardián era ciego a los precios: la conv 11070 (27-ago) afirmó
 * «KENDA KR628 a $144.44 c/u con IVA» y el revisor escribió, con razón, «no
 * hay cotización vigente ni datos duros de precios para verificarlo … se
 * reporta y se aprueba». La cifra era del turno ANTERIOR del propio bot; el
 * revisor no tenía contra qué compararla. Manuel: «no quiero ni una falla más
 * de catálogo — las reglas están ahí y hay acceso a Interbot y Contífico».
 *
 * Los precios son EXACTAMENTE los que imprimen las herramientas: el catálogo
 * en memoria ya lleva el Interbot aplicado (`applyInterbotPrices` pisa
 * `minimumPriceWithTax` con el precio de hoy, promo incluida), así que esta
 * lista y la pieza de opciones salen de la misma celda. Falla en silencio a
 * propósito: un guardián sin catálogo revisa como antes, no revienta el turno.
 */
async function catalogoParaElGuardian(pedidas: readonly string[]): Promise<string[]> {
  if (!pedidas.length) return [];
  try {
    await ensureCatalogReady();
    const filas: string[] = [];
    for (const medida of pedidas.slice(0, 3)) {
      const size = parseTireSize(medida);
      const encontrados = size ? searchBySize(size) : searchByText(medida, 12);
      const vendibles = new Set(
        opcionesQueAlcanzan(encontrados, JUEGO_COMPLETO).map((p) => p.code),
      );
      // Las 12 cubren la medida entera (hoy ninguna pasa de 10 productos): con
      // el corte viejo de 8, justo las filas que le daban la razón al cliente
      // podían quedar fuera y el revisor «confirmaba» un no-hay con la lista
      // incompleta (1-sep, conv 13645).
      for (const p of encontrados.slice(0, 12)) {
        const estado = !vendibles.has(p.code)
          ? ` (NO VENDIBLE para el juego de ${JUEGO_COMPLETO}: no se ofrece)`
          : p.stock < JUEGO_COMPLETO
            ? ` (STOCK CORTO para el juego de ${JUEGO_COMPLETO}: no ofrecer ${p.stock} unidades sueltas; el resto lo confirma el asesor)`
            : "";
        // El tipo (A/T, H/T…) viene de la base del cliente, no de Contífico.
        // Sin él, el revisor no puede juzgar un «no hay A/T»: el 1-sep tenía
        // la KR28 con 89 unidades en la lista y no sabía que era A/T.
        const tipo = tipoDeProducto(p.code, p.design);
        filas.push(
          `· ${p.brand} ${p.design} ${p.sizeLabel} ${tipo ? `[${tipo}]` : "[tipo sin clasificar]"} — hoy $${p.minimumPriceWithTax.toFixed(2)} c/u con IVA · ` +
          `stock hoy: ${p.stock}${estado}`,
        );
      }
      if (!encontrados.length) filas.push(`· en ${medida} el catálogo no tiene NINGUNA llanta hoy`);
    }
    if (!filas.length) return [];
    return [
      "== CATÁLOGO DE HOY (fuente determinística: Contífico + precios Interbot, el mismo número que imprimen las piezas) ==",
      ...filas,
    ];
  } catch {
    return [];
  }
}

export async function armarContexto(
  conversationId: number,
  cycle: number,
  borrador: string,
  huella: readonly HuellaHerramienta[] = [],
  opciones: OpcionesRevision = {},
): Promise<string> {
  // SOLO el ciclo vigente. Sin este filtro el revisor leía ciclos cerrados y
  // «corregía» con datos rancios: en el ciclo 5 de la conv 3 (26-ago) vio el
  // «al de quito sur / mañana» del ciclo 4 y reescribió la pregunta de visita
  // nueva —con sus dos links— por un «Como ya me indicó, puede pasar mañana
  // por Quito Sur» que el cliente jamás dijo en este ciclo.
  const mensajes = await sql<FilaMensaje[]>`
    select direction, author_kind, content from messages
    where conversation_id=${conversationId} and cycle=${cycle}
    order by created_at desc limit ${MENSAJES_DE_CONTEXTO}
  `;
  const [hechos] = await sql<{
    tire_size: string | null; vehicle: string | null; selected_quantity: number | null;
    nearest_store: string | null; customer_commitment: string | null; visit_date: Date | null;
    visit_time_label: string | null;
  }[]>`
    select tire_size, vehicle, selected_quantity, nearest_store, customer_commitment, visit_date,
      visit_time_label
    from conversations where id=${conversationId}
  `;
  const [cotizacion] = await sql<CotizacionVigente[]>`
    select quote_number, total, created_at, items from quotes
    where conversation_id=${conversationId} and cycle=${cycle}
    order by created_at desc limit 1
  `;
  const faltante = faltanteDeCotizacion(
    cotizacion
      ? { quote_number: cotizacion.quote_number, total: cotizacion.total, items: cotizacion.items }
      : null,
  );
  // La MISMA cuenta que hace el candado de la cotización, y por eso sale de la
  // misma función: el 26-ago (conv 4732) el candado miraba todo el ciclo y el
  // revisor solo los 16 mensajes recientes, y esa diferencia fue justo la
  // grieta por la que se firmó una medida vieja.
  const pedidas = await medidasDelPedido(conversationId, cycle);
  // Los beneficios son datos duros, no adorno: sin ellos el revisor no puede
  // distinguir «mantenimiento gratuito cada 10.000 km» (que Depot sí da y está
  // en la tabla) de una cifra inventada por el redactor. Sin esta sección, el
  // guardián marcaba las dos igual.
  //
  // Van las DOS fuentes. La tabla `benefits` es lo que se imprime en la pieza;
  // `servicios_incluidos` de conocimiento-marcas.json (entregado por el negocio
  // el 13-ago) es lo que el bot ofrece hablando — la rotación cada 10.000 km
  // solo vive ahí. Con una sola de las dos, el guardián corregiría promesas
  // ciertas, que es peor que no revisarlas: enseña al bot a callar algo real.
  const [beneficios, storeHours] = await Promise.all([
    getActiveBenefits().catch(() => []),
    getStoreHours(),
  ]);
  const servicios = (() => {
    try {
      return respaldoCompleto().serviciosIncluidos;
    } catch {
      return [] as string[];
    }
  })();
  const respaldados = [...beneficios.map((b) => b.text), ...servicios];
  const catalogoHoy = await catalogoParaElGuardian(pedidas);

  // El rechazo de medida como HECHO, no como deducción. 31-ago (conv 3 c20):
  // el cliente escribió «ya no 185, ¿qué otras tiene?» y el revisor aprobó una
  // pieza con dos 185 — tenía el mensaje en su historial, pero nada en los
  // hechos ni en la rúbrica le decía que eso era un rechazo vigente. La misma
  // fuente determinística que usan las tools (`restriccionesDeLlanta`).
  const inboundVisita = await sql<{ content: string; created_at: Date }[]>`
    select content, created_at from messages
    where conversation_id=${conversationId} and cycle=${cycle} and direction='inbound'
    order by created_at desc limit 12
  `;
  const hechoRestricciones = hechosDeRestricciones(
    restriccionesDeLlanta(mensajesDeLaVisitaActual(inboundVisita).map((m) => m.content).reverse()),
  );

  // Los dos últimos turnos, sueltos: son la materia prima de los hechos de
  // despedida y de oferta aceptada. `mensajes` viene del más nuevo al más viejo.
  const ultimoDelCliente = mensajes.find((m) => m.direction === "inbound")?.content ?? "";
  const ultimoDelBot =
    mensajes.find((m) => m.direction !== "inbound" && m.author_kind === "bot")?.content ?? null;

  const historial = [...mensajes].reverse().map((m) => {
    const quien = m.direction === "inbound" ? "CLIENTE" : m.author_kind === "bot" ? "BOT" : "ASESOR";
    return `${quien}: ${(m.content ?? "").slice(0, 380)}`;
  }).join("\n");

  const item = cotizacion?.items?.[0];
  const ahorro = ahorroDeLaCotizacion(cotizacion?.items ?? null);
  return [
    "== HECHOS REGISTRADOS ==",
    `Medidas que el cliente pidió: ${pedidas.length ? pedidas.join(", ") : "(ninguna todavía)"}`,
    hechos?.vehicle ? `Vehículo: ${hechos.vehicle}` : null,
    hechos?.selected_quantity != null ? `Cantidad elegida: ${hechos.selected_quantity}` : null,
    // Estas dos líneas se escriben SIEMPRE, también cuando están vacías. Es lo
    // que permite el hallazgo `estado_desincronizado`: sin un «(ninguno)»
    // explícito, el revisor no puede notar que el bot acaba de confirmar una
    // visita que el sistema no tiene anotada — que fue el fallo del 24-ago.
    `Local ya elegido: ${hechos?.nearest_store ?? "(ninguno)"}`,
    `Visita registrada: ${
      hechos?.visit_date
        ? `${hechos.visit_date.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", weekday: "long", day: "numeric", month: "long" }).replace(",", "")}${hechos.visit_time_label ? ` ${hechos.visit_time_label}` : ""}`
        : "(ninguna)"
    }`,
    `Compromiso de visita en palabras del cliente: ${hechos?.customer_commitment ?? "(ninguno)"}`,
    // El rechazo de ancho, como hecho. Lo mira la regla 20.
    hechoRestricciones,
    `Horarios confirmados: ${formatStoreHours(storeHours)}`,
    // SIN ESTA LÍNEA EL REVISOR ES CIEGO AL STOCK.
    //
    // El 26-ago (conv 11061) el guardián corrigió un borrador y en su
    // reescritura puso «la cotización vigente … 4 × KENDA KR203 … $262.60»
    // cuando había 3. Tenía el aviso del bot en su ventana de historial y no lo
    // repitió: para él las 4 unidades eran un hecho firme, porque los HECHOS se
    // lo decían así y su rúbrica no hablaba de disponibilidad. Ahora el
    // faltante es un hecho más, y la regla 10 lo exige.
    faltante && alcanzaParaVender(faltante.stockHoy, faltante.cantidad)
      ? `STOCK CORTO: la cotización vigente es por ${faltante.cantidad} y hoy hay ${faltante.stockHoy} ` +
        `de ${faltante.etiqueta || faltante.codigo}. El resto lo confirma el asesor.`
      : null,
    // Y EL ESCALÓN DE ARRIBA: no es que falte una, es que casi no hay.
    //
    // 27-ago, conv 11720: 215/50R17 con UNA unidad, cotización firmada por 4 a
    // $423.52. El guardián la aprobó sin un hallazgo, y con razón: su única
    // regla de stock (la 10) le pedía que EXIGIERA EL AVISO, y el aviso estaba.
    // Nada le decía que a esa distancia el aviso ya no alcanza. Ahora la
    // distancia es un hecho, con su nombre.
    faltante && !alcanzaParaVender(faltante.stockHoy, faltante.cantidad)
      ? `STOCK NO ALCANZA: la cotización vigente es por ${faltante.cantidad} y hoy hay ${faltante.stockHoy} ` +
        `de ${faltante.etiqueta || faltante.codigo} — menos de la mitad de lo pedido. Esto NO es un desfase ` +
        "de inventario: es que no hay. Avisar no basta; esa cantidad no se debió firmar."
      : null,
    // El cliente se despidió en ESTE turno. Lo miran las reglas 17 y 18.
    despedidaQueCorresponde(ultimoDelCliente)
      ? `EL CLIENTE SE DESPIDIÓ: su último mensaje fue «${ultimoDelCliente.slice(0, 120)}». ` +
        "La venta está cerrada. No se le insiste con nada."
      : null,
    ofertaDeCotizarAceptada(ultimoDelBot, ultimoDelCliente)
      ? `EL CLIENTE YA ACEPTÓ: el bot le ofreció la cotización y él contestó «${ultimoDelCliente.slice(0, 60)}». ` +
        "Eso es un sí. Lo que corresponde es la cotización, no volver a ofrecerla."
      : null,
    // La cotización vigente puede ser de OTRA medida que la que el cliente está
    // comprando (conv 4732: se firmó una 265/65R17 a quien compraba 235/70R15).
    // Sin esta línea el revisor tiene que deducirlo cruzando dos datos sueltos,
    // y lo que hizo en vivo fue corregir el texto y dejar que el bot prometiera
    // una cotización que nadie iba a mandar.
    cotizacion && item?.sizeLabel && pedidas.length && !medidaEstaPedida(item.sizeLabel, pedidas)
      ? `COTIZACIÓN DESALINEADA: la cotización vigente es de ${item.sizeLabel} y el cliente está comprando ${pedidas.join(" o ")}. ` +
        "Esa cotización NO le sirve y el bot NO puede arreglarla escribiendo: la única salida es generar una nueva."
      : null,
    cotizacion
      ? `Cotización vigente: ${cotizacion.quote_number} · total $${Number(cotizacion.total).toFixed(2)}` +
        (item ? ` · ${item.quantity ?? "?"} × ${item.brand ?? ""} ${item.design ?? ""} ${item.sizeLabel ?? ""}` +
          (item.salePriceWithTax ? ` a $${Number(item.salePriceWithTax).toFixed(2)} c/u` : "") : "")
      : "Cotización vigente: ninguna",
    // SIN ESTA LÍNEA EL REVISOR BORRA EL DESCUENTO.
    //
    // Probado en el simulador el 26-ago: la ruta directa preguntó el día con
    // «*25 %* de descuento, *$277.44* menos» —cierto, y calculado de la propia
    // cotización— y el guardián lo tachó por `precio_incorrecto`: «esos datos
    // no aparecen en los hechos registrados». Tenía razón con lo que le
    // dábamos. Un dato que el revisor no puede verificar es un dato que el
    // revisor borra, así que el ahorro viaja como hecho igual que el faltante
    // de stock.
    ahorro
      ? `Ahorro de esa cotización: ${ahorro.porcentaje} % menos que el precio de lista, o sea $${ahorro.monto.toFixed(2)} en toda la compra. ` +
        "Es real y sale de la misma cotización: el bot PUEDE decirlo, y no depende de que el cliente dé el día."
      : null,
    respaldados.length
      ? `Servicios y beneficios respaldados (lo ÚNICO que el bot puede prometer como incluido): ${respaldados.join(" · ")}`
      : "Servicios y beneficios respaldados: ninguno cargado — el borrador no puede prometer nada como incluido",
    ...(catalogoHoy.length ? ["", ...catalogoHoy] : []),
    "",
    "== CONVERSACIÓN (vieja → nueva) ==",
    historial,
    ...(huella.length
      ? [
          "",
          "== LO QUE EL BOT HIZO ESTE TURNO (herramientas) ==",
          ...huella.map((h) => `${h.herramienta}(${h.argumentos}) → ${h.resultado}`),
        ]
      : []),
    ...(opciones.tipo === "seguimiento" ? ["", INSTRUCCIONES_SEGUIMIENTO] : []),
    "",
    opciones.tipo === "seguimiento"
      ? "== SEGUIMIENTO QUE EL BOT QUIERE ENVIAR =="
      : "== BORRADOR QUE EL BOT QUIERE ENVIAR ==",
    borrador,
  ].filter((linea) => linea !== null).join("\n");
}

/** Interpreta la salida del modelo con la red de seguridad puesta. */
export function aplicarVeredicto(borrador: string, crudo: unknown): RevisionGuardian {
  const parsed = VeredictoSchema.safeParse(crudo);
  if (!parsed.success) {
    return {
      texto: borrador,
      veredicto: "sin_revision",
      hallazgos: [{
        categoria: "otro",
        severidad: "alta",
        detalle: "Mensaje enviado sin revisión: el guardián devolvió una salida estructurada inválida.",
      }],
    };
  }
  const v = parsed.data;
  const corregido = v.texto_corregido.trim();
  // Una «corrección» vacía o idéntica no es corrección: se aprueba con hallazgos.
  if (v.veredicto === "corregir" && corregido && corregido !== borrador.trim()) {
    return { texto: corregido, veredicto: "corregir", hallazgos: v.hallazgos };
  }
  return { texto: borrador, veredicto: "aprobar", hallazgos: v.hallazgos };
}

/**
 * Revisa el borrador y devuelve el texto que de verdad se envía.
 *
 * Nunca lanza y nunca devuelve vacío: en cualquier fallo, el borrador original
 * sale tal cual y la conversación no se entera de que el guardián existe.
 */
export async function revisarConGuardian(
  conversation: { id: number; current_cycle: number; stage: Stage },
  borrador: string,
  huella: readonly HuellaHerramienta[] = [],
  opciones: OpcionesRevision = {},
  dependencias: DependenciasGuardian = {},
): Promise<RevisionGuardian> {
  const sinRevision: RevisionGuardian = { texto: borrador, veredicto: "sin_revision", hallazgos: [] };
  let activo = false;
  let inicio = Date.now();
  const timeoutMs = dependencias.timeoutMs ?? GUARDIAN_TIMEOUT_MS;
  try {
    const cfg = await getGuardianConfig();
    if (!cfg.activo) return sinRevision;
    activo = true;

    inicio = Date.now();
    const contexto = await armarContexto(
      conversation.id, conversation.current_cycle, borrador, huella, opciones,
    );
    const reasoningEffort = chatReasoningEffort(config.openai.guardianModel, false);
    const completar = dependencias.completar ?? (() => openai.chat.completions.create({
        model: config.openai.guardianModel,
        messages: [
          { role: "system", content: INSTRUCCIONES },
          { role: "user", content: contexto },
        ],
        response_format: ESQUEMA_SALIDA as never,
        // GPT-5 comparte este presupuesto entre razonamiento y JSON visible.
        // Con 1200, 16/110 turnos del lote real no produjeron un objeto válido.
        max_completion_tokens: 2000,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        stream: false,
      }));
    const respuesta = await conTiempoMaximo(completar(), timeoutMs);
    const ms = Date.now() - inicio;
    const texto = respuesta.choices[0]?.message?.content ?? "";
    const revision = aplicarVeredicto(borrador, texto ? JSON.parse(texto) : null);

    await logAiRun({
      conversationId: conversation.id,
      stage: conversation.stage,
      model: config.openai.guardianModel,
      latencyMs: ms,
      inputTokens: respuesta.usage?.prompt_tokens ?? 0,
      outputTokens: respuesta.usage?.completion_tokens ?? 0,
      cachedInputTokens: respuesta.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      route: opciones.tipo === "seguimiento" ? "guardian_seguimiento" : "guardian",
      callType: "guardian",
      tools: [],
    }).catch(() => undefined);

    await sql`
      insert into guardian_reviews (
        conversation_id, cycle, model, verdict, findings, original_text, corrected_text, latency_ms
      ) values (
        ${conversation.id}, ${conversation.current_cycle}, ${config.openai.guardianModel},
        ${revision.veredicto}, ${sql.json(revision.hallazgos as never)}, ${borrador},
        ${revision.veredicto === "corregir" ? revision.texto : null}, ${ms}
      )
    `;

    // Solo las correcciones con hallazgo alto llegan al tab de Errores: son
    // las que el asesor debe mirar. El resto vive en el informe del guardián.
    //
    // `tono` y `otro` quedan fuera del aviso aunque vengan en alta: en 7 días
    // fueron 11 de los hallazgos altos y ninguno era «mira este chat ahora».
    // Siguen contando en el informe semanal, que es la herramienta de mejora.
    const alto = revision.hallazgos.find(
      (h) => h.severidad === "alta" && !CATEGORIAS_SIN_ALERTA.has(h.categoria),
    );
    if (revision.veredicto === "corregir" && alto) {
      await createBotAlert({
        conversationId: conversation.id,
        cycle: conversation.current_cycle,
        type: "guardian_correccion",
        priority: "high",
        summary: `El guardián corrigió la respuesta: ${alto.categoria}`,
        exactReason: alto.detalle,
        suggestedAction: "Revisa el chat: el error se corrigió antes de enviarse, pero delata qué está fallando en el bot.",
        dedupeKey: `guardian:${conversation.id}:${conversation.current_cycle}:${alto.categoria}:${alto.detalle.slice(0, 60)}`,
      }).catch(() => undefined);
    }

    // La repetición que vale es la que el guardián ve ENTENDIENDO el chat: en 7
    // días marcó 9, contra 14 en un solo día del detector de texto. Cuando la
    // marca en alta, el tab de errores recibe la alerta de siempre —misma
    // clave diaria— y así el asesor tiene una sola fuente con juicio real.
    const repeticion = revision.hallazgos.find(
      (h) => h.categoria === "repeticion" && h.severidad === "alta",
    );
    if (revision.veredicto === "corregir" && repeticion) {
      await crearAlertaRepeticion({
        conversationId: conversation.id,
        cycle: conversation.current_cycle,
        exactReason: repeticion.detalle,
        suggestedAction:
          "El guardián ya corrigió este mensaje, pero el bot está dando vueltas: revisa el chat.",
        fuente: "guardian",
        // Alerta de panel: el aviso por WhatsApp se reserva para la doble señal
        // del detector, que es la que indica que el cliente está atascado AHORA.
        avisarAsesor: false,
      }).catch(() => undefined);
    }
    return revision;
  } catch (error) {
    console.warn("👼 Guardián falló abierto (se envía el borrador):", error instanceof Error ? error.message : error);
    if (activo) {
      await registrarFalloAbierto({
        conversation,
        borrador,
        model: config.openai.guardianModel,
        latencyMs: Date.now() - inicio,
        timeoutMs,
        error,
      });
    }
    return sinRevision;
  }
}

/**
 * La lista documentada de la semana: qué encontró, cuántas veces y dónde.
 * Es el insumo con el que se identifican causas y se arregla de raíz.
 */
export async function informeGuardian(dias: number): Promise<{
  desde: string;
  revisiones: number;
  correcciones: number;
  porCategoria: Array<{ categoria: string; severidad: string; veces: number }>;
  hallazgos: Array<{
    conversationId: number; fecha: string; veredicto: string;
    categoria: string; severidad: string; detalle: string;
  }>;
}> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const filas = await sql<{
    conversation_id: number; verdict: string; findings: unknown; created_at: Date;
  }[]>`
    select conversation_id, verdict, findings, created_at from guardian_reviews
    where created_at >= ${desde} order by created_at desc
  `;
  const hallazgos: Array<{ conversationId: number; fecha: string; veredicto: string; categoria: string; severidad: string; detalle: string }> = [];
  const conteo = new Map<string, number>();
  for (const fila of filas) {
    const lista = Array.isArray(fila.findings) ? fila.findings : [];
    for (const h of lista) {
      const parsed = HallazgoSchema.safeParse(h);
      if (!parsed.success) continue;
      hallazgos.push({
        conversationId: fila.conversation_id,
        fecha: fila.created_at.toISOString(),
        veredicto: fila.verdict,
        ...parsed.data,
      });
      const clave = `${parsed.data.categoria}|${parsed.data.severidad}`;
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
  }
  return {
    desde: desde.toISOString(),
    revisiones: filas.length,
    correcciones: filas.filter((f) => f.verdict === "corregir").length,
    porCategoria: [...conteo.entries()]
      .map(([clave, veces]) => {
        const [categoria, severidad] = clave.split("|");
        return { categoria, severidad, veces };
      })
      .sort((a, b) => b.veces - a.veces),
    hallazgos,
  };
}

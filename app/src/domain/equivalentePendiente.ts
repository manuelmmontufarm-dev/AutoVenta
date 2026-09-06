import { respuestaDePreferencia } from "./salesIntent.js";
/**
 * LA EQUIVALENTE SE OFRECE CON UNA PREGUNTA CLARA, Y LA COTIZACIÓN NO SE
 * ANUNCIA SI NO SALIÓ.
 *
 * Producción, 1-sep-2026, conv 13635 (205/65R16 sin stock exacto). El bot
 * recomendó la equivalente así:
 *
 *   «Como usted busca algo *bueno, bonito y barato*, la opción recomendada es
 *    *WINRUN R330* en *205/55R16*, si acepta esa equivalente.»
 *
 * Eso no es una pregunta. El cliente contestó «Ok» y el bot no supo a qué:
 * volvió a mandar opciones, volvió a preguntar el menú, y en dos turnos
 * escribió «Le preparo la cotización por 4 WINRUN R380… total $342.08» sin
 * que ninguna cotización existiera (tabla `quotes`: cero filas).
 *
 * Manuel: «las preguntas que hacen que la conversación siga siempre deberían
 * ir en otro mensaje… si haría la pregunta clara, la respuesta fuera clara».
 *
 * Dos piezas puras, sin base ni modelo:
 *
 *  1. `preguntaDeEquivalente` — la pregunta canónica de consentimiento. Dice
 *     «¿Le cotizo la X en MEDIDA?» y NUNCA «por 4»: el candado de preguntas
 *     prohibidas (`sinPreguntasProhibidas`) borra «¿…cotizo… por 4…?» porque
 *     pedir permiso para la cantidad es pedir la cantidad; «¿le cotizo…?» a
 *     secas es la única pregunta de permiso legítima (rúbrica del guardián,
 *     regla 15: una equivalente necesita consentimiento).
 *
 *  2. `sinCotizacionPrometida` — si el texto ANUNCIA una cotización («le
 *     preparo la cotización», «cotización por 4… total $342.08») y en este
 *     turno no salió ninguna, la promesa se quita y el turno cierra con la
 *     pregunta de consentimiento. Es el candado del final de la cadena: quien
 *     escribió la promesa fue el rescate del agente en un turno y el propio
 *     Ángel Guardián en el siguiente, así que ninguna regla de prompt alcanza.
 */

/** El mismo separador que parte el turno en mensajes (`splitBlocks`). */
const SEPARADOR = /\n\s*-{3,}\s*\n/;

export interface EquivalenteRecomendada {
  /** «WINRUN R380» — marca y diseño, como sale en la pieza. */
  recomendacion: string;
  /** «215/65R16» — la medida REAL de la recomendada, no la que pidió el cliente. */
  medida: string | null;
}

/**
 * «¿Le cotizo la *WINRUN R380* en *215/65R16*? 😊»
 *
 * Va sola en su propio mensaje (el que la compone la separa con '---'). Sin
 * cantidad a propósito: ver el encabezado.
 */
export function preguntaDeEquivalente(input: EquivalenteRecomendada): string {
  const medida = input.medida ? ` en *${input.medida}*` : "";
  return `¿Le cotizo la *${input.recomendacion}*${medida}? 😊`;
}

/**
 * ¿Este texto ANUNCIA una cotización como hecha o en camino?
 *
 * Solo las formas que se vieron salir de verdad: «le preparo/genero/armo/dejo/
 * paso/mando/envío la cotización», «cotización por 4 llantas… total $…», «aquí
 * le mando su cotización». Ofrecerla en pregunta («¿le cotizo…?») NO es
 * anunciarla, y por eso no entra.
 */
const ANUNCIA_COTIZACION = [
  // «Le preparo la cotización por 4…», «se la genero», «le mando la cotización».
  // Sin «armo/hago» ni «su cotización»: el saludo fijo dice «le armo su
  // cotización para tienda» y es una capacidad, no una promesa (simulador,
  // 1-sep: la primera versión le recortó al saludo la pregunta de la medida).
  /\b(?:le|se\s+la|se\s+las|te\s+la)\s+(?:preparo|genero|dejo|paso|mando|env[ií]o|adjunto)\s+(?:ya\s+|ahora\s+|enseguida\s+)?(?:la|una|esa|esta)\s+cotizaci[oó]n/i,
  /\b(?:aqu[ií]|ah[ií])\s+(?:le\s+)?(?:va|mando|dejo|env[ií]o|tiene)\s+(?:\w+\s+){0,2}cotizaci[oó]n/i,
  /\bcotizaci[oó]n\s+(?:formal\s+)?(?:por|de)\s+\*?\d+\s*\*?\s*(?:llantas?|unidades?|x|×|\*?[A-Z])/i,
  /\btotal\s+(?:por\s+)?(?:\d+\s+llantas?\s*)?:?\s*\*?\$\s*\d/i,
];

/**
 * Una OFERTA no es un anuncio: «Si desea, le dejo la cotización formal…»,
 * «¿Le preparo la cotización?», «puedo dejarle la cotización» proponen; lo
 * que este candado persigue es el «ya está / va en camino» sin herramienta.
 */
const ES_OFERTA = /\bsi\s+(?:desea|quiere|gusta|prefiere|le\s+parece)\b|\b(?:puedo|podemos|podr[ií]a|podr[ií]amos)\b|[¿?]/i;

const frasesDe = (texto: string): string[] =>
  texto.split(/(?<=[.!?])\s+|\n+/).map((f) => f.trim()).filter(Boolean);

export function anunciaCotizacion(texto: string): boolean {
  return frasesDe(texto).some(
    (frase) => !ES_OFERTA.test(frase) && ANUNCIA_COTIZACION.some((p) => p.test(frase)),
  );
}

/** La forma de la pieza de opciones que guarda `preparar_opciones` en el mensaje. */
export interface MetadataDePieza {
  recomendado?: string | null;
  escalones?: Partial<Record<"premium" | "equilibrada" | "economica", { codigo?: string | null } | null>> | null;
}

/**
 * QUÉ LLANTA VA EN LA PREGUNTA DE CONSENTIMIENTO (auditoría 2-6 sep, familia C).
 *
 * El candado `sin_cotizacion_prometida` reemplaza la promesa por «¿Le cotizo
 * la X?», y X salía de la recomendada guardada en la pieza. Pero si el cliente
 * ya contestó el menú, X es LA DE ESE ESCALÓN: a «Premium» se le contestó «¿Le
 * cotizo la KENDA KR20?» (la del medio, conv 15193) y a «Costo» «¿Le cotizo la
 * FALKEN WILDPEAK A/T 4W?» (la premium, conv 14577) — y esa se cotizó por
 * $833.92. Se mira la ÚLTIMA respuesta al menú después de la pieza; sin
 * ninguna, la recomendada; sin recomendada, la económica.
 */
export function productoDeConsentimiento(
  pieza: MetadataDePieza | null | undefined,
  respuestasDelCliente: readonly (string | null | undefined)[],
): string | null {
  const escalones = pieza?.escalones ?? null;
  for (let i = respuestasDelCliente.length - 1; i >= 0; i--) {
    const preferencia = respuestaDePreferencia(respuestasDelCliente[i] ?? "");
    if (!preferencia) continue;
    const nivel = preferencia === "precio" ? "economica" : preferencia;
    const codigo = escalones?.[nivel]?.codigo ?? null;
    if (codigo) return codigo;
  }
  return pieza?.recomendado ?? escalones?.economica?.codigo ?? null;
}

/**
 * UNA EQUIVALENTE NO SE FIRMA SIN SU SÍ (auditoría 2-6 sep, familia D, conv
 * 14687). El cliente pidió 215/50R17, el bot preguntó «¿Le muestro
 * alternativas disponibles en aro 17?», el cliente dijo «Ok» y salió una
 * cotización de 205/55R16 —aro 16— que nunca había visto. El «ok» aceptaba
 * VER alternativas, no comprar una. Para firmar una llanta de otra medida que
 * las que el cliente dio hace falta una de tres cosas: que la última pregunta
 * del bot haya sido «¿Le cotizo la X en MEDIDA?» nombrando ESA llanta, que el
 * cliente la nombre, o que nombre esa medida.
 */
export function equivalenteSinConsentimiento(input: {
  medidaProducto: string | null | undefined;
  nombreProducto: string;
  medidasDelCliente: readonly string[];
  ultimoMensajeDelBot: string | null | undefined;
  textoDelCliente: string;
  /**
   * Lo que el cliente escribió en ESTA visita, además del mensaje actual: «Me
   * gusta la Falken» dos turnos antes también es señalar esa llanta (conv
   * 4732, 26-ago, la equivalente declarada que sí se cotiza).
   */
  textosDelCliente?: readonly (string | null | undefined)[];
}): boolean {
  const pelar = (t: string) => t.toLowerCase().replace(/[\s\-/x×r]/g, "");
  const medida = input.medidaProducto ? pelar(input.medidaProducto) : "";
  if (!medida) return false;
  if (input.medidasDelCliente.some((m) => pelar(m) === medida)) return false;
  const dichoPorElCliente = [...(input.textosDelCliente ?? []), input.textoDelCliente]
    .map((t) => (t ?? "").toLowerCase())
    .join("\n");
  if (pelar(dichoPorElCliente).includes(medida)) return false;
  const palabras = input.nombreProducto.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  const diseno = palabras.at(-1) ?? "";
  const marca = palabras[0] ?? "";
  if (palabras.some((p) => dichoPorElCliente.includes(p))) return false;
  const cliente = (input.textoDelCliente ?? "").toLowerCase();
  if (diseno.length >= 3 && cliente.includes(diseno)) return false;
  if (marca.length >= 3 && cliente.includes(marca)) return false;
  const bot = (input.ultimoMensajeDelBot ?? "").toLowerCase();
  const preguntoPorEsta = /¿\s*(?:le|se\s+las?)\s+cotizo\s+las?\s+\*?([^*?]+?)\*?(?:\s+en\s+\*?([^*?]+?)\*?)?\s*\?/i.exec(bot);
  if (preguntoPorEsta) {
    const nombrada = preguntoPorEsta[1].trim().toLowerCase();
    const medidaNombrada = preguntoPorEsta[2] ? pelar(preguntoPorEsta[2]) : "";
    if (nombrada.includes(diseno) || (medidaNombrada && medidaNombrada === medida)) return false;
  }
  if (/¿\s*se\s+las?\s+cotizo\s*\?/i.test(bot) && bot.includes(diseno)) return false;
  return true;
}

export interface TextoSinPromesa {
  texto: string;
  /** true si hubo que quitar la promesa: para el log y la alerta, no para el cliente. */
  corregido: boolean;
}

/**
 * Quita del turno los bloques que anuncian una cotización que no existe y
 * cierra con la pregunta de consentimiento (si el turno no termina ya con una
 * pregunta propia). Un bloque se quita entero: la promesa suele venir con su
 * total y sus beneficios pegados, y recortar oraciones deja frases rotas.
 *
 * Si el turno queda vacío —todo era promesa—, se envía solo la pregunta.
 */
export function sinCotizacionPrometida(texto: string, pregunta: string): TextoSinPromesa {
  const bloques = texto.split(SEPARADOR).map((b) => b.trim()).filter(Boolean);
  const limpios = bloques.filter((b) => !anunciaCotizacion(b));
  if (limpios.length === bloques.length) return { texto, corregido: false };
  const ultimo = limpios.at(-1) ?? "";
  const yaPregunta = /¿[^?]*\?\s*(?:\S{0,3}\s*)?$/.test(ultimo);
  const finales = yaPregunta ? limpios : [...limpios, pregunta];
  return { texto: finales.join("\n---\n"), corregido: true };
}

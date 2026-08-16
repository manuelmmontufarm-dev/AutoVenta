/**
 * Detector barato de «el bot está dando vueltas».
 *
 * Es la red de respaldo, NO el juez: el juez es el Ángel Guardián, que lee la
 * conversación y entiende. Este solo compara texto, así que su único deber es
 * no molestar cuando la conversación está sana.
 *
 * Por qué se reescribió (15-ago-2026): con la versión anterior salieron 14
 * alertas en un solo día, casi todas sobre chats sanos — el guardián, con
 * juicio real, marcó 9 repeticiones en SIETE días. El caso que lo destapó fue
 * la conv 6467: el cliente confirmó «el lunes en Quito Sur», pidió la
 * ubicación, el bot respondió perfecto y saltó la alerta. Tres defectos
 * concretos, y los tres se arreglan aquí:
 *
 *  1. La similitud dividía por el mensaje MÁS CORTO. Una confirmación breve
 *     comparte casi todos sus tokens con el mensaje anterior, así que salía
 *     casi 1 siempre. Ahora es Jaccard (intersección / unión).
 *  2. No descontaba el vocabulario obligado del negocio: local, medida, marca,
 *     día, cotización. En 6467 esas palabras ERAN la conversación.
 *  3. Miraba solo al bot. Ahora hace falta DOBLE SEÑAL: o el bot lleva tres
 *     vueltas, o el bot repite y el cliente TAMBIÉN está repitiéndose. Un solo
 *     roce ya no basta.
 */
import { LOCATION_WORDS } from "./locations.js";

/** Ruido de cortesía: no dice nada sobre si la conversación avanza. */
const STOPWORDS = new Set([
  "para", "puedo", "puede", "necesito", "cliente", "mejor", "ayudarle", "ayudarte",
  "favor", "gracias", "hola", "buenas", "usted", "tiene", "tengo", "quiere",
  "estar", "esta", "este", "esto", "como", "pero", "porque", "sobre", "desde",
  "cuando", "donde", "aqui", "tambien", "ademas", "claro",
]);

/**
 * Vocabulario obligado del negocio. Que dos mensajes hablen de medidas, marcas,
 * locales y días no los hace repetidos: los hace mensajes de una llantera.
 */
const DOMAIN_WORDS = new Set<string>([
  ...LOCATION_WORDS,
  // Marcas y líneas que el catálogo repite en cada opción.
  "kenda", "sunoco", "eurolub", "falken", "giti", "aeolus", "michelin",
  "bridgestone", "goodyear", "pirelli", "hankook", "yokohama", "continental",
  "maxxis", "dunlop", "firestone", "nexen", "toyo", "sailun", "linglong",
  "triangle", "kumho", "westlake", "wildpeak", "klever", "ziex",
  // Días y momentos: la agenda de la visita se repite por definición.
  "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
  "manana", "tarde", "noche", "feriado", "fecha", "dias", "semana", "horario",
  "horarios", "abierto", "abrimos", "cerramos",
  // Piezas y datos duros del proceso de venta.
  "cotizacion", "cotizaciones", "cotizar", "cotizo", "cotizarle",
  "medida", "medidas", "marca", "marcas", "llanta", "llantas", "precio",
  "precios", "total", "unidad", "unidades", "juego", "modelo", "modelos",
  "opciones", "opcion", "garantia", "garantias", "seguro", "instalacion",
  "descuento", "incluye", "stock", "vehiculo", "carro", "aro", "rin",
]);

/** Confirmaciones y agradecimientos: el cliente está de acuerdo, no atascado. */
const AFIRMACION =
  /^\W*(?:s[ií]+|dale|ok+|okay|listo|perfecto|buenisimo|bueno|claro|gracias|de una|va|vale|correcto|exacto|por\s*favor|porfa|👍|🙏|👌)(?=$|\W)/i;

/** El bucle histórico de fitment: pedir la medida verificada una y otra vez. */
const FITMENT_LOOP = /(?:medida verificada|etiqueta de la puerta|version o motor|pa[ií]s.*fabricad)/i;

/** Umbral de Jaccard sobre el texto ya limpio de vocabulario del negocio. */
const UMBRAL = 0.65;

/** Umbral sobre el texto crudo: solo para atrapar el mensaje calcado. */
const UMBRAL_CALCADO = 0.85;

/**
 * Mensajes más cortos que esto son cortesía o confirmación.
 *
 * Se cuenta en PALABRAS del mensaje, no en tokens con contenido propio. Contar
 * tokens útiles parecía más fino y era justo lo contrario: como el filtro les
 * quita el vocabulario del negocio, «Para avanzar necesito el aro de su
 * vehículo» se queda en cuatro tokens y quedaba exento — o sea que la pregunta
 * que el bot repite tres veces, que es EL caso que hay que atrapar, nunca
 * podía disparar. Cortesía es un mensaje corto; que hable de llantas no lo
 * vuelve corto.
 */
const MINIMO_UTIL = 8;

function normalizar(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Todo lo que arranque con dígito: medidas, precios, números de cotización. */
function esNumero(word: string): boolean {
  return /^\d/.test(word);
}

/** Palabras con contenido, sin cortesía. Es lo que se compara «en crudo». */
function rawTokens(value: string): Set<string> {
  return new Set(
    normalizar(value).filter((word) => word.length > 3 && !esNumero(word) && !STOPWORDS.has(word)),
  );
}

/** Lo anterior menos el vocabulario obligado del negocio. */
export function usefulTokens(value: string): Set<string> {
  return new Set([...rawTokens(value)].filter((word) => !DOMAIN_WORDS.has(word)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const comunes = [...a].filter((word) => b.has(word)).length;
  return comunes / (a.size + b.size - comunes);
}

/**
 * Cuánto se parecen dos mensajes, de 0 a 1: Jaccard (intersección / unión).
 *
 * Antes se dividía por el conjunto más chico, que es lo que hacía que
 * «Claro, le confirmo» pareciera idéntico al párrafo anterior.
 */
export function replySimilarity(a: string, b: string): number {
  return jaccard(usefulTokens(a), usefulTokens(b));
}

/** Similares si comparten contenido propio, o si son prácticamente calcados. */
function sonSimilares(a: string, b: string): boolean {
  return replySimilarity(a, b) >= UMBRAL || jaccard(rawTokens(a), rawTokens(b)) >= UMBRAL_CALCADO;
}

export interface RepeticionDetectada {
  /** Qué regla disparó. Va en el motivo de la alerta. */
  regla: "bot_tres_vueltas" | "ambos_en_bucle" | "candado_fitment";
  /**
   * Doble señal: el bot lleva tres vueltas, o los DOS están dando vueltas.
   * Solo esto justifica sacar del bolsillo al asesor por WhatsApp; el candado
   * de fitment se queda en el panel.
   */
  doble: boolean;
}

/**
 * Analiza el borrador contra los últimos mensajes del bot y del cliente.
 *
 * @param candidate         Lo que el bot está por enviar.
 * @param previousBot       Últimos mensajes del bot, del más nuevo al más viejo.
 * @param lastClientMessages Últimos mensajes del cliente, del más nuevo al más viejo.
 */
export function analizarRepeticion(
  candidate: string,
  previousBot: readonly string[],
  lastClientMessages: readonly string[] = [],
): RepeticionDetectada | null {
  const anteriores = previousBot.filter((mensaje) => Boolean(mensaje?.trim())).slice(0, 3);
  if (anteriores.length < 2) return null;

  // Exención 1: un mensaje corto de cortesía o confirmación no es un bucle,
  // por mucho que comparta palabras con el anterior.
  if (normalizar(candidate).length <= MINIMO_UTIL) return null;

  // Exención 2 (el caso 6467): si el cliente acaba de decir que sí, que dale o
  // gracias, la conversación está avanzando. Repetir un dato que él acaba de
  // confirmar es lo correcto, no un atasco. Se pide además que el mensaje sea
  // corto: «gracias» es una confirmación, «gracias, pero eso ya se lo dije
  // tres veces» no lo es.
  const ultimoCliente = lastClientMessages.find((mensaje) => Boolean(mensaje?.trim()))?.trim();
  if (ultimoCliente && AFIRMACION.test(ultimoCliente) && rawTokens(ultimoCliente).size <= MINIMO_UTIL) {
    return null;
  }

  const similares = anteriores.filter((mensaje) => sonSimilares(candidate, mensaje)).length;

  // (a) El bot lleva tres vueltas sobre lo mismo.
  if (similares >= 2) return { regla: "bot_tres_vueltas", doble: true };

  // (b) El bot repite Y el cliente también: los dos están dando vueltas.
  if (similares >= 1 && clienteEnBucle(lastClientMessages)) {
    return { regla: "ambos_en_bucle", doble: true };
  }

  // (c) El candado viejo: el bucle de fitment se reconoce por su forma, aunque
  // el texto cambie. Se queda como red de respaldo, solo para el panel.
  if (FITMENT_LOOP.test(candidate) && anteriores.some((mensaje) => FITMENT_LOOP.test(mensaje))) {
    return { regla: "candado_fitment", doble: false };
  }

  return null;
}

/** El cliente repite su propio mensaje: señal de que no lo están entendiendo. */
function clienteEnBucle(lastClientMessages: readonly string[]): boolean {
  const [ultimo, previo] = lastClientMessages.filter((mensaje) => Boolean(mensaje?.trim()));
  if (!ultimo || !previo) return false;
  // Un «sí» seguido de otro «sí» no es un bucle: es un cliente de acuerdo.
  if (usefulTokens(ultimo).size < 3 || usefulTokens(previo).size < 3) return false;
  return sonSimilares(ultimo, previo);
}

/** Versión booleana, para quien solo necesita saber si hay que alertar. */
export function looksRepetitiveReply(
  candidate: string,
  previousBot: readonly string[],
  lastClientMessages: readonly string[] = [],
): boolean {
  return analizarRepeticion(candidate, previousBot, lastClientMessages) !== null;
}

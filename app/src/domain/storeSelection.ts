import { dondeEstaElCliente } from "./fueraDeCobertura.js";
import { negocio } from "../negocio/index.js";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * El nombre de un local del negocio, tal como se guarda en
 * `conversations.nearest_store`.
 *
 * Era una unión de los dos nombres de Depot. Ahora es `string` porque los
 * locales salen del perfil y no se conocen al compilar; lo que garantiza que
 * sea uno de verdad es que solo lo produce `extractExplicitStore` a partir de
 * `negocio.locales`.
 */
export type ExplicitStore = string;

/**
 * ¿Nuestro último mensaje puso los dos locales sobre la mesa?
 *
 * Es la señal que vuelve inequívoco un «al sur» suelto: si acabamos de
 * preguntar «¿Cumbayá o Quito Sur?», la respuesta se lee contra esa pregunta.
 * Espeja `preguntamosElDia` de customerCommitment — misma idea, otro dato.
 */
/**
 * La pregunta que cierra la cotización, nombrando los dos locales.
 *
 * Antes decía «¿A cuál de los dos le queda mejor ir?» y Manuel (27-ago) la vio
 * vaga: salía en un mensaje aparte de los links, así que «los dos» no señalaba
 * nada — el cliente tenía que subir a buscar de qué dos se hablaba. Nombrarlos
 * cuesta cuatro palabras y la deja contestable sola.
 *
 * Vive acá, en el dominio, porque la usan el que pregunta
 * (`buildStoreChoiceBlocks`), el que insiste (`insistirConLoQueFalta`) y el que
 * la reconoce (`preguntamosElLocal`): si se reescribe en un solo lado, el bot
 * deja de entender la respuesta del cliente.
 */
export const PREGUNTA_DE_LOCAL = armarPreguntaDeLocal();

/**
 * Los locales como alternativa y en negrita: «*Cumbayá* o *Quito Sur*».
 *
 * Es el trozo que varias frases de cierre pegaban a mano. Con un solo local
 * queda su nombre, y quien lo use tiene que decidir antes si preguntar el local
 * tiene sentido: `hayQueElegirLocal` responde eso.
 */
export const LOCALES_COMO_ALTERNATIVA = negocio.locales
  .map((local) => `*${local.nombreCorto}*`)
  .join(" o ");

/** ¿Hay más de un local, es decir, hay algo que preguntar? */
export const hayQueElegirLocal = negocio.locales.length >= 2;

function armarPreguntaDeLocal(): string {
  const nombres = negocio.locales.map((local) => `*${local.nombreCorto}*`);
  // Con un solo local no hay nada que preguntar y esta frase no debería salir
  // nunca; igual devuelve algo pronunciable, porque también se usa para
  // RECONOCER la pregunta y una cadena vacía casaría con cualquier mensaje.
  if (nombres.length < 2) return "¿A cuál local le queda mejor ir?";
  if (nombres.length === 2) return `¿A cuál local le queda mejor ir, ${nombres[0]} o ${nombres[1]}?`;
  return `¿A cuál local le queda mejor ir: ${nombres.slice(0, -1).join(", ")} o ${nombres[nombres.length - 1]}?`;
}

/**
 * ¿Este bloque PREGUNTA el local? Estricto, a diferencia de `preguntamosElLocal`.
 *
 * Los dos parecen lo mismo y no lo son. El laxo sirve para INTERPRETAR al
 * cliente: ahí pasarse es gratis —como mucho se entiende un «al sur» que ya era
 * obvio—. Este decide si se PINTAN BOTONES, y ahí pasarse cuesta: el mensaje
 * con los dos links de Google Maps nombra Cumbayá y Quito Sur sin preguntar
 * nada, y con el detector laxo se habría llevado dos botones debajo.
 *
 * Por eso exige la pregunta explícita y no se conforma con que los nombres
 * estén sobre la mesa.
 */
export function preguntaElLocal(bloque: string | null | undefined): boolean {
  if (!bloque) return false;
  const n = normalize(bloque).replace(/[*_]/g, "");
  if (bloque.includes("?")) {
    if (n.includes(normalize(PREGUNTA_DE_LOCAL).replace(/[*_]/g, ""))) return true;
    // LOS PATRONES SE BUSCAN DENTRO DE UN SEGMENTO QUE PREGUNTE, no en todo el
    // bloque. Producción, 31-ago 20:02: «eso sí tendría QUE revisarlo el asesor
    // en el LOCAL» —una afirmación— casó con «que … local», y el «?» del menú
    // de preferencia que venía más abajo dejó pasar el filtro. Resultado: el
    // menú «1) Costo 2) Equilibrio 3) Premium» salió con botones de Cumbayá y
    // Quito Sur. La pregunta y su pregunta tienen que vivir en la misma frase.
    const preguntas = n.split(/(?<=\?)|[\n]/).filter((seg) => seg.includes("?"));
    for (const seg of preguntas) {
      if (/\b(?:cual|que|donde|a cual)\b[^?]{0,60}\b(?:local|locales|sucursal|sucursales|tienda|tiendas)\b/.test(seg)) return true;
      if (/\b(?:local|sucursal|tienda)\b[^?]{0,40}\b(?:le queda|prefiere|le conviene|le sirve)\b/.test(seg)) return true;
    }
    // «¿Cumbayá o Quito Sur?» a secas TAMBIÉN pregunta el local, aunque no
    // diga la palabra. Visto en el lote del 29-ago (casos 35–37 y 44): el
    // modelo cerró así y este detector dijo que no había pregunta, con lo que
    // el candado del cierre la pegó otra vez y el cliente la vio dos veces
    // seguidas. Exige los dos nombres DENTRO del mismo segmento de pregunta
    // (cortado por puntuación o salto de línea): el mensaje de los mapas
    // nombra los dos locales en líneas sin «?», y no debe contar — este
    // detector también decide si se pintan botones.
    for (const segmento of n.split(/[.!\n]/)) {
      if (segmento.includes("?") && /\bcumbaya\b/.test(segmento) && /\bsur\b/.test(segmento)) return true;
    }
  }
  // Y la pregunta en imperativo, sin signos — misma razón que `preguntaElDia`.
  return /\b(?:digame|dime|me dice|me dices|indiqueme|confirmeme)\b[^.?!]{0,30}\b(?:a\s+)?(?:que|cual)\s+(?:local|sucursal|tienda)\b/.test(n);
}

export function preguntamosElLocal(ultimoMensajeNuestro: string | null | undefined): boolean {
  if (!ultimoMensajeNuestro) return false;
  const n = normalize(ultimoMensajeNuestro);
  // Los dos nombres sobre la mesa: la señal de siempre.
  if (n.includes("cumbaya") && n.includes("sur")) return true;
  // Y CUALQUIER forma de preguntarlo. El 27-ago el bot cerró su respuesta con
  // «¿A cuál local le queda mejor ir?» —sin nombrar las sucursales— y este
  // detector dijo que no había preguntado, así que el candado del cierre le
  // pegó la pregunta otra vez: el cliente la vio dos veces seguidas. Reconocer
  // solo la frase propia era reconocer al bot de ayer, no la intención.
  if (/\?/.test(n) && /\b(?:cual|que|donde|a cual)\b[^?]{0,60}\b(?:local|locales|sucursal|sucursales|tienda|tiendas)\b/.test(n)) return true;
  if (/\b(?:local|sucursal|tienda)\b[^?]{0,40}\b(?:le queda|prefiere|le conviene|le sirve)\b/.test(n)) return true;
  // Y la pregunta corta, que desde el 26-ago sale en un mensaje APARTE de los
  // links (Joaquín: «que no pregunte a cuál local en el mismo mensaje que las
  // ubicaciones, sino uno corto después»). Ese cambio dejó a esta función sin
  // los nombres a la vista en cuanto se envía cualquier otra cosa detrás: la
  // ventana son los últimos 3 salientes, y el mensaje de los links se cae de
  // ahí. Visto en el simulador el 27-ago: el cliente contestó «al de quito» y
  // no se registró ninguna sucursal, con el guardián marcando
  // `estado_desincronizado`. Quien hace la pregunta y quien la reconoce tienen
  // que hablar del mismo texto, así que la frase vive acá.
  return n.includes(normalize(PREGUNTA_DE_LOCAL));
}

/**
 * Solo acepta una elección inequívoca; "sur" suelto puede ser una ubicación.
 *
 * `respondiendoAlLocal` afloja esa exigencia: cuando el bot acaba de preguntar
 * a cuál local, «al sur me resulta más fácil» ES la elección — exigir que el
 * cliente pronuncie «Quito Sur» completo dejaba el dato sin registrar, y el
 * turno siguiente volvía a preguntar el local ya respondido (caso del 13-ago:
 * el cliente eligió el sur, el bot lo confirmó de palabra, y al registrar la
 * fecha la ruta directa re-preguntó «¿Cumbayá o Quito Sur?»).
 */
export function extractExplicitStore(
  text: string,
  opts?: { respondiendoAlLocal?: boolean },
): ExplicitStore | null {
  const value = normalize(text);
  // El patrón suelto de cada local (`comoLoNombranAlElegir`) solo entra cuando
  // el bot acaba de preguntar a cuál local Y el mensaje no está hablando de la
  // ciudad. Se calcula una vez: `hablaDeLaCiudad` lee la conversación entera.
  const vale = Boolean(opts?.respondiendoAlLocal) && !hablaDeLaCiudad(value);
  const nombrados = negocio.locales.filter(
    (local) =>
      local.comoLoNombran.test(value)
      || (vale && local.comoLoNombranAlElegir?.test(value)),
  );
  // NOMBRAR DOS NO ES ELEGIR. Con dos locales esto era `cumbaya === sur`: si
  // los dos calzaban —o ninguno— no había elección y se preguntaba. Con N vale
  // lo mismo, y es lo que evita registrar un local por un mensaje ambiguo.
  return nombrados.length === 1 ? nombrados[0].nombre : null;
}


/**
 * ¿El mensaje habla de la CIUDAD (dónde vive, cuándo sube) en vez de elegir
 * uno de los dos locales?
 *
 * Elegir es nombrar: «el de Quito», «al sur», «Cumbayá». Anunciar un viaje o
 * contar de dónde se es, no. Ver `domain/fueraDeCobertura.ts`, que hace la
 * lectura completa; acá solo hace falta el sí/no para no registrar una
 * elección que el cliente no hizo.
 */
function hablaDeLaCiudad(value: string): boolean {
  const donde = dondeEstaElCliente(value);
  if (donde && donde.estado !== "cobertura") return true;
  // «vivo en Quito», «soy de Quito norte»: está en cobertura, pero tampoco
  // eligió local.
  return /\b(?:viv|soy\s+de|estoy\s+en|somos\s+de|radico)\w*\b/.test(value);
}

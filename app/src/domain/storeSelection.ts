const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type ExplicitStore = "Depot Tire Cumbayá" | "Depot Tire Quito Sur";

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
export const PREGUNTA_DE_LOCAL = "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*?";

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
    if (/\b(?:cual|que|donde|a cual)\b[^?]{0,60}\b(?:local|locales|sucursal|sucursales|tienda|tiendas)\b/.test(n)) return true;
    if (/\b(?:local|sucursal|tienda)\b[^?]{0,40}\b(?:le queda|prefiere|le conviene|le sirve)\b/.test(n)) return true;
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
  const cumbaya = /\bcumbaya\b/.test(value);
  const sur =
    /\bquito\s+sur\b|\b(?:local|sucursal)\s+(?:(?:de|del)\s+)?(?:quito\s+)?sur\b|\bel\s+de\s+(?:quito\s+)?sur\b/.test(value) ||
    // «al de quito» ES Quito Sur cuando acabamos de ofrecerle los dos.
    //
    // Los locales se llaman «Cumbayá» y «Quito Sur», y el cliente contesta con
    // el nombre corto que los distingue: uno es «el de Cumbayá» y el otro «el
    // de Quito». Sin esto, «al de quito» devolvía null (visto en producción el
    // 27-ago, conv 3) y se caía TODO lo que cuelga de reconocer el local: la
    // ruta determinística no corría, así que el día se preguntaba sin el monto
    // del descuento, y sobre todo `nearest_store` no se guardaba — el guardián
    // lo marcó como `estado_desincronizado`, que es exactamente lo que pasa:
    // el asesor no se entera y el seguimiento le repregunta el local que ya dio.
    //
    // Solo con `respondiendoAlLocal`: fuera de esa pregunta, «estoy en Quito»
    // es dónde vive el cliente y no elige nada.
    (Boolean(opts?.respondiendoAlLocal) && /\b(?:sur|quito)\b/.test(value));
  if (cumbaya === sur) return null;
  return cumbaya ? "Depot Tire Cumbayá" : "Depot Tire Quito Sur";
}

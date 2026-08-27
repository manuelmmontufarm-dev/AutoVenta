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
export const PREGUNTA_DE_LOCAL = "¿A cuál de los dos le queda mejor ir?";

export function preguntamosElLocal(ultimoMensajeNuestro: string | null | undefined): boolean {
  if (!ultimoMensajeNuestro) return false;
  const n = normalize(ultimoMensajeNuestro);
  // Los dos nombres sobre la mesa: la señal de siempre.
  if (n.includes("cumbaya") && n.includes("sur")) return true;
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

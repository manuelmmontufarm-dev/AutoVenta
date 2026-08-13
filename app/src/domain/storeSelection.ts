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
export function preguntamosElLocal(ultimoMensajeNuestro: string | null | undefined): boolean {
  if (!ultimoMensajeNuestro) return false;
  const n = normalize(ultimoMensajeNuestro);
  return n.includes("cumbaya") && n.includes("sur");
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
    (Boolean(opts?.respondiendoAlLocal) && /\bsur\b/.test(value));
  if (cumbaya === sur) return null;
  return cumbaya ? "Depot Tire Cumbayá" : "Depot Tire Quito Sur";
}

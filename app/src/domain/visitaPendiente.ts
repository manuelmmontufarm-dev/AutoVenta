/**
 * ¿Falta registrar el día de la visita?
 *
 * El local y el día son dos datos distintos (26-ago): preguntarlos juntos hacía
 * que el cliente contestara solo uno. Pero cuando el local YA está en
 * `nearest_store` y `visit_date` sigue vacío, el cierre comercial no terminó —
 * aunque el cliente diga «Gracias» o repita el local (conv 13909, Oswaldo, 1-sep).
 */
export function visitaPendiente(hechos: {
  nearest_store?: string | null;
  visit_date?: Date | null;
}): boolean {
  return Boolean(hechos.nearest_store) && !hechos.visit_date;
}

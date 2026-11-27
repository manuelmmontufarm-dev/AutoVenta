import { preguntamosElDia } from "./customerCommitment.js";

/**
 * LA PREGUNTA DEL DÍA CIERRA EL TURNO (F-06, revisión final; chat 1790). A
 * «¿Qué día cree que puede ir?» el cliente preguntó por el descuento; el turno
 * contestó los precios y cerró con «¿Se la cotizo?» (ya estaba cotizada) o sin
 * pregunta, y el día quedó en el aire. Si el turno ya cierra preguntando el
 * día, no se toca; si cierra con OTRA pregunta, esa pregunta final se cambia
 * por la del día; si no pregunta nada, la del día va en su propio mensaje.
 */
export function conLaPreguntaDelDia(texto: string, preguntaDelDia: string): string {
  const bloques = texto.split(/\n---\n/);
  const ultimo = bloques[bloques.length - 1] ?? "";
  if (preguntamosElDia(ultimo.match(/¿[^¿]*\?\s*\S{0,3}\s*$/u)?.[0] ?? null) && /\?\s*\S{0,3}\s*$/u.test(ultimo.trim())) return texto;
  const sinPreguntaFinal = ultimo.replace(/\s*¿[^¿]*\?\s*\S{0,3}\s*$/u, "").trim();
  const resto = [...bloques.slice(0, -1), ...(sinPreguntaFinal ? [sinPreguntaFinal] : [])];
  return [...resto, preguntaDelDia].join("\n---\n");
}

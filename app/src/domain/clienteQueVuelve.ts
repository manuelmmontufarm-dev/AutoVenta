/**
 * ¿EL CLIENTE YA NOS CONOCE? (simulador Competimotor, 18-nov, CM31.)
 *
 * «ya compré, gracias» cierra el ciclo; minutos después «buenas, ahora necesito
 * 4 de 265 70 16 pa la camioneta» abre uno nuevo y el bot se volvía a presentar
 * completo («¡Hola! 👋 Soy el asistente de Competimotor…») a alguien con quien
 * acababa de hablar. La presentación miraba solo el ciclo actual
 * (`lastOutboundText`), y en un ciclo nuevo eso siempre está vacío. Ninguna regla
 * aprobada pide re-presentarse: la de Manuel del 31-ago es «al abrirse la
 * conversación».
 *
 * La regla del 31-ago SÍ pide presentarse otra vez cuando la conversación
 * empieza de nuevo de verdad: tras un `/restart` (su aviso es la despedida del
 * ciclo que se archiva) o tras el silencio largo (producción, conv 3, ciclos 36
 * y 37). Por eso cuenta el último saliente de los ciclos ANTERIORES solo si cae
 * dentro de la MISMA VISITA: el mismo corte de 12 h con el que el ciclo nuevo
 * conserva la ficha (`esMismaVisitaPorSilencio`, domain/medidaPedida.ts).
 */
import { MENSAJE_DE_REINICIO } from "./reinicio.js";
import { esMismaVisitaPorSilencio } from "./medidaPedida.js";

export function esClienteQueVuelve(
  ultimoSalienteDeOtroCiclo: { content: string | null; created_at: Date | string } | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!ultimoSalienteDeOtroCiclo) return false;
  if ((ultimoSalienteDeOtroCiclo.content ?? "").trim() === MENSAJE_DE_REINICIO.trim()) return false;
  return esMismaVisitaPorSilencio(ultimoSalienteDeOtroCiclo.created_at, ahora);
}

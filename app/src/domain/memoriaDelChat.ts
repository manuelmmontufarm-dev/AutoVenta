/**
 * La memoria del bot en un chat caduca con el silencio.
 *
 * 31-ago-2026: un cliente volvió a escribir «hola» días después de su última
 * compra y el bot, con el historial y la ficha del ciclo viejo todavía a la
 * vista, arrancó con la guía de medidas en vez de saludar. Quien vuelve a
 * escribir después de tanto tiempo casi siempre viene POR OTRA COSA: la
 * conversación anterior no dice nada sobre esta.
 *
 * Quince horas es el corte que pidió Depot. Es más ancho que las 12 h de
 * `esMismaVisitaPorSilencio` (que decide si se CONSERVA la ficha al reabrir un
 * cierre) a propósito: cotizar en la noche y confirmar a la mañana siguiente
 * sigue siendo la misma compra, y los seguimientos automáticos refrescan el
 * reloj porque también son mensajes del bot.
 *
 * Se mide contra el último mensaje DE CUALQUIERA DE LOS DOS LADOS: si el bot
 * hizo un seguimiento hace 2 horas y el cliente contesta «sí», eso NO es un
 * chat frío, aunque el cliente llevara días callado.
 */
import { esMismaVisitaPorSilencio } from "./medidaPedida.js";

export const HORAS_DE_MEMORIA_DEL_CHAT = 15;

/** ¿Pasaron más de 15 h sin que NADIE escribiera? Un chat sin mensajes no tiene nada que olvidar. */
export function memoriaDelChatVencida(
  lastCustomerMessageAt: Date | string | null | undefined,
  lastAssistantMessageAt: Date | string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  const marcas = [lastCustomerMessageAt, lastAssistantMessageAt].filter(
    (m): m is Date | string => m != null,
  );
  if (!marcas.length) return false;
  return !marcas.some((m) => esMismaVisitaPorSilencio(m, ahora, HORAS_DE_MEMORIA_DEL_CHAT));
}

/**
 * El aviso al asesor cuando el cliente decide comprar a distancia (paga por
 * transferencia y quiere envío). Ver `domain/compraADistancia.ts`.
 *
 * Usa la MISMA clave que `notificar_vendedor(compra)`: si además el modelo
 * llama a la herramienta en ese turno, las dos terminan en una sola alerta y un
 * solo aviso por WhatsApp, no en dos.
 */
import { createBotAlert } from "./followUps.js";
import { notifyAdvisor } from "./advisorNotifications.js";

export async function avisarCompraADistancia(
  conversation: { id: number; current_cycle: number },
  textoDelCliente: string,
): Promise<void> {
  const dedupeKey = `${conversation.id}:${conversation.current_cycle}:customer_ready_to_buy`;
  const resumen = `Quiere comprar a distancia: «${textoDelCliente.slice(0, 200)}»`;
  await createBotAlert({
    conversationId: conversation.id,
    cycle: conversation.current_cycle,
    type: "customer_ready_to_buy",
    priority: "high",
    summary: resumen,
    exactReason: "El cliente quiere pagar sin pasar por el local y que le envíen las llantas. El bot no cobra ni confirma pagos.",
    suggestedAction: "Mandarle los datos para la transferencia y coordinar el envío o la entrega. No le preguntes qué día pasa.",
    dedupeKey,
  });
  await notifyAdvisor({
    conversationId: conversation.id,
    cycle: conversation.current_cycle,
    eventType: "customer_ready_to_buy",
    dedupeKey,
    title: "Quiere comprar a distancia",
    reason: resumen,
    action: "Mandarle los datos para la transferencia y coordinar el envío.",
  });
}

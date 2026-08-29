import { runAgent } from "../agent/agent.js";
import type { AgentContext } from "../agent/tools.js";
import { classifyStage } from "../agent/classifier.js";
import { sql } from "../db/client.js";
import { sendCustomerText } from "../wa/client.js";
import { isBotActive } from "./botPower.js";
import { appendMessage, type Conversation } from "./conversations.js";
import { markDiscountNoticeSent } from "./discountOffers.js";
import { prepararSalida } from "./prepararSalida.js";
import { createBotAlert, scheduleConversationFollowUps } from "./followUps.js";
import { emitLiveEvent } from "./liveEvents.js";
import { authorizeConversationOutbound } from "./whatsappPolicy.js";
import { hasUnansweredCustomerMessage } from "../domain/conversationState.js";
import { flagRepetitiveConversation } from "./conversationQuality.js";

export type ResumeBotResult =
  | "answered"
  | "nothing_pending"
  | "window_closed"
  | "already_processing"
  | "bot_off";

/** Responde el último inbound que quedó huérfano mientras atendía un humano. */
export async function resumeBotIfUnanswered(conversationId: number): Promise<ResumeBotResult> {
  // Interruptor global, antes de reclamar nada: devolver el chat al bot no
  // puede saltarse el apagado. Sin esto, el panel decía "apagado" y aun así
  // salía un mensaje a un cliente real — la fuga más cara posible, porque pasa
  // justo cuando alguien está probando el producto sin querer publicarlo.
  if (!(await isBotActive())) return "bot_off";

  const [claimed] = await sql<{
    id: number; phone: string; name: string | null; stage: Conversation["stage"];
    bot_paused_until: Date | null; status: Conversation["status"]; current_cycle: number;
    last_customer_message_at: Date; last_assistant_message_at: Date | null;
    last_text: string;
  }[]>`
    with candidate as (
      select c.id,
        (select content from messages where conversation_id=c.id and cycle=c.current_cycle
          and direction='inbound' order by created_at desc, id desc limit 1) as last_text
      from conversations c
      where c.id=${conversationId} and c.status='open' and c.assigned_to='bot'
        and c.bot_resume_in_progress=false and c.last_customer_message_at is not null
        and (c.last_assistant_message_at is null or c.last_assistant_message_at < c.last_customer_message_at)
      for update skip locked
    )
    update conversations c set bot_resume_in_progress=true, updated_at=now()
    from candidate
    where c.id=candidate.id
    returning c.id, c.phone, c.name, c.stage, c.bot_paused_until, c.status,
      c.current_cycle, c.last_customer_message_at, c.last_assistant_message_at,
      candidate.last_text
  `;
  if (!claimed) {
    const [state] = await sql<{ bot_resume_in_progress: boolean }[]>`
      select bot_resume_in_progress from conversations where id=${conversationId}
    `;
    return state?.bot_resume_in_progress ? "already_processing" : "nothing_pending";
  }

  if (!hasUnansweredCustomerMessage(claimed.last_customer_message_at, claimed.last_assistant_message_at)) {
    await sql`update conversations set bot_resume_in_progress=false where id=${conversationId}`;
    return "nothing_pending";
  }

  try {
    const policy = await authorizeConversationOutbound({
      conversationId, contentType: "text", actor: "bot",
    });
    if (!policy.allowed) {
      await createBotAlert({
        conversationId, cycle: claimed.current_cycle, type: "template_required",
        priority: "high", summary: "El bot recibió una conversación pendiente fuera de ventana",
        exactReason: "El último mensaje del cliente quedó sin respuesta, pero ya no se permite texto libre.",
        suggestedAction: "Revisar y continuar únicamente con una plantilla aprobada.",
        dedupeKey: `${conversationId}:${claimed.current_cycle}:resume_template_required`,
      });
      await scheduleConversationFollowUps(conversationId);
      return "window_closed";
    }

    const conversation: Conversation = {
      id: Number(claimed.id), phone: claimed.phone, name: claimed.name,
      stage: claimed.stage, bot_paused_until: null, status: claimed.status,
      current_cycle: claimed.current_cycle,
    };
    const ctx: AgentContext = {
      conversation, customerPhone: claimed.phone, customerName: claimed.name ?? undefined,
      currentUserText: claimed.last_text, resumedFromHuman: true,
    };
    const reply = await runAgent(ctx, claimed.last_text);
    await flagRepetitiveConversation(conversationId, reply);
    // LA MISMA CADENA QUE EL CAMINO NORMAL, no un pedazo de ella.
    //
    // Hasta hoy aquí corría un solo candado —`applyOutboundGuard`— de los ocho
    // del turno normal. Y esta puerta llama al MISMO `runAgent` con las MISMAS
    // herramientas: la fuga del JSON crudo que se tapó el 27-ago en `index.ts`
    // seguía viva por aquí, y el aviso de stock corto no salía nunca. Ver
    // services/prepararSalida.ts.
    const salida = await prepararSalida(reply, {
      conversation, tipo: "retomada", huella: ctx.toolTrace ?? [], faseOperativa: ctx.faseOperativa,
      textoDelCliente: claimed.last_text,
    });
    // Un candado bloqueó el envío (duplicado/atascado): ya alertó al asesor y
    // para el que llama esto equivale a que no había nada seguro que responder.
    if (!salida.texto) return "nothing_pending";
    const providerId = await sendCustomerText(conversationId, claimed.phone, salida.texto);
    await appendMessage(conversationId, "assistant", salida.texto, providerId, {
      authorKind: "bot", status: "sent", metadata: { resumedAfterHuman: true },
    });
    if (ctx.discountNotice) {
      await markDiscountNoticeSent(ctx.discountNotice.source, ctx.discountNotice.id);
    }
    await classifyStage(conversation, claimed.last_text, reply);
    await scheduleConversationFollowUps(conversationId);
    emitLiveEvent("message", conversationId);
    emitLiveEvent("sync", conversationId);
    return "answered";
  } finally {
    await sql`update conversations set bot_resume_in_progress=false where id=${conversationId}`;
  }
}

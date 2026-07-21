import { runAgent } from "../agent/agent.js";
import type { AgentContext } from "../agent/tools.js";
import { classifyStage } from "../agent/classifier.js";
import { sql } from "../db/client.js";
import { sendCustomerText } from "../wa/client.js";
import { appendMessage, type Conversation } from "./conversations.js";
import { markDiscountNoticeSent } from "./discountOffers.js";
import { createBotAlert, scheduleConversationFollowUps } from "./followUps.js";
import { emitLiveEvent } from "./liveEvents.js";
import { authorizeConversationOutbound } from "./whatsappPolicy.js";
import { hasUnansweredCustomerMessage } from "../domain/conversationState.js";
import { flagRepetitiveConversation } from "./conversationQuality.js";

export type ResumeBotResult = "answered" | "nothing_pending" | "window_closed" | "already_processing";

/** Responde el último inbound que quedó huérfano mientras atendía un humano. */
export async function resumeBotIfUnanswered(conversationId: number): Promise<ResumeBotResult> {
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
    const providerId = await sendCustomerText(conversationId, claimed.phone, reply);
    await appendMessage(conversationId, "assistant", reply, providerId, {
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

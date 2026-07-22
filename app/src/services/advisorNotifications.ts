import { config } from "../config.js";
import { sql } from "../db/client.js";
import { sendAdvisorText } from "../wa/client.js";
import { emitLiveEvent } from "./liveEvents.js";

export type AdvisorEventType =
  | "human_requested"
  | "quote_created"
  | "customer_ready_to_buy"
  | "negative_sentiment"
  | "customer_opt_out"
  | "repetitive_conversation"
  | "send_error";

export interface AdvisorNotificationInput {
  conversationId: number;
  cycle: number;
  eventType: AdvisorEventType;
  dedupeKey: string;
  title: string;
  reason: string;
  action: string;
  details?: string[];
}

export function buildAdvisorMessage(input: AdvisorNotificationInput & {
  customer: string;
  phone: string;
}): string {
  const link = `${config.hub.publicUrl}/#/ticket/${input.conversationId}`;
  return [
    `🚨 *${input.title}*`,
    `👤 ${input.customer}`,
    `📱 ${input.phone}`,
    ...((input.details ?? []).filter(Boolean)),
    `💬 ${input.reason}`,
    `👉 ${input.action}`,
    `🔗 ${link}`,
  ].join("\n");
}

/**
 * Envía una sola vez por evento lógico. Si Meta falla, el error queda visible
 * en Alertas del bot y un segundo procesamiento puede reintentar hasta 3 veces.
 */
export async function notifyAdvisor(input: AdvisorNotificationInput): Promise<{
  sent: boolean;
  skipped: boolean;
  error?: string;
}> {
  const [conversation] = await sql<{ name: string | null; phone: string }[]>`
    select name, phone from conversations where id=${input.conversationId}
  `;
  if (!conversation) return { sent: false, skipped: true, error: "Conversación no encontrada" };
  const message = buildAdvisorMessage({
    ...input,
    customer: conversation.name ?? conversation.phone,
    phone: conversation.phone,
  });

  const [created] = await sql<{ id: number }[]>`
    insert into advisor_notifications (
      conversation_id, cycle, event_type, dedupe_key, recipient_name,
      recipient_phone, message, status
    ) values (
      ${input.conversationId}, ${input.cycle}, ${input.eventType}, ${input.dedupeKey},
      ${config.whatsapp.sellerName}, ${config.whatsapp.sellerPhone}, ${message}, 'queued'
    ) on conflict (dedupe_key) do nothing returning id
  `;
  let notificationId = created ? Number(created.id) : null;
  if (!notificationId) {
    const [retry] = await sql<{ id: number }[]>`
      update advisor_notifications set status='queued', updated_at=now()
      where dedupe_key=${input.dedupeKey} and status='failed' and attempt_count < 3
      returning id
    `;
    notificationId = retry ? Number(retry.id) : null;
  }
  if (!notificationId) return { sent: false, skipped: true };

  try {
    const providerId = await sendAdvisorText(message);
    await sql`
      update advisor_notifications set status='sent', attempt_count=attempt_count+1,
        provider_message_id=${providerId ?? null}, error=null, sent_at=now(), updated_at=now()
      where id=${notificationId}
    `;
    await sql`
      update bot_alerts set status='resolved', resolved_at=now()
      where dedupe_key=${`${input.dedupeKey}:delivery_failed`}
        and status in ('open','snoozed')
    `;
    emitLiveEvent("sync", input.conversationId);
    return { sent: true, skipped: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await sql.begin(async (tx) => {
      await tx`
        update advisor_notifications set status='failed', attempt_count=attempt_count+1,
          error=${reason.slice(0, 1000)}, updated_at=now() where id=${notificationId}
      `;
      await tx`
        insert into bot_alerts (
          conversation_id, cycle, type, priority, summary, exact_reason,
          suggested_action, dedupe_key
        ) values (
          ${input.conversationId}, ${input.cycle}, 'advisor_notification_failed', 'high',
          'No se pudo avisar al asesor por WhatsApp', ${reason.slice(0, 500)},
          'Manuel debe abrir el ticket desde el Hub; verificar su ventana o una plantilla aprobada para alertas.',
          ${`${input.dedupeKey}:delivery_failed`}
        ) on conflict do nothing
      `;
    });
    emitLiveEvent("alert", input.conversationId, {
      icon: "⚠️",
      title: "Aviso al asesor bloqueado",
      body: `${conversation.name ?? conversation.phone} · revisa Alertas del bot`,
    });
    console.error(`⚠️ No se pudo notificar a ${config.whatsapp.sellerName}:`, reason);
    return { sent: false, skipped: false, error: reason };
  }
}

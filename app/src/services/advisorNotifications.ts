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
  | "send_error"
  // Guardián de salida (5-ago): el envío se bloqueó y alguien debe saberlo.
  | "guard_bot_atascado"
  | "guard_pide_foto"
  | "guard_mensaje_duplicado"
  | "guard_saludo_repetido"
  // Watchdog (6-ago): el bot quedó apagado y los clientes siguieron escribiendo.
  | "bot_apagado_con_clientes";

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
export interface Asesor {
  nombre: string;
  telefono: string;
}

/**
 * Asesores que reciben los avisos, en orden de prioridad.
 *
 * Si la tabla no se puede leer (por ejemplo antes de que corra la migración),
 * cae al asesor del entorno: un aviso que no sale es una venta que nadie
 * atiende, y ese respaldo ya funcionaba.
 */
export async function asesoresActivos(): Promise<Asesor[]> {
  try {
    const filas = await sql<{ nombre: string; telefono: string }[]>`
      select nombre, telefono from advisors
      where active and telefono <> '' order by prioridad, id
    `;
    if (filas.length) return filas;
  } catch (error) {
    console.error("⚠️ No se pudo leer la tabla de asesores:", error);
  }
  const respaldo = config.whatsapp.sellerPhone;
  return respaldo ? [{ nombre: config.whatsapp.sellerName, telefono: respaldo }] : [];
}

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

  // Un aviso por asesor activo. Antes salía a uno solo, fijado por entorno.
  const destinatarios = await asesoresActivos();
  if (!destinatarios.length) {
    return { sent: false, skipped: true, error: "No hay asesores activos configurados" };
  }
  const creadas = await sql<{ id: number; recipient_phone: string; recipient_name: string }[]>`
    insert into advisor_notifications (
      conversation_id, cycle, event_type, dedupe_key, recipient_name,
      recipient_phone, message, status
    )
    select
      ${input.conversationId}, ${input.cycle}, ${input.eventType}, ${input.dedupeKey},
      d.nombre, d.telefono, ${message}, 'queued'
    from (values ${sql(destinatarios.map((a) => [a.nombre, a.telefono]))}) as d(nombre, telefono)
    on conflict (dedupe_key, recipient_phone) do nothing
    returning id, recipient_phone, recipient_name
  `;
  let pendientes = creadas;
  if (!pendientes.length) {
    // Reintento de las que fallaron antes, una por asesor.
    pendientes = await sql<{ id: number; recipient_phone: string; recipient_name: string }[]>`
      update advisor_notifications set status='queued', updated_at=now()
      where dedupe_key=${input.dedupeKey} and status='failed' and attempt_count < 3
      returning id, recipient_phone, recipient_name
    `;
  }
  if (!pendientes.length) return { sent: false, skipped: true };

  // Cada asesor se cobra aparte: que a uno le falle no puede dejar sin aviso a
  // los demás. Basta con que salga uno para considerarlo entregado.
  let algunoSalio = false;
  let ultimoError: string | undefined;
  for (const destino of pendientes) {
  try {
    const providerId = await sendAdvisorText(message, destino.recipient_phone);
    await sql`
      update advisor_notifications set status='sent', attempt_count=attempt_count+1,
        provider_message_id=${providerId ?? null}, error=null, sent_at=now(), updated_at=now()
      where id=${destino.id}
    `;
    algunoSalio = true;
    continue;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    ultimoError = reason;
    await sql.begin(async (tx) => {
      await tx`
        update advisor_notifications set status='failed', attempt_count=attempt_count+1,
          error=${reason.slice(0, 1000)}, updated_at=now() where id=${destino.id}
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
    console.error(`⚠️ No se pudo notificar a ${destino.recipient_name}:`, reason);
  }
  }

  if (algunoSalio) {
    await sql`
      update bot_alerts set status='resolved', resolved_at=now()
      where dedupe_key=${`${input.dedupeKey}:delivery_failed`}
        and status in ('open','snoozed')
    `;
    emitLiveEvent("sync", input.conversationId);
    return { sent: true, skipped: false };
  }
  return { sent: false, skipped: false, error: ultimoError };
}

/** Recupera solicitudes humanas abiertas creadas antes de un reinicio/deploy. */
export async function notifyPendingHumanRequests(limit = 20): Promise<number> {
  const pending = await sql<{
    conversation_id: number;
    cycle: number;
    exact_reason: string;
  }[]>`
    select a.conversation_id, a.cycle, a.exact_reason
    from bot_alerts a
    join conversations c on c.id=a.conversation_id and c.current_cycle=a.cycle
    where a.type='human_requested' and a.status in ('open','snoozed')
      and c.status='open' and c.assigned_to='human'
      and not exists (
        select 1 from advisor_notifications n
        where n.dedupe_key=(a.conversation_id || ':' || a.cycle || ':human_requested')
          and n.status in ('queued','sent')
      )
    order by a.created_at asc
    limit ${limit}
  `;
  let sent = 0;
  for (const row of pending) {
    const delivery = await notifyAdvisor({
      conversationId: Number(row.conversation_id),
      cycle: row.cycle,
      eventType: "human_requested",
      dedupeKey: `${row.conversation_id}:${row.cycle}:human_requested`,
      title: "Cliente pidió hablar con un asesor",
      reason: `Mensaje del cliente: “${row.exact_reason.slice(0, 300)}”`,
      action: "Abrir el ticket y responder personalmente dentro de la ventana de 24 horas.",
    });
    if (delivery.sent) sent += 1;
  }
  return sent;
}

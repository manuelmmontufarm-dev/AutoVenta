import { sql } from "../db/client.js";
import { config } from "../config.js";

export type Stage = "nuevo" | "conversando" | "cotizado" | "alerta" | "cerrado" | "perdido";

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  stage: Stage;
  bot_paused_until: Date | null;
}

export async function getOrCreateConversation(
  phone: string,
  name?: string,
): Promise<Conversation> {
  const [row] = await sql<Conversation[]>`
    insert into conversations (phone, name)
    values (${phone}, ${name ?? null})
    on conflict (phone) do update
      set name = coalesce(conversations.name, excluded.name),
          updated_at = now()
    returning id, phone, name, stage, bot_paused_until
  `;
  return row;
}

/**
 * Guarda un mensaje. Devuelve false si el wa_message_id ya existía
 * (webhook duplicado de Meta → el llamador debe abortar el procesamiento).
 */
export async function appendMessage(
  conversationId: number,
  role: "user" | "assistant" | "system",
  content: string,
  waMessageId?: string,
): Promise<boolean> {
  const rows = await sql`
    insert into messages (conversation_id, role, content, wa_message_id)
    values (${conversationId}, ${role}, ${content}, ${waMessageId ?? null})
    on conflict (wa_message_id) do nothing
    returning id
  `;
  return rows.length > 0;
}

/** Historial reciente en el formato que espera el agente (solo texto). */
export async function getHistory(
  conversationId: number,
  limit = 30,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await sql<{ role: "user" | "assistant"; content: string }[]>`
    select role, content from (
      select role, content, created_at
      from messages
      where conversation_id = ${conversationId} and role in ('user', 'assistant')
      order by created_at desc
      limit ${limit}
    ) recent
    order by created_at asc
  `;
  return rows;
}

export async function setStage(conversationId: number, stage: Stage): Promise<void> {
  await sql`
    update conversations set stage = ${stage}, updated_at = now()
    where id = ${conversationId}
  `;
  await sql`
    insert into funnel_events (conversation_id, type, data)
    values (${conversationId}, 'etapa', ${sql.json({ stage })})
  `;
}

/** Handoff: silencia el bot en este chat (ej. cuando el dueño responde a mano). */
export async function pauseBot(conversationId: number, hours = config.pipeline.botPauseHours) {
  await sql`
    update conversations
    set bot_paused_until = now() + make_interval(hours => ${hours})
    where id = ${conversationId}
  `;
}

export async function isBotPaused(conversation: Conversation): Promise<boolean> {
  if (!conversation.bot_paused_until) return false;
  return new Date(conversation.bot_paused_until) > new Date();
}

export async function logQuote(
  conversationId: number,
  items: unknown,
  subtotal: number,
  tax: number,
  total: number,
): Promise<void> {
  await sql`
    insert into quotes (conversation_id, items, subtotal, tax, total)
    values (${conversationId}, ${sql.json(items as never)}, ${subtotal}, ${tax}, ${total})
  `;
  await sql`
    insert into funnel_events (conversation_id, type, data)
    values (${conversationId}, 'cotizacion', ${sql.json({ total })})
  `;
}

export async function logFunnelEvent(
  conversationId: number,
  type: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await sql`
    insert into funnel_events (conversation_id, type, data)
    values (${conversationId}, ${type}, ${data ? sql.json(data as never) : null})
  `;
}

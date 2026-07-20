import { sql } from "../db/client.js";
import { config } from "../config.js";
import { isStage, type Stage } from "../domain/pipeline.js";

export type { Stage } from "../domain/pipeline.js";

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  stage: Stage;
  bot_paused_until: Date | null;
  status: "open" | "closed";
  current_cycle: number;
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
    returning id, phone, name, stage, bot_paused_until, status, current_cycle
  `;
  if (row.status === "closed") {
    return reopenConversation(row.id, "customer", "Nuevo mensaje después de un cierre");
  }
  return row;
}

export async function reopenConversation(
  conversationId: number,
  actor: "customer" | "bot" | "owner" | "system" = "system",
  reason = "Nueva oportunidad comercial",
): Promise<Conversation> {
  await sql`
    insert into sales_history (
      conversation_id, cycle, outcome, reason, tire_size, vehicle,
      selected_product_code, selected_quantity, quote_id, quote_number,
      sale_number, total, closed_at
    )
    select
      c.id, c.current_cycle,
      case when c.stage = 'ganado' then 'ganado' else 'perdido' end,
      c.closed_reason, c.tire_size, c.vehicle,
      c.selected_product_code, c.selected_quantity,
      q.id, q.quote_number, q.sale_number, q.total, coalesce(c.closed_at, now())
    from conversations c
    left join lateral (
      select id, quote_number, sale_number, total from quotes
      where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc limit 1
    ) q on true
    where c.id = ${conversationId} and c.status = 'closed'
    on conflict (conversation_id, cycle) do nothing
  `;
  const [row] = await sql<Conversation[]>`
    update conversations
    set current_cycle = current_cycle + 1,
        stage = 'nuevo', status = 'open', assigned_to = 'bot',
        bot_paused_until = null, tire_size = null, vehicle = null,
        selected_product_code = null, selected_quantity = null,
        location_label = null, nearest_store = null,
        closed_reason = null, closed_at = null, updated_at = now()
    where id = ${conversationId}
    returning id, phone, name, stage, bot_paused_until, status, current_cycle
  `;
  if (!row) throw new Error(`Conversación ${conversationId} no existe`);
  await sql`
    insert into funnel_events (conversation_id, cycle, type, data)
    values (${conversationId}, ${row.current_cycle}, 'reapertura', ${sql.json({ actor, reason })})
  `;
  await sql`
    insert into stage_transitions (conversation_id, cycle, from_stage, to_stage, actor, reason)
    values (${conversationId}, ${row.current_cycle}, null, 'nuevo', ${actor}, ${reason})
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
  options: {
    type?: "text" | "pdf" | "image" | "location" | "note";
    authorKind?: "customer" | "bot" | "owner" | "system";
    status?: "queued" | "sent" | "delivered" | "read" | "failed";
    metadata?: Record<string, unknown>;
  } = {},
): Promise<boolean> {
  const rows = await sql`
    insert into messages (
      conversation_id, role, content, wa_message_id, direction, type,
      author_kind, status, metadata, sent_at, cycle
    )
    values (
      ${conversationId},
      ${role},
      ${content},
      ${waMessageId ?? null},
      ${role === "user" ? "inbound" : "outbound"},
      ${options.type ?? "text"},
      ${options.authorKind ?? (role === "user" ? "customer" : role === "assistant" ? "bot" : "system")},
      ${options.status ?? (role === "user" ? "delivered" : null)},
      ${sql.json((options.metadata ?? {}) as never)},
      ${role === "user" ? null : new Date()},
      (select current_cycle from conversations where id = ${conversationId})
    )
    on conflict (wa_message_id) do nothing
    returning id
  `;
  if (rows.length > 0) {
    if (role === "user") {
      await sql`
        update conversations
        set unread_count = unread_count + 1,
            last_customer_message_at = now(),
            updated_at = now()
        where id = ${conversationId}
      `;
    } else if (role === "assistant") {
      await sql`
        update conversations
        set last_assistant_message_at = now(), updated_at = now()
        where id = ${conversationId}
      `;
    }
  }
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
      where conversation_id = ${conversationId}
        and cycle = (select current_cycle from conversations where id = ${conversationId})
        and role in ('user', 'assistant')
      order by created_at desc
      limit ${limit}
    ) recent
    order by created_at asc
  `;
  return rows;
}

export async function setStage(
  conversationId: number,
  stage: Stage,
  options: { actor?: "customer" | "bot" | "owner" | "system"; reason?: string } = {},
): Promise<void> {
  if (!isStage(stage)) throw new Error(`Etapa inválida: ${stage}`);
  const [current] = await sql<{ stage: Stage; current_cycle: number }[]>`
    select stage, current_cycle from conversations where id = ${conversationId}
  `;
  if (!current || current.stage === stage) return;
  await sql`
    update conversations
    set stage = ${stage},
        status = ${stage === "ganado" || stage === "perdido" ? "closed" : "open"},
        closed_reason = ${stage === "perdido" ? options.reason ?? "perdido" : null},
        closed_at = ${stage === "ganado" || stage === "perdido" ? new Date() : null},
        updated_at = now()
    where id = ${conversationId}
  `;
  await sql`
    insert into funnel_events (conversation_id, cycle, type, data)
    values (
      ${conversationId},
      ${current.current_cycle},
      'etapa',
      ${sql.json({
        from: current.stage,
        stage,
        actor: options.actor ?? "system",
        reason: options.reason ?? null,
      })}
    )
  `;
  await sql`
    insert into stage_transitions (conversation_id, cycle, from_stage, to_stage, actor, reason)
    values (
      ${conversationId},
      ${current.current_cycle},
      ${current.stage},
      ${stage},
      ${options.actor ?? "system"},
      ${options.reason ?? null}
    )
  `;
  if (stage === "ganado" || stage === "perdido") {
    await sql`
      insert into sales_history (
        conversation_id, cycle, outcome, reason, tire_size, vehicle,
        selected_product_code, selected_quantity, quote_id, quote_number,
        sale_number, total, closed_at
      )
      select
        c.id, c.current_cycle, ${stage}, ${options.reason ?? null}, c.tire_size, c.vehicle,
        c.selected_product_code, c.selected_quantity, q.id, q.quote_number,
        q.sale_number, q.total, now()
      from conversations c
      left join lateral (
        select id, quote_number, sale_number, total from quotes
        where conversation_id = c.id and cycle = c.current_cycle
        order by created_at desc limit 1
      ) q on true
      where c.id = ${conversationId}
      on conflict (conversation_id, cycle) do update set
        outcome = excluded.outcome, reason = excluded.reason,
        tire_size = excluded.tire_size, vehicle = excluded.vehicle,
        selected_product_code = excluded.selected_product_code,
        selected_quantity = excluded.selected_quantity,
        quote_id = excluded.quote_id, quote_number = excluded.quote_number,
        sale_number = excluded.sale_number, total = excluded.total,
        closed_at = excluded.closed_at
    `;
  }
}

export async function updateConversationFacts(
  conversationId: number,
  facts: {
    tireSize?: string;
    vehicle?: string;
    selectedProductCode?: string;
    selectedQuantity?: number;
    locationLabel?: string;
    nearestStore?: string;
  },
): Promise<void> {
  await sql`
    update conversations set
      tire_size = coalesce(${facts.tireSize ?? null}, tire_size),
      vehicle = coalesce(${facts.vehicle ?? null}, vehicle),
      selected_product_code = coalesce(${facts.selectedProductCode ?? null}, selected_product_code),
      selected_quantity = coalesce(${facts.selectedQuantity ?? null}, selected_quantity),
      location_label = coalesce(${facts.locationLabel ?? null}, location_label),
      nearest_store = coalesce(${facts.nearestStore ?? null}, nearest_store),
      updated_at = now()
    where id = ${conversationId}
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
  quoteNumber?: string,
  saleNumber?: string,
): Promise<number> {
  const [quote] = await sql<{ id: number }[]>`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
    values (
      ${conversationId},
      (select current_cycle from conversations where id = ${conversationId}),
      ${sql.json(items as never)}, ${subtotal}, ${tax}, ${total},
      ${quoteNumber ?? null}, ${saleNumber ?? null}
    )
    returning id
  `;
  await sql`
    insert into funnel_events (conversation_id, cycle, type, data)
    values (
      ${conversationId},
      (select current_cycle from conversations where id = ${conversationId}),
      'cotizacion', ${sql.json({ total, quoteNumber, saleNumber })}
    )
  `;
  return Number(quote.id);
}

export async function logFunnelEvent(
  conversationId: number,
  type: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await sql`
    insert into funnel_events (conversation_id, cycle, type, data)
    values (
      ${conversationId},
      (select current_cycle from conversations where id = ${conversationId}),
      ${type}, ${data ? sql.json(data as never) : null}
    )
  `;
}

export async function markConversationRead(conversationId: number): Promise<void> {
  await sql`
    update conversations set unread_count = 0, updated_at = now()
    where id = ${conversationId}
  `;
}

export async function addConversationNote(
  conversationId: number,
  content: string,
  author = "owner",
): Promise<void> {
  await sql`
    insert into conversation_notes (conversation_id, content, author)
    values (${conversationId}, ${content}, ${author})
  `;
}

export async function setConversationAssignee(
  conversationId: number,
  assignedTo: "bot" | "human",
): Promise<void> {
  await sql`
    update conversations
    set assigned_to = ${assignedTo},
        bot_paused_until = ${assignedTo === "human" ? new Date(Date.now() + config.pipeline.botPauseHours * 60 * 60 * 1000) : null},
        updated_at = now()
    where id = ${conversationId}
  `;
}

export async function recordMessageStatus(
  providerId: string,
  status: string,
  payload: Record<string, unknown> = {},
): Promise<number | null> {
  const normalized =
    status === "sent" ||
    status === "delivered" ||
    status === "read" ||
    status === "failed"
      ? status
      : "unknown";
  const [message] = await sql<{ id: number; conversation_id: number }[]>`
    update messages
    set status = ${normalized},
        sent_at = case when ${normalized} = 'sent' then coalesce(sent_at, now()) else sent_at end,
        delivered_at = case when ${normalized} = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
        read_at = case when ${normalized} = 'read' then coalesce(read_at, now()) else read_at end,
        failed_at = case when ${normalized} = 'failed' then coalesce(failed_at, now()) else failed_at end,
        metadata = metadata || ${sql.json(payload as never)}
    where wa_message_id = ${providerId}
    returning id, conversation_id
  `;
  await sql`
    insert into message_status_events (message_id, provider_id, status, payload)
    values (
      ${message?.id ?? null},
      ${providerId},
      ${normalized},
      ${sql.json(payload as never)}
    )
  `;
  return message ? Number(message.conversation_id) : null;
}

export async function logQuoteArtifact(input: {
  conversationId: number;
  quoteId?: number;
  kind: "options" | "comparison" | "quote";
  products: unknown;
  filename?: string;
  providerId?: string;
}): Promise<void> {
  await sql`
    insert into quote_artifacts (
      conversation_id, cycle, quote_id, kind, products, filename, provider_id
    )
    values (
      ${input.conversationId},
      (select current_cycle from conversations where id = ${input.conversationId}),
      ${input.quoteId ?? null},
      ${input.kind},
      ${sql.json(input.products as never)},
      ${input.filename ?? null},
      ${input.providerId ?? null}
    )
  `;
  await logFunnelEvent(input.conversationId, `artefacto_${input.kind}`, {
    filename: input.filename ?? null,
    providerId: input.providerId ?? null,
  });
}

export async function logAiRun(input: {
  conversationId: number;
  stage: Stage;
  promptVersionId?: number;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  tools: string[];
  error?: string;
}): Promise<void> {
  await sql`
    insert into ai_runs (
      conversation_id, stage, prompt_version_id, model, latency_ms,
      input_tokens, output_tokens, tools, error
    )
    values (
      ${input.conversationId},
      ${input.stage},
      ${input.promptVersionId ?? null},
      ${input.model},
      ${input.latencyMs},
      ${input.inputTokens},
      ${input.outputTokens},
      ${sql.json(input.tools as never)},
      ${input.error ?? null}
    )
  `;
}

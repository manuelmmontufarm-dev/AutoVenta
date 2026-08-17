import { sql } from "../db/client.js";
import { config } from "../config.js";
import { isStage, type Stage } from "../domain/pipeline.js";
import { cancelPendingFollowUps, scheduleConversationFollowUps } from "./followUps.js";
import { emitLiveEvent } from "./liveEvents.js";

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
  /**
   * Si la conversación está cerrada, ¿se reabre un ciclo nuevo?
   *
   * Por defecto sí: un mensaje ENTRANTE sobre una venta cerrada es una
   * oportunidad nueva y así estaba pensado. Pero los ECOS (los mensajes que
   * SALIERON del negocio) también pasaban por aquí, y reabrir un ciclo por un
   * mensaje saliente es semánticamente inválido: vaciaba la ficha de la
   * conversación —medida, vehículo, producto, cantidad, local, fecha de
   * visita, compromiso— la devolvía al kanban como lead nuevo, y registraba el
   * evento con actor 'customer' y razón «Nuevo mensaje después de un cierre»,
   * que era falso. Bastaba con que un asesor escribiera desde su WhatsApp, o
   * con un envío desde el panel, sobre un chat ya cerrado.
   */
  reabrirSiCerrada = true,
): Promise<Conversation> {
  const [row] = await sql<Conversation[]>`
    insert into conversations (phone, name)
    values (${phone}, ${name ?? null})
    on conflict (phone) do update
      set name = coalesce(conversations.name, excluded.name),
          updated_at = now()
    returning id, phone, name, stage, bot_paused_until, status, current_cycle
  `;
  if (row.status === "closed" && reabrirSiCerrada) {
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
        vehicle_year = null,
        selected_product_code = null, selected_quantity = null,
        location_label = null, nearest_store = null,
        pickup_date = null, visit_date = null, offer_expires_at = null,
        savings_amount = null, customer_commitment = null,
        customer_commitment_cycle = null, follow_up_reason = null,
        follow_up_reason_cycle = null,
        closed_reason = null, closed_at = null, updated_at = now()
    where id = ${conversationId} and status = 'closed'
    returning id, phone, name, stage, bot_paused_until, status, current_cycle
  `;
  // `and status = 'closed'` hace la reapertura IDEMPOTENTE (16-ago). El insert
  // en sales_history ya filtraba por cerrada, pero este update no: dos llamadas
  // seguidas (dos mensajes que entran a la vez sobre un chat recién cerrado)
  // saltaban un ciclo y vaciaban la ficha por segunda vez SIN archivarla — el
  // ciclo intermedio quedaba sin fila en sales_history y sus datos se perdían.
  // Ahora la segunda llamada no toca nada y devuelve la conversación tal cual.
  if (!row) {
    const [actual] = await sql<Conversation[]>`
      select id, phone, name, stage, bot_paused_until, status, current_cycle
      from conversations where id = ${conversationId}
    `;
    if (!actual) throw new Error(`Conversación ${conversationId} no existe`);
    return actual;
  }
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
 * ¿Ya procesamos este mensaje de Meta?
 *
 * El deduplicado de verdad lo hace `appendMessage` con su `on conflict do
 * nothing`, pero eso ocurre al FINAL: para una foto o un audio, la reentrega
 * ya había pagado la descarga del media y la llamada a la visión antes de
 * enterarse de que el mensaje estaba repetido — factura doble por el mismo
 * mensaje. Con esto se pregunta ANTES de gastar nada.
 *
 * Es una comprobación optimista, no un candado: dos reentregas simultáneas
 * pueden pasar las dos. El `on conflict` de `appendMessage` sigue siendo la
 * garantía; esto solo evita el gasto en el caso normal.
 */
export async function yaProcesado(waMessageId: string): Promise<boolean> {
  if (!waMessageId) return false;
  const [fila] = await sql<{ existe: boolean }[]>`
    select true as existe from messages where wa_message_id = ${waMessageId} limit 1
  `;
  return Boolean(fila?.existe);
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
    occurredAt?: Date;
  } = {},
): Promise<boolean> {
  const occurredAt = options.occurredAt ?? new Date();
  const rows = await sql`
    insert into messages (
      conversation_id, role, content, wa_message_id, direction, type,
      author_kind, status, metadata, sent_at, cycle, created_at
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
      ${role === "user" ? null : occurredAt},
      (select current_cycle from conversations where id = ${conversationId}),
      ${occurredAt}
    )
    on conflict (wa_message_id) do nothing
    returning id
  `;
  if (rows.length > 0) {
    if (role === "user") {
      await sql`
        update conversations
        set unread_count = unread_count + 1,
            last_customer_message_at = greatest(
              coalesce(last_customer_message_at, '-infinity'::timestamptz),
              ${occurredAt}
            ),
            updated_at = now()
        where id = ${conversationId}
      `;
    } else if (role === "assistant") {
      await sql`
        update conversations
        set last_assistant_message_at = greatest(
              coalesce(last_assistant_message_at, '-infinity'::timestamptz),
              ${occurredAt}
            ),
            updated_at = now()
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
        -- Cerrada la venta, el pin "para después" ya cumplió: si revive en otro
        -- ciclo no debe arrastrar la prioridad vieja.
        review_later_at = case when ${stage === "ganado" || stage === "perdido"} then null else review_later_at end,
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
  await cancelPendingFollowUps(
    conversationId,
    stage === "ganado" || stage === "perdido" ? `conversation_closed_${stage}` : "stage_changed",
    current.current_cycle,
  );
  if (stage !== "ganado" && stage !== "perdido") {
    await scheduleConversationFollowUps(conversationId);
  }
}

/**
 * Lo último que le dijimos al cliente, lo haya escrito el bot o un asesor.
 * Sirve para leer su respuesta en contexto: "el sábado" solo significa una
 * visita si lo anterior fue una pregunta por el día.
 */
export async function lastOutboundText(conversationId: number): Promise<string | null> {
  const [row] = await sql<{ content: string }[]>`
    select content from messages
    where conversation_id = ${conversationId} and direction = 'outbound' and type <> 'note'
    order by created_at desc limit 1
  `;
  return row?.content ?? null;
}

export async function updateConversationFacts(
  conversationId: number,
  facts: {
    tireSize?: string;
    vehicle?: string;
    vehicleYear?: number;
    selectedProductCode?: string;
    selectedQuantity?: number;
    locationLabel?: string;
    nearestStore?: string;
    pickupDate?: Date;
    visitDate?: Date;
    offerExpiresAt?: Date;
    savingsAmount?: number;
    customerCommitment?: string;
    followUpReason?: string;
  },
): Promise<void> {
  await sql`
    update conversations set
      tire_size = coalesce(${facts.tireSize ?? null}, tire_size),
      vehicle = coalesce(${facts.vehicle ?? null}, vehicle),
      vehicle_year = coalesce(${facts.vehicleYear ?? null}, vehicle_year),
      selected_product_code = coalesce(${facts.selectedProductCode ?? null}, selected_product_code),
      selected_quantity = coalesce(${facts.selectedQuantity ?? null}, selected_quantity),
      location_label = coalesce(${facts.locationLabel ?? null}, location_label),
      nearest_store = coalesce(${facts.nearestStore ?? null}, nearest_store),
      pickup_date = coalesce(${facts.pickupDate ?? null}, pickup_date),
      visit_date = coalesce(${facts.visitDate ?? null}, visit_date),
      offer_expires_at = coalesce(${facts.offerExpiresAt ?? null}, offer_expires_at),
      savings_amount = coalesce(${facts.savingsAmount ?? null}, savings_amount),
      customer_commitment = coalesce(${facts.customerCommitment ?? null}, customer_commitment),
      follow_up_reason = coalesce(${facts.followUpReason ?? null}, follow_up_reason),
      customer_commitment_cycle = case when ${facts.customerCommitment ?? null}::text is not null
        then current_cycle else customer_commitment_cycle end,
      follow_up_reason_cycle = case when ${facts.followUpReason ?? null}::text is not null
        then current_cycle else follow_up_reason_cycle end,
      updated_at = now()
    where id = ${conversationId}
  `;
}

/** Una elección explícita del cliente reemplaza cualquier recomendación previa. */
export async function setExplicitStore(conversationId: number, store: string): Promise<void> {
  await sql`
    update conversations
    set nearest_store=${store},
        location_label=${`Local elegido explícitamente por el cliente: ${store}`},
        updated_at=now()
    where id=${conversationId}
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
  discount?: {
    id: number; baseTotalCents: number; discountAmountCents: number;
    reason: string; condition: string;
  },
): Promise<number> {
  const [quote] = await sql<{ id: number }[]>`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number,
      original_total, discount_amount, discount_reason, discount_condition, discount_offer_id)
    values (
      ${conversationId},
      (select current_cycle from conversations where id = ${conversationId}),
      ${sql.json(items as never)}, ${subtotal}, ${tax}, ${total},
      ${quoteNumber ?? null}, ${saleNumber ?? null}, ${discount ? discount.baseTotalCents / 100 : null},
      ${discount ? discount.discountAmountCents / 100 : null}, ${discount?.reason ?? null},
      ${discount?.condition ?? null}, ${discount?.id ?? null}
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

/**
 * Marca / desmarca "para después": la dejó el asesor en el modo revisión sin
 * cerrarla. Es un pin de prioridad, no una etapa — no toca el pipeline.
 */
export async function setReviewLater(
  conversationId: number,
  enabled: boolean,
): Promise<void> {
  await sql`
    update conversations
    set review_later_at = ${enabled ? new Date() : null},
        updated_at = now()
    where id = ${conversationId}
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
  if (assignedTo === "human") await cancelPendingFollowUps(conversationId, "human_took_control");
  await scheduleConversationFollowUps(conversationId);
}

/**
 * Devuelve el chat al bot cuando la pausa del handoff ya venció.
 *
 * `setConversationAssignee('human')` hace dos cosas: marca `assigned_to='human'`
 * (pegajoso) y pone una pausa de BOT_PAUSE_HOURS (temporal). Al vencer la pausa
 * quedaba lo peor de los dos mundos: el bot volvía a redactar respuestas —
 * gastando un turno entero del modelo por cada mensaje— y la política las
 * bloqueaba por `human_control` al momento de enviarlas. El cliente no recibía
 * nada y el chat parecía atendido.
 *
 * Decisión del 8-ago: al vencer el plazo el chat vuelve al bot solo. Un chat
 * olvidado que se queda mudo cuesta más que un bot que retoma de más, y el
 * asesor siempre puede volver a tomarlo desde el panel.
 *
 * Devuelve true solo si de verdad lo devolvió (para poder registrarlo).
 */
export async function devolverAlBotSiVencioLaPausa(conversationId: number): Promise<boolean> {
  const filas = await sql`
    update conversations
    set assigned_to = 'bot', bot_paused_until = null, updated_at = now()
    where id = ${conversationId} and assigned_to = 'human'
      and (bot_paused_until is null or bot_paused_until <= now())
    returning id
  `;
  return filas.length > 0;
}

export async function recordMessageStatus(
  providerId: string,
  status: string,
  payload: Record<string, unknown> = {},
  occurredAt = new Date(),
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
    set status = case
          when ${normalized} = 'failed' then 'failed'
          when (case ${normalized} when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end)
             >= (case status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end)
          then ${normalized} else status end,
        sent_at = case when ${normalized} = 'sent' then coalesce(sent_at, ${occurredAt}) else sent_at end,
        delivered_at = case when ${normalized} = 'delivered' then coalesce(delivered_at, ${occurredAt}) else delivered_at end,
        read_at = case when ${normalized} = 'read' then coalesce(read_at, ${occurredAt}) else read_at end,
        failed_at = case when ${normalized} = 'failed' then coalesce(failed_at, ${occurredAt}) else failed_at end,
        metadata = metadata || ${sql.json(payload as never)}
    where wa_message_id = ${providerId}
    returning id, conversation_id
  `;
  await sql`
    insert into message_status_events (message_id, provider_id, status, payload, created_at)
    values (
      ${message?.id ?? null},
      ${providerId},
      ${normalized},
      ${sql.json(payload as never)},
      ${occurredAt}
    )
  `;
  await sql`
    update follow_up_attempts
    set status = case
          when ${normalized} = 'failed' then 'failed'
          when (case ${normalized} when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end)
             >= (case status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end)
          then ${normalized} else status end,
        sent_at = case when ${normalized} = 'sent' then coalesce(sent_at, ${occurredAt}) else sent_at end,
        delivered_at = case when ${normalized} = 'delivered' then coalesce(delivered_at, ${occurredAt}) else delivered_at end,
        read_at = case when ${normalized} = 'read' then coalesce(read_at, ${occurredAt}) else read_at end,
        failed_at = case when ${normalized} = 'failed' then coalesce(failed_at, ${occurredAt}) else failed_at end
    where provider_message_id = ${providerId}
  `;
  await reconciliarAvisoAsesor(providerId, normalized, payload, occurredAt);
  return message ? Number(message.conversation_id) : null;
}

/**
 * Cierra el círculo del aviso al asesor: hasta ahora terminaba en el wamid.
 *
 * `notifyAdvisor` marca 'sent' apenas la Graph API acepta el mensaje, y aceptar
 * no es entregar: un número mal tecleado devuelve wamid igual y el fallo llega
 * después, por este webhook. El 8-ago eso dejó a Joaquín con 62 avisos que la
 * tabla daba por enviados y que Meta había rechazado uno por uno con el 131026.
 *
 * Un aviso que no llega es peor que uno que no se intentó: el que lo mandó cree
 * que hay alguien atendiendo. Por eso el fallo no solo corrige el estado —
 * levanta una alerta con el número al que no se pudo entregar, que es el dato
 * con el que alguien lo arregla en el panel.
 */
async function reconciliarAvisoAsesor(
  providerId: string,
  normalized: string,
  payload: Record<string, unknown>,
  occurredAt: Date,
): Promise<void> {
  if (normalized === "delivered" || normalized === "read") {
    await sql`
      update advisor_notifications
      set delivered_at = coalesce(delivered_at, ${occurredAt}), updated_at = now()
      where provider_message_id = ${providerId}
    `;
    return;
  }
  if (normalized !== "failed") return;

  const error = payload.error as { code?: number; title?: string } | null | undefined;
  const detalle = [error?.code ? `Meta ${error.code}` : "", error?.title ?? ""]
    .filter(Boolean)
    .join(": ") || "Meta rechazó la entrega";

  // Los dos fallos que se ven en la práctica piden cosas distintas, y decir
  // "no se entregó" a secas deja al que lo lee sin saber cuál de las dos es.
  const remedio =
    error?.code === 131047
      ? "Pásate más de 24 h sin que el asesor escriba al bot y WhatsApp cierra el canal. Pídele que mande cualquier mensaje al número del bot para reabrirlo."
      : error?.code === 131026
        ? "El número no tiene WhatsApp. Revísalo en Ajustes › Quién recibe los avisos: un dígito de más en el código de país acepta el envío y nunca entrega."
        : "Revisar el número en Ajustes › Quién recibe los avisos y el estado del canal.";

  const [aviso] = await sql<{
    conversation_id: number;
    cycle: number;
    recipient_name: string;
    recipient_phone: string;
    event_type: string;
  }[]>`
    update advisor_notifications
    set status = 'failed', error = ${detalle}, updated_at = now()
    where provider_message_id = ${providerId} and status <> 'failed'
    returning conversation_id, cycle, recipient_name, recipient_phone, event_type
  `;
  if (!aviso) return;

  // La clave lleva el teléfono y NO el evento: lo que hay que arreglar es el
  // número, una sola vez, no una alerta por cada aviso que rebote.
  await sql`
    insert into bot_alerts (
      conversation_id, cycle, type, priority, summary, exact_reason,
      suggested_action, dedupe_key
    ) values (
      ${aviso.conversation_id}, ${aviso.cycle}, 'advisor_notification_undelivered', 'high',
      ${`${aviso.recipient_name} no está recibiendo los avisos del bot`},
      ${`${detalle}. Número configurado: +${aviso.recipient_phone}. Último aviso perdido: ${aviso.event_type}.`},
      ${remedio},
      ${`asesor_no_entregable:${aviso.recipient_phone}`}
    ) on conflict do nothing
  `;
  emitLiveEvent("alert", aviso.conversation_id);
  console.error(
    `⚠️ Aviso al asesor no entregado a ${aviso.recipient_name} (+${aviso.recipient_phone}): ${detalle}`,
  );
}

/**
 * El bot intentó cotizar una medida que el cliente no pidió, y el candado lo
 * frenó (ver domain/medidaPedida.ts, chat 5499 del 13-ago).
 *
 * Se registra aunque el cliente nunca lo vea: el intento bloqueado es la señal
 * de que el modelo sigue derivando de medida, y es lo que hay que mirar en la
 * revisión del día. Sin esto, un candado que funciona se vuelve invisible y
 * nadie se entera de que el prompt sigue enfermo.
 *
 * La clave de deduplicación lleva las dos medidas: reintentar la misma
 * confusión no multiplica alertas, pero derivar a OTRA medida sí es un hecho
 * nuevo que merece su fila.
 */
export async function registrarMedidaQueNoCoincide(
  conversation: { id: number; current_cycle: number },
  detalle: { pedida: string; cotizada: string; producto: string },
): Promise<void> {
  await sql`
    insert into bot_alerts (
      conversation_id, cycle, type, priority, summary, exact_reason,
      suggested_action, dedupe_key
    ) values (
      ${conversation.id}, ${conversation.current_cycle}, 'medida_no_coincide', 'high',
      ${`El bot intentó cotizar ${detalle.cotizada} y el cliente pidió ${detalle.pedida}`},
      ${`Se bloqueó la cotización de ${detalle.producto} (${detalle.cotizada}) porque el cliente pidió ${detalle.pedida}. Firmar otra medida es firmar otro precio.`},
      ${"Revisa el chat: si en la medida del cliente no hay stock, el asesor debe ofrecerle la equivalente diciéndoselo con claridad."},
      ${`medida_no_coincide:${conversation.id}:${conversation.current_cycle}:${detalle.pedida}>${detalle.cotizada}`}
    ) on conflict do nothing
  `;
  emitLiveEvent("alert", conversation.id);
  console.warn(
    `🔒 Cotización bloqueada en conv ${conversation.id}: pidió ${detalle.pedida}, se iba a firmar ${detalle.cotizada}`,
  );
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
  cachedInputTokens?: number;
  reasoningTokens?: number;
  iterations?: number;
  route?: string;
  callType?: string;
  tools: string[];
  error?: string;
}): Promise<void> {
  await sql`
    insert into ai_runs (
      conversation_id, stage, prompt_version_id, model, latency_ms,
      input_tokens, output_tokens, cached_input_tokens, reasoning_tokens,
      iterations, route, call_type, tools, error
    )
    values (
      ${input.conversationId},
      ${input.stage},
      ${input.promptVersionId ?? null},
      ${input.model},
      ${input.latencyMs},
      ${input.inputTokens},
      ${input.outputTokens},
      ${input.cachedInputTokens ?? 0},
      ${input.reasoningTokens ?? 0},
      ${input.iterations ?? 1},
      ${input.route ?? null},
      ${input.callType ?? "chat"},
      ${sql.json(input.tools as never)},
      ${input.error ?? null}
    )
  `;
}

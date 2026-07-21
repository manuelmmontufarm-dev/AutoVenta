import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { sql } from "../db/client.js";
import {
  computeInWindowSchedule,
  detectNegativeSentiment,
  detectOptOut,
  nextBusinessInstant,
  type FollowUpPolicy,
} from "../domain/followUps.js";
import { isStage, type Stage } from "../domain/pipeline.js";
import { buildContextualFollowUpMessage, inferProductCode, type FollowUpMessageKind } from "../domain/followUpMessages.js";
import { emitLiveEvent } from "./liveEvents.js";
import { generateFollowUpCopies } from "./followUpCopy.js";

export type FollowUpJobStatus =
  | "scheduled"
  | "processing"
  | "sent"
  | "blocked"
  | "cancelled"
  | "failed";

export interface FollowUpJob {
  id: number;
  conversation_id: number;
  cycle: number;
  type: string;
  channel: string;
  due_at: Date;
  window_closes_at: Date | null;
  status: FollowUpJobStatus;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  cancel_reason: string | null;
  created_at: Date;
  executed_at: Date | null;
}

interface PolicyRow {
  enabled: boolean;
  timezone: string;
  business_hours: Record<string, { open: string; close: string } | null>;
  enabled_stages: string[];
  first_delay_minutes: number;
  second_before_close_minutes: number;
  minimum_gap_minutes: number;
  max_in_window_attempts: number;
  max_post_window_attempts: number;
  post_window_gap_minutes: number;
  advisor_alert_days: number;
  recommend_close_days: number;
  require_consent: boolean;
  respect_opt_out: boolean;
  never_outside_hours: boolean;
  max_messages_per_day: number;
  pause_on_human_control: boolean;
  stage_prompts: Partial<Record<Stage, string>>;
}

interface ConversationForFollowUp {
  id: number;
  phone: string;
  name: string | null;
  stage: Stage;
  status: "open" | "closed";
  assigned_to: "bot" | "human";
  current_cycle: number;
  tire_size: string | null;
  selected_product_code: string | null;
  selected_quantity: number | null;
  nearest_store: string | null;
  customer_commitment: string | null;
  follow_up_reason: string | null;
  customer_opt_in: boolean;
  opted_out_at: Date | null;
  negative_sentiment_at: Date | null;
  last_customer_message_at: Date | null;
  last_assistant_message_at: Date | null;
  bot_paused_until: Date | null;
  quote_number: string | null;
  quote_total: string | number | null;
  summary: string | null;
  active_discount_amount: string | number | null;
  active_discount_condition: string | null;
  active_discount_final_total: string | number | null;
}

const FOLLOW_UP_PLAN_VERSION = "v5";

function policyScheduleSignature(policy: FollowUpPolicy): string {
  return createHash("sha256").update(JSON.stringify({
    timezone: policy.timezone,
    businessHours: policy.businessHours,
    enabledStages: policy.enabledStages,
    firstDelayMinutes: policy.firstDelayMinutes,
    secondBeforeCloseMinutes: policy.secondBeforeCloseMinutes,
    minimumGapMinutes: policy.minimumGapMinutes,
    maxInWindowAttempts: policy.maxInWindowAttempts,
    neverOutsideHours: policy.neverOutsideHours,
  })).digest("hex").slice(0, 10);
}

export async function getFollowUpPolicy(): Promise<FollowUpPolicy> {
  const [row] = await sql<PolicyRow[]>`
    select * from follow_up_policies where policy_key = 'default'
  `;
  if (!row) throw new Error("No existe la política default de seguimientos");
  const enabledStages = row.enabled_stages.filter(isStage);
  return {
    enabled: row.enabled,
    timezone: row.timezone,
    businessHours: Object.fromEntries(
      Object.entries(row.business_hours).map(([day, hours]) => [Number(day), hours]),
    ),
    enabledStages,
    firstDelayMinutes: row.first_delay_minutes,
    secondBeforeCloseMinutes: row.second_before_close_minutes,
    minimumGapMinutes: row.minimum_gap_minutes,
    maxInWindowAttempts: row.max_in_window_attempts,
    maxPostWindowAttempts: row.max_post_window_attempts,
    postWindowGapMinutes: row.post_window_gap_minutes,
    advisorAlertDays: row.advisor_alert_days,
    recommendCloseDays: row.recommend_close_days,
    requireConsent: row.require_consent,
    respectOptOut: row.respect_opt_out,
    neverOutsideHours: row.never_outside_hours,
    maxMessagesPerDay: row.max_messages_per_day,
    pauseOnHumanControl: row.pause_on_human_control,
    stagePrompts: row.stage_prompts ?? {},
  };
}

async function getConversationForFollowUp(
  conversationId: number,
): Promise<ConversationForFollowUp | null> {
  const [row] = await sql<ConversationForFollowUp[]>`
    select c.id, c.phone, c.name, c.stage, c.status, c.assigned_to,
      c.current_cycle, c.tire_size, coalesce(c.selected_product_code, s.selected_option) as selected_product_code,
      c.selected_quantity, c.nearest_store, c.customer_commitment,
      c.follow_up_reason, c.customer_opt_in, c.opted_out_at,
      c.negative_sentiment_at, c.last_customer_message_at,
      c.last_assistant_message_at, c.bot_paused_until,
      q.quote_number, q.total as quote_total, s.summary,
      d.discount_amount_cents::numeric / 100 as active_discount_amount,
      d.condition_text as active_discount_condition,
      d.final_total_cents::numeric / 100 as active_discount_final_total
    from conversations c
    left join lateral (
      select quote_number, total from quotes
      where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc limit 1
    ) q on true
    left join conversation_summaries s
      on s.conversation_id = c.id and s.cycle = c.current_cycle
    left join lateral (
      select discount_amount_cents, condition_text, final_total_cents
      from discount_offers where conversation_id = c.id and cycle = c.current_cycle
        and status in ('approved','offered','accepted')
        and (expires_at is null or expires_at > now())
      order by created_at desc limit 1
    ) d on true
    where c.id = ${conversationId}
  `;
  return row ?? null;
}

export function buildFollowUpPreview(
  conversation: ConversationForFollowUp,
  kind: FollowUpMessageKind = "in_window_first",
): string {
  return buildContextualFollowUpMessage({
    name: conversation.name,
    stage: conversation.stage,
    tireSize: conversation.tire_size,
    selectedProductCode: conversation.selected_product_code,
    nearestStore: conversation.nearest_store,
    customerCommitment: conversation.customer_commitment,
    quoteNumber: conversation.quote_number,
    activeDiscountAmount: conversation.active_discount_amount === null ? null : Number(conversation.active_discount_amount),
    activeDiscountCondition: conversation.active_discount_condition,
    activeDiscountFinalTotal: conversation.active_discount_final_total === null ? null : Number(conversation.active_discount_final_total),
  }, kind);
}

export async function cancelPendingFollowUps(
  conversationId: number,
  reason: string,
  cycle?: number,
): Promise<number> {
  const rows = await sql`
    update follow_up_jobs
    set status = 'cancelled', cancel_reason = ${reason}, executed_at = now(),
        locked_at = null, locked_by = null
    where conversation_id = ${conversationId}
      ${cycle === undefined ? sql`` : sql`and cycle = ${cycle}`}
      and status in ('scheduled', 'processing', 'blocked')
    returning id
  `;
  if (rows.length) emitLiveEvent("follow_up", conversationId);
  await sql`update follow_up_campaigns set status='cancelled', cancelled_at=now(), cancel_reason=${reason}
    where conversation_id=${conversationId}
      ${cycle === undefined ? sql`` : sql`and cycle=${cycle}`} and status='active'`;
  return rows.length;
}

async function insertJob(input: {
  conversationId: number;
  cycle: number;
  type: string;
  dueAt: Date;
  windowClosesAt: Date | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  channel?: string;
}): Promise<void> {
  await sql`
    insert into follow_up_jobs (
      conversation_id, cycle, type, channel, due_at, window_closes_at,
      idempotency_key, payload
    ) values (
      ${input.conversationId}, ${input.cycle}, ${input.type}, ${input.channel ?? "whatsapp"}, ${input.dueAt},
      ${input.windowClosesAt}, ${input.idempotencyKey},
      ${sql.json(input.payload as never)}
    ) on conflict (idempotency_key) do nothing
  `;
}

export async function scheduleConversationFollowUps(
  conversationId: number,
  now = new Date(),
): Promise<void> {
  await refreshConversationSummary(conversationId);
  const [conversation, policy] = await Promise.all([
    getConversationForFollowUp(conversationId),
    getFollowUpPolicy(),
  ]);
  if (!conversation) return;
  if (
    !policy.enabled ||
    conversation.status !== "open" ||
    conversation.opted_out_at ||
    conversation.negative_sentiment_at ||
    !policy.enabledStages.includes(conversation.stage) ||
    !conversation.last_customer_message_at ||
    !conversation.last_assistant_message_at
  ) return;
  if (
    conversation.assigned_to === "bot" &&
    conversation.last_assistant_message_at < conversation.last_customer_message_at
  ) return;

  const relevantAt = conversation.last_assistant_message_at.getTime() >= conversation.last_customer_message_at.getTime()
    ? conversation.last_assistant_message_at
    : conversation.last_customer_message_at;
  const base = `plan:${FOLLOW_UP_PLAN_VERSION}:${policyScheduleSignature(policy)}:${conversation.id}:${conversation.current_cycle}:${conversation.stage}:${relevantAt.toISOString()}`;
  const [existingPlan] = await sql<{ count: number }[]>`
    select count(*)::int as count from follow_up_jobs
    where conversation_id=${conversationId} and cycle=${conversation.current_cycle}
      and idempotency_key like ${`${base}:%`}
  `;
  if (existingPlan.count > 0) return;
  const copyContext = {
    name: conversation.name,
    stage: conversation.stage,
    tireSize: conversation.tire_size,
    selectedProductCode: conversation.selected_product_code,
    nearestStore: conversation.nearest_store,
    customerCommitment: conversation.customer_commitment,
    quoteNumber: conversation.quote_number,
    activeDiscountAmount: conversation.active_discount_amount === null ? null : Number(conversation.active_discount_amount),
    activeDiscountCondition: conversation.active_discount_condition,
    activeDiscountFinalTotal: conversation.active_discount_final_total === null ? null : Number(conversation.active_discount_final_total),
    summary: conversation.summary,
  };
  const copies = await generateFollowUpCopies(copyContext, policy.stagePrompts?.[conversation.stage]);
  await sql`
    update follow_up_jobs set status = 'cancelled',
      cancel_reason = 'replaced_by_new_schedule', executed_at = now(),
      locked_at = null, locked_by = null
    where conversation_id = ${conversationId}
      and cycle = ${conversation.current_cycle}
      and status in ('scheduled', 'processing', 'blocked')
      and payload->>'campaignId' is null
      and idempotency_key not like ${`${base}:%`}
  `;

  if (conversation.assigned_to === "human") {
    const windowClosesAt = new Date(conversation.last_customer_message_at.getTime() + 24 * 60 * 60 * 1000);
    const dueAt = nextBusinessInstant(windowClosesAt > now ? windowClosesAt : now, policy);
    if (dueAt) await insertJob({
      conversationId, cycle: conversation.current_cycle, type: "advisor_review", channel: "advisor",
      dueAt, windowClosesAt,
      idempotencyKey: `${base}:advisor_review`,
      payload: { preview: buildFollowUpPreview(conversation, "advisor_review"), stage: conversation.stage, reason: "Conversación bajo control humano pendiente de respuesta" },
    });
    emitLiveEvent("follow_up", conversationId);
    return;
  }

  const schedule = computeInWindowSchedule({
    lastCustomerMessageAt: conversation.last_customer_message_at,
    lastRelevantBotMessageAt: conversation.last_assistant_message_at,
    policy,
    now,
  });
  if (schedule.firstDueAt) {
    await insertJob({
      conversationId,
      cycle: conversation.current_cycle,
      type: "in_window_first",
      dueAt: schedule.firstDueAt,
      windowClosesAt: schedule.windowClosesAt,
      idempotencyKey: `${base}:in_window_first`,
      payload: { preview: copies.first, stage: conversation.stage },
    });
  }
  if (schedule.secondDueAt) {
    await insertJob({
      conversationId,
      cycle: conversation.current_cycle,
      type: "in_window_second",
      dueAt: schedule.secondDueAt,
      windowClosesAt: schedule.windowClosesAt,
      idempotencyKey: `${base}:in_window_second`,
      payload: { preview: copies.second, stage: conversation.stage },
    });
  }

  // Fuera de 24 h nunca se agenda automáticamente: un asesor debe autorizar
  // explícitamente la campaña de plantillas desde Oportunidades.
  const advisorDueAt = nextBusinessInstant(
    new Date(Math.max(now.getTime(), schedule.windowClosesAt.getTime())),
    policy,
  );
  if (advisorDueAt) await insertJob({
    conversationId, cycle: conversation.current_cycle, type: "advisor_review", channel: "advisor",
    dueAt: advisorDueAt, windowClosesAt: schedule.windowClosesAt,
    idempotencyKey: `${base}:advisor_review`,
    payload: { preview: buildFollowUpPreview(conversation, "advisor_review"), stage: conversation.stage, reason: "Ventana de 24 horas agotada tras los seguimientos iniciales: requiere evaluación del asesor" },
  });
  emitLiveEvent("follow_up", conversationId);
}

/** Recalcula jobs pendientes cuando cambia horario o retrasos administrativos. */
export async function rescheduleActiveConversationPlans(now = new Date()): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    select id from conversations
    where status='open' and opted_out_at is null and negative_sentiment_at is null
      and last_customer_message_at is not null and last_assistant_message_at is not null
      and (assigned_to='human' or last_assistant_message_at >= last_customer_message_at)
    order by updated_at desc
  `;
  for (const row of rows) await scheduleConversationFollowUps(Number(row.id), now);
  return rows.length;
}

export async function handleInboundFollowUpState(
  conversationId: number,
  text: string,
): Promise<{ optedOut: boolean; negative: boolean; requestedHuman: boolean }> {
  const optedOut = detectOptOut(text);
  const negative = optedOut || detectNegativeSentiment(text);
  const requestedHuman = /\b(?:asesor|humano|persona|vendedor|hablar con alguien)\b/i.test(text);
  await sql.begin(async (tx) => {
    await tx`
      update follow_up_jobs set status = 'cancelled',
        cancel_reason = ${optedOut ? "customer_opt_out" : "customer_replied"},
        executed_at = now(), locked_at = null, locked_by = null
      where conversation_id = ${conversationId}
        and status in ('scheduled', 'processing', 'blocked')
    `;
    await tx`update follow_up_campaigns set status='cancelled', cancelled_at=now(),
      cancel_reason=${optedOut ? "customer_opt_out" : negative ? "negative_sentiment" : "customer_replied"}
      where conversation_id=${conversationId} and status='active'`;
    if (optedOut || negative) {
      await tx`
        update conversations set
          opted_out_at = case when ${optedOut} then now() else opted_out_at end,
          customer_opt_in = case when ${optedOut} then false else customer_opt_in end,
          negative_sentiment_at = case when ${negative} then now() else negative_sentiment_at end,
          bot_paused_until = 'infinity'::timestamptz,
          assigned_to = 'human', updated_at = now()
        where id = ${conversationId}
      `;
      const [conversation] = await tx<{ current_cycle: number }[]>`
        select current_cycle from conversations where id = ${conversationId}
      `;
      if (conversation) {
        const type = optedOut ? "customer_opt_out" : "negative_sentiment";
        await tx`
          insert into bot_alerts (
            conversation_id, cycle, type, priority, summary, exact_reason,
            suggested_action, dedupe_key
          ) values (
            ${conversationId}, ${conversation.current_cycle}, ${type}, 'critical',
            ${optedOut ? "Cliente solicitó no recibir mensajes" : "Cliente molesto o con sentimiento negativo"},
            ${text.slice(0, 500)},
            'Revisar personalmente y no enviar más mensajes automáticos.',
            ${`${conversationId}:${conversation.current_cycle}:${type}`}
          ) on conflict do nothing
        `;
      }
    }
    if (requestedHuman && !negative) {
      const [conversation] = await tx<{ current_cycle: number }[]>`
        update conversations set assigned_to = 'human', bot_paused_until = 'infinity'::timestamptz,
          follow_up_reason = 'Cliente pidió atención de un asesor y todavía requiere respuesta',
          updated_at = now() where id = ${conversationId} returning current_cycle
      `;
      if (conversation) await tx`
        insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key)
        values (${conversationId}, ${conversation.current_cycle}, 'human_requested', 'high',
          'Cliente solicitó atención humana', ${text.slice(0, 500)},
          'Abrir el ticket y responder dentro de la ventana de 24 horas.',
          ${`${conversationId}:${conversation.current_cycle}:human_requested`}) on conflict do nothing
      `;
    }
  });
  emitLiveEvent("follow_up", conversationId);
  emitLiveEvent("alert", conversationId);
  if (!negative) {
    const [state] = await sql<{ assigned_to: string }[]>`select assigned_to from conversations where id=${conversationId}`;
    if (requestedHuman || state?.assigned_to === "human") {
      await scheduleConversationFollowUps(conversationId);
    }
  }
  return { optedOut, negative, requestedHuman };
}

export async function ensureActiveConversationPlans(now = new Date()): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    select c.id from conversations c
    where c.status = 'open' and c.opted_out_at is null and c.negative_sentiment_at is null
      and c.last_customer_message_at is not null and c.last_assistant_message_at is not null
      and (c.assigned_to = 'human' or c.last_assistant_message_at >= c.last_customer_message_at)
      and (
        exists (
          select 1 from follow_up_jobs legacy where legacy.conversation_id = c.id
            and legacy.cycle = c.current_cycle and legacy.status in ('scheduled','processing','blocked')
            and legacy.idempotency_key like 'plan:v%:%'
            and legacy.idempotency_key not like 'plan:v5:%'
        )
        or (
          not exists (
            select 1 from follow_up_jobs j where j.conversation_id = c.id
              and j.cycle = c.current_cycle and j.status in ('scheduled','processing','blocked')
          )
          and not exists (
            select 1 from follow_up_jobs advisor where advisor.conversation_id = c.id
              and advisor.cycle = c.current_cycle and advisor.type = 'advisor_review'
          )
        )
      )
    order by c.updated_at desc limit 50
  `;
  for (const row of rows) await scheduleConversationFollowUps(Number(row.id), now);
  return rows.length;
}

export async function refreshConversationSummary(conversationId: number): Promise<void> {
  const [context] = await sql<{
    current_cycle: number;
    tire_size: string | null;
    vehicle: string | null;
    selected_product_code: string | null;
    customer_commitment: string | null;
    follow_up_reason: string | null;
    last_owner_message: string | null;
  }[]>`
    select c.current_cycle, c.tire_size, c.vehicle, c.selected_product_code,
      c.customer_commitment, c.follow_up_reason,
      (select m.content from messages m where m.conversation_id=c.id and m.cycle=c.current_cycle
        and m.author_kind='owner' and m.type='text' order by m.created_at desc, m.id desc limit 1) as last_owner_message
    from conversations c where c.id = ${conversationId}
  `;
  if (!context) return;
  const [lastInbound, quote] = await Promise.all([
    sql<{ id: number; content: string }[]>`
      select id, content from messages
      where conversation_id = ${conversationId} and cycle = ${context.current_cycle}
        and direction = 'inbound'
      order by created_at desc, id desc limit 1
    `,
    sql<{ items: unknown }[]>`
      select items from quotes where conversation_id = ${conversationId}
        and cycle = ${context.current_cycle}
      order by created_at desc, id desc limit 1
    `,
  ]);
  const need = [context.tire_size, context.vehicle].filter(Boolean).join(" · ");
  const latest = lastInbound[0]?.content.trim().replace(/\s+/g, " ").slice(0, 180) ?? "";
  const summary = [
    need ? `Cliente busca llantas para ${need}.` : "Cliente mantiene una consulta comercial abierta.",
    latest ? `Último mensaje: ${latest}` : "Aún no hay un mensaje reciente para resumir.",
  ].join(" ");
  const rawItems = Array.isArray(quote[0]?.items) ? quote[0].items : [];
  const options = rawItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const value = item as Record<string, unknown>;
      return String(value.code ?? value.description ?? value.descripcion ?? "").trim() || null;
    })
    .filter((value): value is string => Boolean(value));
  const selectedOption = context.selected_product_code ?? inferProductCode(context.last_owner_message);
  await sql`
    insert into conversation_summaries (
      conversation_id, cycle, summary, customer_need, options_discussed,
      selected_option, customer_commitment, follow_up_reason, generated_at, source_message_id
    ) values (
      ${conversationId}, ${context.current_cycle}, ${summary}, ${need || null},
      ${sql.json(options)}, ${selectedOption}, ${context.customer_commitment},
      ${context.follow_up_reason}, now(), ${lastInbound[0]?.id ?? null}
    ) on conflict (conversation_id, cycle) do update set
      summary = excluded.summary, customer_need = excluded.customer_need,
      options_discussed = excluded.options_discussed, selected_option = excluded.selected_option,
      customer_commitment = excluded.customer_commitment,
      follow_up_reason = excluded.follow_up_reason, generated_at = excluded.generated_at,
      source_message_id = excluded.source_message_id
  `;
}

export async function reconcileFollowUpAlerts(now = new Date()): Promise<void> {
  const policy = await getFollowUpPolicy();
  await sql`
    insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key)
    select c.id, c.current_cycle, 'window_closing', 'medium',
      'La ventana de WhatsApp está próxima a cerrar',
      'Quedan menos de dos horas y la conversación sigue esperando respuesta.',
      'Revisar si el seguimiento programado sigue siendo pertinente.',
      c.id || ':' || c.current_cycle || ':window_closing'
    from conversations c
    where c.status = 'open' and c.assigned_to = 'bot'
      and c.last_customer_message_at is not null
      and c.last_customer_message_at + interval '24 hours' between ${now} and ${new Date(now.getTime() + 2 * 60 * 60 * 1000)}
    on conflict do nothing
  `;
  await sql`
    insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key)
    select c.id, c.current_cycle, 'two_follow_ups_no_reply', 'high',
      'Dos seguimientos sin respuesta',
      'Se agotaron los intentos iniciales sin una nueva respuesta del cliente.',
      'Asignar a un asesor; no continuar enviando indefinidamente.',
      c.id || ':' || c.current_cycle || ':two_follow_ups_no_reply'
    from conversations c
    where c.status = 'open' and (
      select count(*) from follow_up_jobs j where j.conversation_id = c.id
        and j.cycle = c.current_cycle and j.status = 'sent'
    ) >= 2 and not exists (
      select 1 from messages m where m.conversation_id = c.id and m.cycle = c.current_cycle
        and m.direction = 'inbound' and m.created_at > (
          select max(j.executed_at) from follow_up_jobs j where j.conversation_id = c.id and j.cycle = c.current_cycle and j.status = 'sent'
        )
    ) on conflict do nothing
  `;
  await sql`
    insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key)
    select c.id, c.current_cycle,
      case when c.last_customer_message_at <= ${new Date(now.getTime() - policy.recommendCloseDays * 86_400_000)} then 'recommend_close_lost' else 'advisor_follow_up' end,
      case when c.last_customer_message_at <= ${new Date(now.getTime() - policy.recommendCloseDays * 86_400_000)} then 'high' else 'medium' end,
      case when c.last_customer_message_at <= ${new Date(now.getTime() - policy.recommendCloseDays * 86_400_000)} then 'Recomendar cierre como Perdido' else 'Tarea de seguimiento para asesor' end,
      'Conversación abierta sin respuesta durante varios días.',
      case when c.last_customer_message_at <= ${new Date(now.getTime() - policy.recommendCloseDays * 86_400_000)} then 'Revisar y decidir manualmente; nunca cerrar automáticamente.' else 'Asignar a un asesor y revisar el contexto.' end,
      c.id || ':' || c.current_cycle || ':' || case when c.last_customer_message_at <= ${new Date(now.getTime() - policy.recommendCloseDays * 86_400_000)} then 'recommend_close_lost' else 'advisor_follow_up' end
    from conversations c where c.status = 'open' and c.last_customer_message_at is not null
      and c.last_customer_message_at <= ${new Date(now.getTime() - policy.advisorAlertDays * 86_400_000)}
    on conflict do nothing
  `;
  await sql`
    insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key)
    select c.id, c.current_cycle, 'visit_not_confirmed', 'high',
      'Cliente prometió visitar y no confirmó', 'La fecha de visita registrada ya pasó.',
      'Contactar sólo si la ventana está abierta o mediante plantilla aprobada.',
      c.id || ':' || c.current_cycle || ':visit_not_confirmed'
    from conversations c where c.status = 'open' and c.visit_date is not null and c.visit_date < ${now}
    on conflict do nothing
  `;
  emitLiveEvent("alert");
}

export async function claimDueFollowUpJobs(input: {
  workerId?: string;
  now?: Date;
  limit?: number;
  leaseMinutes?: number;
} = {}): Promise<FollowUpJob[]> {
  const workerId = input.workerId ?? randomUUID();
  const now = input.now ?? new Date();
  const limit = input.limit ?? 10;
  const leaseMinutes = input.leaseMinutes ?? 5;
  return sql.begin(async (tx) => {
    await tx`
      update follow_up_jobs set status = 'scheduled', locked_at = null, locked_by = null
      where status = 'processing'
        and locked_at < ${new Date(now.getTime() - leaseMinutes * 60_000)}
    `;
    const rows = await tx<FollowUpJob[]>`
      with due as (
        select id from follow_up_jobs
        where status = 'scheduled' and due_at <= ${now}
        order by due_at, id
        for update skip locked
        limit ${limit}
      )
      update follow_up_jobs jobs
      set status = 'processing', locked_at = ${now}, locked_by = ${workerId}
      from due where jobs.id = due.id
      returning jobs.*
    `;
    return rows;
  });
}

export async function markFollowUpJobCancelled(jobId: number, reason: string): Promise<void> {
  await sql`
    update follow_up_jobs set status = 'cancelled', cancel_reason = ${reason},
      executed_at = now(), locked_at = null, locked_by = null
    where id = ${jobId}
  `;
}

export async function getFollowUpJobContext(jobId: number) {
  const [row] = await sql<
    (ConversationForFollowUp & {
      job_id: number;
      job_cycle: number;
      job_type: string;
      job_channel: string;
      job_status: FollowUpJobStatus;
      job_payload: Record<string, unknown>;
      window_closes_at: Date | null;
      attempt_count: number;
    })[]
  >`
    select c.*, q.quote_number, q.total as quote_total, s.summary,
      d.discount_amount_cents::numeric / 100 as active_discount_amount,
      d.condition_text as active_discount_condition,
      d.final_total_cents::numeric / 100 as active_discount_final_total,
      j.id as job_id, j.cycle as job_cycle, j.type as job_type,
      j.status as job_status, j.payload as job_payload,
      j.window_closes_at, j.attempt_count, j.channel as job_channel
    from follow_up_jobs j
    join conversations c on c.id = j.conversation_id
    left join lateral (
      select quote_number, total from quotes where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc limit 1
    ) q on true
    left join conversation_summaries s on s.conversation_id = c.id and s.cycle = c.current_cycle
    left join lateral (
      select discount_amount_cents, condition_text, final_total_cents
      from discount_offers where conversation_id = c.id and cycle = c.current_cycle
        and status in ('approved','offered','accepted') and (expires_at is null or expires_at > now())
      order by created_at desc limit 1
    ) d on true
    where j.id = ${jobId}
  `;
  return row ?? null;
}

export async function createBotAlert(input: {
  conversationId: number;
  cycle: number;
  type: string;
  priority: "critical" | "high" | "medium" | "low";
  summary: string;
  exactReason: string;
  suggestedAction: string;
  dedupeKey: string;
}): Promise<void> {
  await sql`
    insert into bot_alerts (
      conversation_id, cycle, type, priority, summary, exact_reason,
      suggested_action, dedupe_key
    ) values (
      ${input.conversationId}, ${input.cycle}, ${input.type}, ${input.priority},
      ${input.summary}, ${input.exactReason}, ${input.suggestedAction}, ${input.dedupeKey}
    ) on conflict do nothing
  `;
  emitLiveEvent("alert", input.conversationId);
}

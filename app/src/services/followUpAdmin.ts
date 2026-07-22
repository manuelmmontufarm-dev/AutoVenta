import { sql } from "../db/client.js";

export async function listFollowUpBoard() {
  const rows = await sql<{
    job_id: number | null;
    conversation_id: number;
    cycle: number;
    type: string | null;
    status: string | null;
    due_at: Date | null;
    window_closes_at: Date | null;
    payload: Record<string, unknown> | null;
    cancel_reason: string | null;
    name: string | null;
    phone: string;
    stage: string;
    assigned_to: string;
    tire_size: string | null;
    selected_product_code: string | null;
    last_message: string | null;
    last_at: Date | null;
    summary: string | null;
    template_name: string | null;
    last_customer_message_at: Date | null;
    customer_commitment: string | null;
    visit_date: Date | null;
    pickup_date: Date | null;
    follow_up_reason: string | null;
    quote_number: string | null;
    campaign_id: number | null;
    campaign_template_key: string | null;
    campaign_plan: unknown[] | null;
    discount_condition: string | null;
    human_requested: boolean;
  }[]>`
    select j.id as job_id, c.id as conversation_id, c.current_cycle as cycle,
      j.type, j.status, j.due_at, j.window_closes_at, j.payload, j.cancel_reason,
      c.name, c.phone, c.stage, c.assigned_to, c.tire_size,
      c.selected_product_code, m.content as last_message, m.created_at as last_at,
      s.summary, t.template_name, c.last_customer_message_at,
      coalesce(case when c.customer_commitment_cycle=c.current_cycle then c.customer_commitment end,
        s.customer_commitment) as customer_commitment,
      c.visit_date, c.pickup_date,
      coalesce(case when c.follow_up_reason_cycle=c.current_cycle then c.follow_up_reason end,
        s.follow_up_reason) as follow_up_reason,
      quote.quote_number, discount.condition_text as discount_condition,
      exists (
        select 1 from bot_alerts requested
        where requested.conversation_id=c.id and requested.cycle=c.current_cycle
          and requested.type='human_requested' and requested.status in ('open','snoozed')
      ) as human_requested,
      campaign.id as campaign_id,
      campaign.template_key as campaign_template_key, campaign_jobs.plan as campaign_plan
    from conversations c
    left join lateral (
      select * from follow_up_jobs
      where conversation_id = c.id and cycle = c.current_cycle
        and status in ('scheduled','processing','blocked')
      order by due_at asc
      limit 1
    ) j on true
    left join lateral (
      select content, created_at from messages where conversation_id = c.id
      order by created_at desc limit 1
    ) m on true
    left join conversation_summaries s on s.conversation_id = c.id and s.cycle = c.current_cycle
    left join lateral (
      select quote_number from quotes where conversation_id=c.id and cycle=c.current_cycle
      order by created_at desc, id desc limit 1
    ) quote on true
    left join follow_up_templates t on t.template_key = j.payload->>'templateKey'
    left join lateral (
      select condition_text from discount_offers where conversation_id=c.id and cycle=c.current_cycle
        and status in ('approved','offered','accepted') and (expires_at is null or expires_at>now())
      order by created_at desc limit 1
    ) discount on true
    left join lateral (
      select id, template_key from follow_up_campaigns
      where conversation_id=c.id and cycle=c.current_cycle and status='active'
      order by created_at desc limit 1
    ) campaign on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', fj.id, 'day', fj.payload->>'day', 'dueAt', fj.due_at,
        'preview', fj.payload->>'preview', 'templateKey', fj.payload->>'templateKey',
        'status', fj.status
      ) order by fj.due_at) as plan
      from follow_up_jobs fj where fj.payload->>'campaignId'=campaign.id::text
        and fj.status in ('scheduled','processing','blocked')
    ) campaign_jobs on true
    where c.status='open' and c.opted_out_at is null and c.negative_sentiment_at is null
      and c.last_customer_message_at is not null
      and (
        c.stage='seguimiento_venta'
        or exists (
          select 1 from bot_alerts requested
          where requested.conversation_id=c.id and requested.cycle=c.current_cycle
            and requested.type='human_requested' and requested.status in ('open','snoozed')
        )
        or (
          c.last_customer_message_at + interval '24 hours' <= now()
          and c.last_assistant_message_at >= c.last_customer_message_at
        )
      )
    order by case when exists (
        select 1 from bot_alerts requested
        where requested.conversation_id=c.id and requested.cycle=c.current_cycle
          and requested.type='human_requested' and requested.status in ('open','snoozed')
      ) then 0 when c.stage='seguimiento_venta' then 1 else 2 end,
      coalesce(c.visit_date, c.pickup_date::timestamptz, j.due_at, c.last_customer_message_at) asc
    limit 500
  `;
  const now = new Date();
  return rows.map((row) => {
    const unansweredDays = row.last_customer_message_at
      ? Math.max(0, Math.floor((now.getTime() - row.last_customer_message_at.getTime()) / 86_400_000))
      : 0;
    const bucket = row.human_requested || row.stage !== "seguimiento_venta" ? "needs_human" : "closing";
    const importanceLabel = bucket === "needs_human"
      ? row.human_requested ? "Cliente pidió asesor" : "Ventana cerrada"
      : row.customer_commitment || row.visit_date || row.pickup_date
        ? "Compromiso por confirmar"
        : row.follow_up_reason?.toLowerCase().includes("asesor")
          ? "Cliente pidió asesor"
          : row.quote_number
            ? "Cotización por convertir"
            : "Venta en recta final";
    const importanceReason = (row.human_requested ? "El cliente pidió atención de un asesor y aún requiere una respuesta humana." : null)
      ?? (row.customer_commitment ? `El cliente indicó: ${row.customer_commitment}` : null)
      ?? (row.quote_number ? `La cotización ${row.quote_number} sigue abierta y requiere el siguiente paso.` : null)
      ?? row.follow_up_reason
      ?? (bucket === "needs_human"
        ? "Pasaron 24 horas sin respuesta; un asesor debe decidir si continúa con plantilla o marca Perdido."
        : "Está en seguimiento hasta venta y todavía se puede concretar visita, reserva o compra.");
    return {
      id: row.job_id ? Number(row.job_id) : null,
      conversationId: Number(row.conversation_id),
      cycle: row.cycle,
      type: row.type,
      status: row.status,
      bucket,
      customer: row.name ?? row.phone,
      phone: row.phone,
      stage: row.stage,
      tireSize: row.tire_size,
      selectedProductCode: row.selected_product_code,
      summary: row.summary ?? row.last_message ?? "Conversación abierta esperando respuesta.",
      lastMessage: row.last_message,
      lastAt: row.last_at?.toISOString() ?? null,
      dueAt: row.due_at?.toISOString() ?? row.visit_date?.toISOString() ?? row.pickup_date?.toISOString() ?? null,
      windowClosesAt: row.window_closes_at?.toISOString() ?? null,
      preview: String(row.payload?.preview ?? ""),
      templateRequired: String(row.payload?.templateKey ?? row.template_name ?? "") || null,
      alertReason: row.cancel_reason,
      assignedTo: row.assigned_to,
      unansweredDays,
      commitment: row.customer_commitment,
      visitDate: row.visit_date?.toISOString() ?? null,
      pickupDate: row.pickup_date?.toISOString() ?? null,
      campaignId: row.campaign_id ? Number(row.campaign_id) : null,
      campaignTemplateKey: row.campaign_template_key,
      campaignPlan: row.campaign_plan ?? [],
      importanceLabel,
      importanceReason,
      discountCondition: row.discount_condition,
    };
  });
}

export async function listBotAlerts() {
  const rows = await sql<{
    id: number; conversation_id: number; type: string; priority: string;
    summary: string; exact_reason: string; suggested_action: string;
    status: string; snoozed_until: Date | null; created_at: Date;
    name: string | null; phone: string;
  }[]>`
    select a.*, c.name, c.phone from bot_alerts a
    join conversations c on c.id = a.conversation_id
    where a.status in ('open', 'snoozed')
      and (a.snoozed_until is null or a.snoozed_until <= now())
    order by case a.priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
      a.created_at desc
    limit 300
  `;
  return rows.map((row) => ({
    id: Number(row.id), conversationId: Number(row.conversation_id), type: row.type,
    priority: row.priority, summary: row.summary, exactReason: row.exact_reason,
    suggestedAction: row.suggested_action, status: row.status,
    snoozedUntil: row.snoozed_until?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), customer: row.name ?? row.phone,
  }));
}

export async function getFollowUpSettings() {
  const [policy] = await sql`select * from follow_up_policies where policy_key = 'default'`;
  const templates = await sql`select * from follow_up_templates order by template_key`;
  return { policy, templates };
}

export async function getFollowUpMetrics() {
  const [summary] = await sql<{
    scheduled: number; sent: number; responded: number; converted: number;
    cancelled_by_reply: number; missed_windows: number; opt_outs: number;
    negative: number; template_delivered: number; template_read: number;
    avg_response_seconds: string | number | null;
  }[]>`
    select
      count(*) filter (where j.status = 'scheduled')::int as scheduled,
      count(*) filter (where j.status = 'sent')::int as sent,
      count(distinct (j.conversation_id, j.cycle)) filter (where exists (
        select 1 from messages m where m.conversation_id = j.conversation_id
          and m.cycle = j.cycle and m.direction = 'inbound' and m.created_at > j.executed_at
      ))::int as responded,
      count(distinct (j.conversation_id, j.cycle)) filter (where exists (
        select 1 from sales_history h where h.conversation_id = j.conversation_id
          and h.cycle = j.cycle and h.outcome = 'ganado' and h.closed_at > j.executed_at
      ))::int as converted,
      count(*) filter (where j.cancel_reason = 'customer_replied')::int as cancelled_by_reply,
      count(*) filter (where j.cancel_reason = 'window_closed')::int as missed_windows,
      (select count(*)::int from conversations where opted_out_at is not null) as opt_outs,
      (select count(*)::int from conversations where negative_sentiment_at is not null) as negative,
      (select count(*)::int from follow_up_attempts where message_type = 'template' and status in ('delivered','read')) as template_delivered,
      (select count(*)::int from follow_up_attempts where message_type = 'template' and status = 'read') as template_read,
      avg(extract(epoch from (reply.created_at - j.executed_at))) filter (where reply.created_at is not null) as avg_response_seconds
    from follow_up_jobs j
    left join lateral (
      select created_at from messages where conversation_id = j.conversation_id
        and cycle = j.cycle and direction = 'inbound' and created_at > j.executed_at
      order by created_at limit 1
    ) reply on true
  `;
  const byStageAndType = await sql`
    select coalesce(j.payload->>'stage', 'unknown') as stage, j.type,
      count(*)::int as total,
      count(*) filter (where j.status = 'sent')::int as sent
    from follow_up_jobs j group by 1, 2 order by 1, 2
  `;
  return { ...summary, avg_response_seconds: summary.avg_response_seconds === null ? null : Number(summary.avg_response_seconds), byStageAndType };
}

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
    advisor_alert_days: number;
  }[]>`
    select j.id as job_id, c.id as conversation_id, c.current_cycle as cycle,
      j.type, j.status, j.due_at, j.window_closes_at, j.payload, j.cancel_reason,
      c.name, c.phone, c.stage, c.assigned_to, c.tire_size,
      c.selected_product_code, m.content as last_message, m.created_at as last_at,
      s.summary, t.template_name, c.last_customer_message_at,
      coalesce(c.customer_commitment, s.customer_commitment) as customer_commitment,
      c.visit_date, c.pickup_date, p.advisor_alert_days
    from conversations c
    left join lateral (
      select * from follow_up_jobs
      where conversation_id = c.id and cycle = c.current_cycle
      order by
        case status when 'processing' then 0 when 'blocked' then 1 when 'scheduled' then 2 else 3 end,
        due_at asc
      limit 1
    ) j on true
    left join lateral (
      select content, created_at from messages where conversation_id = c.id
      order by created_at desc limit 1
    ) m on true
    left join conversation_summaries s on s.conversation_id = c.id and s.cycle = c.current_cycle
    left join follow_up_templates t on t.template_key = j.payload->>'templateKey'
    cross join follow_up_policies p
    where (c.status = 'open' or j.status in ('failed', 'cancelled'))
      and p.policy_key = 'default'
    order by coalesce(j.due_at, m.created_at, c.updated_at) asc
    limit 500
  `;
  const now = new Date();
  return rows.map((row) => {
    const due = row.due_at;
    const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(now);
    const dueDay = due ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(due) : null;
    const unansweredDays = row.last_customer_message_at
      ? Math.max(0, Math.floor((now.getTime() - row.last_customer_message_at.getTime()) / 86_400_000))
      : 0;
    const hasCommitment = Boolean(row.customer_commitment || row.visit_date || row.pickup_date);
    let bucket = "scheduled";
    if (row.assigned_to === "human" || unansweredDays >= row.advisor_alert_days) bucket = "human_review";
    else if (row.status === "failed" || row.status === "cancelled") bucket = "cancelled_failed";
    else if (row.status === "blocked" || (row.window_closes_at && now >= row.window_closes_at)) bucket = "window_closed";
    else if (due && due <= now) bucket = "attention_now";
    else if (hasCommitment) bucket = "commitments";
    else if (dueDay === localToday) bucket = "today";
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
      dueAt: row.due_at?.toISOString() ?? null,
      windowClosesAt: row.window_closes_at?.toISOString() ?? null,
      preview: String(row.payload?.preview ?? ""),
      templateRequired: String(row.payload?.templateKey ?? row.template_name ?? "") || null,
      alertReason: row.cancel_reason,
      assignedTo: row.assigned_to,
      unansweredDays,
      commitment: row.customer_commitment,
      visitDate: row.visit_date?.toISOString() ?? null,
      pickupDate: row.pickup_date?.toISOString() ?? null,
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

import { sql } from "../db/client.js";
import type { Stage } from "../domain/pipeline.js";

interface QuoteRow {
  id: number;
  items: unknown;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  original_total: string | number | null;
  discount_amount: string | number | null;
  discount_reason: string | null;
  discount_condition: string | null;
}

interface TicketRow {
  id: number;
  phone: string;
  name: string | null;
  stage: Stage;
  status: "open" | "closed";
  assigned_to: "bot" | "human";
  unread_count: number;
  tire_size: string | null;
  vehicle: string | null;
  closed_reason: string | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_message: string | null;
  last_at: Date | null;
  quote: QuoteRow | null;
  notes: string[] | null;
  won_count: number;
  customer_opt_in: boolean;
  opted_out_at: Date | null;
  customer_commitment: string | null;
  pickup_date: Date | null;
  visit_date: Date | null;
  offer_expires_at: Date | null;
  nearest_store: string | null;
  summary: string | null;
  customer_need: string | null;
  options_discussed: unknown;
  selected_option: string | null;
  follow_up_reason: string | null;
  next_follow_up: { id: number; dueAt: string; status: string; preview: string; templateKey: string | null; windowClosesAt: string | null } | null;
  follow_up_plan: unknown[] | null;
  follow_up_history: unknown[] | null;
  last_customer_message_at: Date | null;
  active_discount: Record<string, unknown> | null;
}

export async function listHubTickets() {
  const rows = await sql<TicketRow[]>`
    select
      c.id, c.phone, c.name, c.stage, c.status, c.assigned_to, c.unread_count,
      c.tire_size, c.vehicle, c.closed_reason, c.closed_at, c.created_at, c.updated_at,
      c.customer_opt_in, c.opted_out_at, c.customer_commitment, c.pickup_date,
      c.visit_date, c.offer_expires_at, c.nearest_store, c.last_customer_message_at,
      m.content as last_message, m.created_at as last_at,
      case when q.id is null then null else jsonb_build_object(
        'id', q.id, 'items', q.items, 'subtotal', q.subtotal, 'tax', q.tax, 'total', q.total,
        'original_total', q.original_total, 'discount_amount', q.discount_amount,
        'discount_reason', q.discount_reason, 'discount_condition', q.discount_condition
      ) end as quote,
      s.summary, s.customer_need, s.options_discussed, s.selected_option,
      coalesce(s.follow_up_reason, c.follow_up_reason) as follow_up_reason,
      case when j.id is null then null else jsonb_build_object(
        'id', j.id, 'dueAt', j.due_at, 'status', j.status,
        'preview', coalesce(j.payload->>'preview', ''),
        'templateKey', j.payload->>'templateKey', 'windowClosesAt', j.window_closes_at
      ) end as next_follow_up,
      coalesce(p.plan, '[]'::jsonb) as follow_up_plan,
      coalesce(h.history, '[]'::jsonb) as follow_up_history,
      d.offer as active_discount,
      coalesce(n.notes, '[]'::jsonb) as notes,
      (
        select count(*)::int from sales_history history
        where history.conversation_id = c.id and history.outcome = 'ganado'
          and history.cycle < c.current_cycle
      ) as won_count
    from conversations c
    left join lateral (
      select content, created_at
      from messages
      where conversation_id = c.id and type <> 'note'
      order by created_at desc
      limit 1
    ) m on true
    left join lateral (
      select id, items, subtotal, tax, total, original_total, discount_amount,
        discount_reason, discount_condition
      from quotes
      where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc
      limit 1
    ) q on true
    left join conversation_summaries s on s.conversation_id = c.id and s.cycle = c.current_cycle
    left join lateral (
      select id, due_at, status, payload, window_closes_at from follow_up_jobs
      where conversation_id = c.id and cycle = c.current_cycle
        and status in ('scheduled', 'processing', 'blocked')
      order by due_at limit 1
    ) j on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', jobs.id, 'type', jobs.type, 'channel', jobs.channel,
        'dueAt', jobs.due_at, 'status', jobs.status,
        'preview', coalesce(jobs.payload->>'preview',''),
        'templateKey', jobs.payload->>'templateKey',
        'windowClosesAt', jobs.window_closes_at,
        'reason', jobs.payload->>'reason'
      ) order by jobs.due_at) as plan
      from follow_up_jobs jobs where jobs.conversation_id=c.id and jobs.cycle=c.current_cycle
        and jobs.status in ('scheduled','processing','blocked')
    ) p on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'type', jobs.type, 'status', a.status,
        'createdAt', a.created_at, 'sentAt', a.sent_at,
        'deliveredAt', a.delivered_at, 'readAt', a.read_at,
        'error', a.error
      ) order by a.created_at desc) as history
      from follow_up_attempts a join follow_up_jobs jobs on jobs.id = a.job_id
      where a.conversation_id = c.id and a.cycle = c.current_cycle
    ) h on true
    left join lateral (
      select jsonb_agg(content order by created_at) as notes
      from conversation_notes
      where conversation_id = c.id
    ) n on true
    left join lateral (
      select jsonb_build_object(
        'id', o.id, 'amount', o.discount_amount_cents::numeric / 100,
        'finalTotal', o.final_total_cents::numeric / 100, 'reason', o.reason,
        'condition', o.condition_text, 'status', o.status, 'expiresAt', o.expires_at
      ) as offer
      from discount_offers o where o.conversation_id=c.id and o.cycle=c.current_cycle
        and o.status in ('approved','offered','accepted')
        and (o.expires_at is null or o.expires_at > now())
      order by o.created_at desc limit 1
    ) d on true
    order by coalesce(m.created_at, c.updated_at) desc
    limit 500
  `;

  return rows.map((row) => ({
    id: Number(row.id),
    telefono: row.phone,
    nombre: row.name,
    estado: row.status === "closed" ? "cerrado" : "abierto",
    etapa: row.stage,
    cierre:
      row.stage === "ganado"
        ? "ganado"
        : row.stage === "perdido"
          ? row.closed_reason === "sin_respuesta"
            ? "sin_respuesta"
            : "perdido"
          : undefined,
    cerradoEn: row.closed_at?.toISOString(),
    atiende: row.assigned_to === "human" ? "humano" : "bot",
    medida: row.tire_size ?? undefined,
    vehiculo: row.vehicle ?? undefined,
    cotizacion: row.quote ? publicQuote(row.quote) : undefined,
    esRecurrente: row.won_count > 0,
    comprasAnteriores: Number(row.won_count),
    sinLeer: Number(row.unread_count),
    notas: row.notes ?? [],
    creadoEn: row.created_at.toISOString(),
    ultimaActividad: (row.last_at ?? row.updated_at).toISOString(),
    ultimoMensaje: row.last_message ?? "Conversación iniciada",
    resumen: row.summary ?? undefined,
    queBusca: row.customer_need ?? undefined,
    opcionesComparadas: Array.isArray(row.options_discussed) ? row.options_discussed : [],
    opcionElegida: row.selected_option ?? undefined,
    compromisoCliente: row.customer_commitment ?? undefined,
    pickupDate: row.pickup_date?.toISOString(),
    visitDate: row.visit_date?.toISOString(),
    offerExpiresAt: row.offer_expires_at?.toISOString(),
    localCercano: row.nearest_store ?? undefined,
    followUpReason: row.follow_up_reason ?? undefined,
    customerOptIn: row.customer_opt_in,
    optedOutAt: row.opted_out_at?.toISOString(),
    proximoSeguimiento: row.next_follow_up,
    planSeguimientos: row.follow_up_plan ?? [],
    mensajeRecomendadoHumano: row.next_follow_up?.preview ?? undefined,
    descuentoActivo: row.active_discount ?? undefined,
    historialSeguimientos: row.follow_up_history ?? [],
    ventanaCierraEn: row.last_customer_message_at
      ? new Date(row.last_customer_message_at.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  }));
}

export async function getHubMessages(conversationId: number) {
  const rows = await sql<
    {
      id: number;
      role: "user" | "assistant" | "system";
      author_kind: string | null;
      type: string;
      content: string;
      status: string | null;
      created_at: Date;
      metadata: Record<string, unknown> | null;
    }[]
  >`
    select id, role, author_kind, type, content, status, created_at, metadata
    from messages
    where conversation_id = ${conversationId} and type <> 'note'
    order by created_at asc
    limit 1000
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    ticketId: conversationId,
    rol:
      row.role === "user"
        ? "cliente"
        : row.author_kind === "owner"
          ? "vendedor"
          : "bot",
    tipo: row.type === "pdf" ? "pdf" : row.type === "location" ? "ubicacion" : "texto",
    contenido: row.content,
    estado: row.status ?? undefined,
    metadata: row.metadata ?? {},
    hora: row.created_at.toISOString(),
  }));
}

export async function getHubFeed() {
  const rows = await sql<
    {
      id: number;
      type: string;
      data: Record<string, unknown> | null;
      created_at: Date;
      conversation_id: number;
      name: string | null;
      phone: string;
    }[]
  >`
    select f.id, f.type, f.data, f.created_at, f.conversation_id, c.name, c.phone
    from funnel_events f
    join conversations c on c.id = f.conversation_id
    order by f.created_at desc
    limit 100
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    icono: feedIcon(row.type),
    texto: feedText(row.type, row.name ?? row.phone, row.data),
    hora: row.created_at.toISOString(),
    ticketId: Number(row.conversation_id),
  }));
}

export async function getHubMetrics(days = 14) {
  const [summary] = await sql<
    {
      open_count: number;
      quoted_count: number;
      won_count: number;
      pipeline_value: string | number;
      won_value: string | number;
      first_response_seconds: string | number | null;
    }[]
  >`
    select
      count(*) filter (where c.status = 'open')::int as open_count,
      count(*) filter (where exists (
        select 1 from quotes q where q.conversation_id = c.id and q.cycle = c.current_cycle
      ))::int as quoted_count,
      (
        select count(*)::int from sales_history
        where outcome = 'ganado' and closed_at >= date_trunc('month', now())
      ) as won_count,
      coalesce(sum(q.total) filter (where c.status = 'open'), 0) as pipeline_value,
      (
        select coalesce(sum(total), 0) from sales_history
        where outcome = 'ganado' and closed_at >= date_trunc('month', now())
      ) as won_value,
      (
        select percentile_cont(0.5) within group (
          order by extract(epoch from (first_out.created_at - first_in.created_at))
        )
        from conversations response_c
        join lateral (
          select created_at from messages
          where conversation_id = response_c.id and direction = 'inbound'
          order by created_at asc limit 1
        ) first_in on true
        join lateral (
          select created_at from messages
          where conversation_id = response_c.id and direction = 'outbound'
            and created_at >= first_in.created_at
          order by created_at asc limit 1
        ) first_out on true
      ) as first_response_seconds
    from conversations c
    left join lateral (
      select total from quotes
      where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc limit 1
    ) q on true
  `;

  const daily = await sql<{ day: string; count: number }[]>`
    select to_char(day, 'YYYY-MM-DD') as day, count(c.id)::int as count
    from generate_series(
      current_date - (${days - 1}::int),
      current_date,
      interval '1 day'
    ) day
    left join conversations c
      on c.created_at >= day and c.created_at < day + interval '1 day'
    group by day
    order by day
  `;

  const funnel = await sql<{ stage: Stage; count: number }[]>`
    with cycles as (
      select id as conversation_id, current_cycle as cycle from conversations
      union
      select conversation_id, cycle from stage_transitions
      union
      select conversation_id, cycle from sales_history
    ), observed as (
      select id as conversation_id, current_cycle as cycle, stage from conversations
      union all
      select conversation_id, cycle, to_stage as stage from stage_transitions
    ), progress as (
      select
        cy.conversation_id,
        cy.cycle,
        coalesce(max(case o.stage
          when 'medida_confirmada' then 1
          when 'seleccionando' then 2
          when 'cotizacion_enviada' then 3
          when 'seguimiento_venta' then 4
          when 'ganado' then 5
          else 0
        end), 0) as max_rank,
        exists (
          select 1 from sales_history sh
          where sh.conversation_id = cy.conversation_id and sh.cycle = cy.cycle
            and sh.outcome = 'ganado'
        ) or exists (
          select 1 from conversations current_c
          where current_c.id = cy.conversation_id and current_c.current_cycle = cy.cycle
            and current_c.stage = 'ganado'
        ) as won
      from cycles cy
      left join observed o on o.conversation_id = cy.conversation_id and o.cycle = cy.cycle
      group by cy.conversation_id, cy.cycle
    ), stages(stage, rank) as (
      values
        ('nuevo'::text, 0),
        ('medida_confirmada'::text, 1),
        ('seleccionando'::text, 2),
        ('cotizacion_enviada'::text, 3),
        ('seguimiento_venta'::text, 4),
        ('ganado'::text, 5)
    )
    select stages.stage, count(*) filter (
      where (stages.stage = 'ganado' and progress.won)
         or (stages.stage <> 'ganado' and progress.max_rank >= stages.rank)
    )::int as count
    from stages cross join progress
    group by stages.stage, stages.rank
    order by stages.rank
  `;

  const deliveries = await sql<{ status: string; count: number }[]>`
    select coalesce(status, 'unknown') as status, count(*)::int as count
    from messages
    where direction = 'outbound'
    group by coalesce(status, 'unknown')
  `;

  const [discounts] = await sql<{
    offered: number; won_with: number; quoted_without: number; won_without: number;
    total_discount: string | number; avg_days_to_win_with: string | number | null;
    avg_days_to_win_without: string | number | null; avg_hours_to_reply: string | number | null;
  }[]>`
    with offered as (
      select conversation_id, cycle, min(created_at) as offered_at,
        max(discount_amount_cents) as discount_cents
      from discount_offers where status in ('approved','offered','accepted','superseded')
      group by conversation_id, cycle
    ), quoted as (
      select conversation_id, cycle, min(created_at) as quoted_at
      from quotes group by conversation_id, cycle
    )
    select
      (select count(*)::int from offered) as offered,
      (select count(*)::int from offered o join sales_history s using (conversation_id,cycle) where s.outcome='ganado') as won_with,
      (select count(*)::int from quoted q where not exists (select 1 from offered o where o.conversation_id=q.conversation_id and o.cycle=q.cycle)) as quoted_without,
      (select count(*)::int from quoted q join sales_history s using (conversation_id,cycle)
        where s.outcome='ganado' and not exists (select 1 from offered o where o.conversation_id=q.conversation_id and o.cycle=q.cycle)) as won_without,
      coalesce((select sum(discount_cents)::numeric / 100 from offered),0) as total_discount,
      (select avg(extract(epoch from (s.closed_at-o.offered_at))/86400) from offered o join sales_history s using (conversation_id,cycle) where s.outcome='ganado') as avg_days_to_win_with,
      (select avg(extract(epoch from (s.closed_at-q.quoted_at))/86400) from quoted q join sales_history s using (conversation_id,cycle)
        where s.outcome='ganado' and not exists (select 1 from offered o where o.conversation_id=q.conversation_id and o.cycle=q.cycle)) as avg_days_to_win_without,
      (select avg(extract(epoch from (reply.created_at-o.offered_at))/3600)
        from offered o join lateral (select created_at from messages m where m.conversation_id=o.conversation_id and m.cycle=o.cycle and m.direction='inbound' and m.created_at>o.offered_at order by m.created_at limit 1) reply on true) as avg_hours_to_reply
  `;

  return {
    summary: {
      abiertos: Number(summary?.open_count ?? 0),
      cotizaciones: Number(summary?.quoted_count ?? 0),
      ganados: Number(summary?.won_count ?? 0),
      enJuego: Number(summary?.pipeline_value ?? 0),
      vendido: Number(summary?.won_value ?? 0),
      primeraRespuestaSegundos:
        summary?.first_response_seconds == null
          ? null
          : Math.round(Number(summary.first_response_seconds)),
    },
    daily: daily.map((row) => ({ day: row.day, value: Number(row.count) })),
    funnel: funnel.map((row) => ({ stage: row.stage, value: Number(row.count) })),
    deliveries: deliveries.map((row) => ({
      status: row.status,
      value: Number(row.count),
    })),
    discounts: {
      offered: Number(discounts?.offered ?? 0), wonWith: Number(discounts?.won_with ?? 0),
      quotedWithout: Number(discounts?.quoted_without ?? 0), wonWithout: Number(discounts?.won_without ?? 0),
      conversionWith: Number(discounts?.offered ?? 0) ? Number(discounts?.won_with ?? 0) / Number(discounts.offered) : 0,
      conversionWithout: Number(discounts?.quoted_without ?? 0) ? Number(discounts?.won_without ?? 0) / Number(discounts.quoted_without) : 0,
      totalDiscount: Number(discounts?.total_discount ?? 0),
      avgDaysToWinWith: discounts?.avg_days_to_win_with == null ? null : Number(discounts.avg_days_to_win_with),
      avgDaysToWinWithout: discounts?.avg_days_to_win_without == null ? null : Number(discounts.avg_days_to_win_without),
      avgHoursToReply: discounts?.avg_hours_to_reply == null ? null : Number(discounts.avg_hours_to_reply),
    },
  };
}

function publicQuote(row: QuoteRow) {
  const rawItems = Array.isArray(row.items) ? row.items : [];
  return {
    numero: Number(row.id),
    items: rawItems.map((item) => {
      const value = item as Record<string, unknown>;
      return {
        descripcion: String(value.description ?? value.descripcion ?? "Llanta"),
        cantidad: Number(value.quantity ?? value.cantidad ?? 1),
        precioUnit: Number(value.unitPrice ?? value.precioUnit ?? 0),
      };
    }),
    subtotal: Number(row.subtotal),
    iva: Number(row.tax),
    total: Number(row.total),
    originalTotal: row.original_total == null ? undefined : Number(row.original_total),
    discountAmount: row.discount_amount == null ? undefined : Number(row.discount_amount),
    discountReason: row.discount_reason ?? undefined,
    discountCondition: row.discount_condition ?? undefined,
  };
}

function feedIcon(type: string): string {
  if (type === "cotizacion") return "📄";
  if (type === "etapa") return "🏁";
  if (type === "primer_mensaje") return "💬";
  return "•";
}

function feedText(
  type: string,
  customer: string,
  data: Record<string, unknown> | null,
): string {
  if (type === "cotizacion") return `${customer} recibió una cotización`;
  if (type === "primer_mensaje") return `${customer} inició una conversación`;
  if (type === "etapa") {
    return `${customer} avanzó a ${String(data?.stage ?? "otra etapa").replaceAll("_", " ")}`;
  }
  return `${customer}: ${type.replaceAll("_", " ")}`;
}

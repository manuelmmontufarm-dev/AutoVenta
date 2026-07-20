import { sql } from "../db/client.js";
import type { Stage } from "../domain/pipeline.js";

interface QuoteRow {
  id: number;
  items: unknown;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
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
}

export async function listHubTickets() {
  const rows = await sql<TicketRow[]>`
    select
      c.id, c.phone, c.name, c.stage, c.status, c.assigned_to, c.unread_count,
      c.tire_size, c.vehicle, c.closed_reason, c.closed_at, c.created_at, c.updated_at,
      m.content as last_message, m.created_at as last_at,
      case when q.id is null then null else jsonb_build_object(
        'id', q.id, 'items', q.items, 'subtotal', q.subtotal, 'tax', q.tax, 'total', q.total
      ) end as quote,
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
      select id, items, subtotal, tax, total
      from quotes
      where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc
      limit 1
    ) q on true
    left join lateral (
      select jsonb_agg(content order by created_at) as notes
      from conversation_notes
      where conversation_id = c.id
    ) n on true
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
    sinLeer: Number(row.unread_count),
    notas: row.notes ?? [],
    creadoEn: row.created_at.toISOString(),
    ultimaActividad: (row.last_at ?? row.updated_at).toISOString(),
    ultimoMensaje: row.last_message ?? "Conversación iniciada",
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
          when 'handoff_visita' then 4
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
        ('handoff_visita'::text, 4),
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

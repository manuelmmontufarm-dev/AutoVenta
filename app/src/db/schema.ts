/**
 * Esquema como string (no como .sql suelto) para que corra al arrancar sin
 * depender de copiar archivos a dist/. Modelo inspirado en horoshi10v/tires-shop (MIT).
 * Todo es idempotente (`create if not exists`) → seguro en cada boot.
 */
import { sql } from "./client.js";

export const SCHEMA = /* sql */ `
create table if not exists conversations (
  id              bigserial primary key,
  phone           text not null unique,
  name            text,
  stage           text not null default 'nuevo',
  bot_paused_until timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table conversations add column if not exists status text not null default 'open';
alter table conversations add column if not exists assigned_to text not null default 'bot';
alter table conversations add column if not exists unread_count integer not null default 0;
alter table conversations add column if not exists tire_size text;
alter table conversations add column if not exists vehicle text;
alter table conversations add column if not exists closed_reason text;
alter table conversations add column if not exists closed_at timestamptz;
alter table conversations add column if not exists last_customer_message_at timestamptz;
alter table conversations add column if not exists last_assistant_message_at timestamptz;
alter table conversations add column if not exists current_cycle integer not null default 1;
alter table conversations add column if not exists selected_product_code text;
alter table conversations add column if not exists selected_quantity integer;
alter table conversations add column if not exists location_label text;
alter table conversations add column if not exists nearest_store text;

-- Migración de las etapas históricas al pipeline canónico.
update conversations
set stage = case stage
  when 'conversando' then 'nuevo'
  when 'cotizado' then 'cotizacion_enviada'
  when 'alerta' then 'handoff_visita'
  when 'cerrado' then 'ganado'
  else stage
end
where stage in ('conversando', 'cotizado', 'alerta', 'cerrado');

create table if not exists messages (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  wa_message_id   text unique,
  created_at      timestamptz not null default now()
);

alter table messages add column if not exists direction text;
alter table messages add column if not exists type text not null default 'text';
alter table messages add column if not exists status text;
alter table messages add column if not exists author_kind text;
alter table messages add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table messages add column if not exists sent_at timestamptz;
alter table messages add column if not exists delivered_at timestamptz;
alter table messages add column if not exists read_at timestamptz;
alter table messages add column if not exists failed_at timestamptz;
alter table messages add column if not exists cycle integer not null default 1;

update messages
set direction = case when role = 'user' then 'inbound' else 'outbound' end,
    author_kind = case when role = 'user' then 'customer' else 'bot' end
where direction is null or author_kind is null;

create index if not exists messages_conversation_idx
  on messages (conversation_id, created_at);
create index if not exists messages_status_idx on messages (status, created_at);

create table if not exists quotes (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  items           jsonb not null,
  subtotal        numeric(10,2) not null,
  tax             numeric(10,2) not null,
  total           numeric(10,2) not null,
  created_at      timestamptz not null default now()
);
alter table quotes add column if not exists cycle integer not null default 1;
alter table quotes add column if not exists quote_number text;
alter table quotes add column if not exists sale_number text;
update quotes
set quote_number = coalesce(quote_number, 'COT-' || to_char(created_at, 'YYYYMMDD') || '-' || lpad(id::text, 4, '0')),
    sale_number = coalesce(sale_number, 'AV-' || lpad(id::text, 6, '0'));

create table if not exists funnel_events (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  type            text not null,
  data            jsonb,
  created_at      timestamptz not null default now()
);
alter table funnel_events add column if not exists cycle integer not null default 1;

create index if not exists funnel_events_type_idx on funnel_events (type, created_at);

create table if not exists stage_transitions (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  from_stage      text,
  to_stage        text not null,
  actor           text not null default 'system',
  reason          text,
  created_at      timestamptz not null default now()
);
alter table stage_transitions add column if not exists cycle integer not null default 1;

create index if not exists stage_transitions_conversation_idx
  on stage_transitions (conversation_id, created_at);

create table if not exists conversation_notes (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  content         text not null,
  author          text not null default 'owner',
  created_at      timestamptz not null default now()
);

create table if not exists message_status_events (
  id              bigserial primary key,
  message_id      bigint references messages(id) on delete cascade,
  provider_id     text not null,
  status          text not null,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists message_status_provider_idx
  on message_status_events (provider_id, created_at);

create table if not exists stage_prompt_versions (
  id              bigserial primary key,
  stage           text not null,
  version         integer not null,
  status          text not null default 'draft',
  objective       text not null default '',
  prompt          text not null default '',
  allowed_tools   jsonb not null default '[]'::jsonb,
  settings        jsonb not null default '{}'::jsonb,
  created_by      text not null default 'owner',
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  unique(stage, version)
);

create unique index if not exists stage_prompt_one_published_idx
  on stage_prompt_versions (stage) where status = 'published';

create table if not exists ai_runs (
  id                bigserial primary key,
  conversation_id   bigint references conversations(id) on delete set null,
  stage             text,
  prompt_version_id bigint references stage_prompt_versions(id) on delete set null,
  model             text not null,
  latency_ms        integer,
  input_tokens      integer,
  output_tokens     integer,
  tools             jsonb not null default '[]'::jsonb,
  error             text,
  created_at        timestamptz not null default now()
);

create table if not exists quote_artifacts (
  id              bigserial primary key,
  conversation_id bigint references conversations(id) on delete set null,
  quote_id        bigint references quotes(id) on delete set null,
  kind            text not null,
  products        jsonb not null,
  filename        text,
  provider_id     text,
  created_at      timestamptz not null default now()
);
alter table quote_artifacts add column if not exists cycle integer not null default 1;

create table if not exists sales_history (
  id                    bigserial primary key,
  conversation_id       bigint not null references conversations(id) on delete cascade,
  cycle                  integer not null,
  outcome                text not null check (outcome in ('ganado', 'perdido')),
  reason                 text,
  tire_size              text,
  vehicle                text,
  selected_product_code  text,
  selected_quantity      integer,
  quote_id                bigint references quotes(id) on delete set null,
  quote_number            text,
  sale_number             text,
  total                   numeric(10,2),
  closed_at               timestamptz not null default now(),
  unique (conversation_id, cycle)
);

create index if not exists sales_history_outcome_idx
  on sales_history (outcome, closed_at);

-- Corrige cierres antiguos mal clasificados cuando el propio cliente confirmó
-- en el chat que la compra ya se realizó (caso observado en staging).
update conversations c
set stage = 'ganado',
    status = 'closed',
    closed_reason = 'Cliente confirmó explícitamente que la compra fue realizada',
    closed_at = coalesce(c.closed_at, now())
where exists (
  select 1 from messages m
  where m.conversation_id = c.id and m.role = 'user'
    and lower(m.content) ~ '(ya[[:space:]]+.*compr|acabo de comprar|ya pagu|compra (hecha|realizada))'
);

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
where c.status = 'closed'
on conflict (conversation_id, cycle) do nothing;

create table if not exists product_media (
  id bigserial primary key,
  brand text not null,
  design text not null,
  public_url text,
  source_url text not null,
  source_label text not null,
  rights_status text not null default 'pending'
    check (rights_status in ('pending', 'approved', 'restricted')),
  sha256 text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, design)
);

create index if not exists product_media_review_idx
  on product_media (rights_status, verified_at);

create table if not exists audit_events (
  id              bigserial primary key,
  actor           text not null default 'system',
  action          text not null,
  entity_type     text not null,
  entity_id       text,
  before_value    jsonb,
  after_value     jsonb,
  created_at      timestamptz not null default now()
);

-- Ajustes persistentes (configuración de IA del hub, etc.)
create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
`;

/** Aplica el esquema (idempotente). Se llama al arrancar el bot. */
export async function ensureSchema(): Promise<void> {
  await sql.unsafe(SCHEMA);
}

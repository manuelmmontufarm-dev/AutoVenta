-- Esquema AutoVenta (Postgres / Supabase).
-- Modelo de dominio inspirado en horoshi10v/tires-shop (MIT).

create table if not exists conversations (
  id              bigserial primary key,
  phone           text not null unique,          -- wa_id del cliente
  name            text,
  -- Etapa del funnel: nuevo → conversando → cotizado → alerta → cerrado / perdido
  stage           text not null default 'nuevo',
  -- Handoff a humano: si el dueño responde a mano, el bot se silencia hasta esta hora
  bot_paused_until timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists messages (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  -- id del mensaje de WhatsApp: clave de idempotencia (Meta reintenta webhooks)
  wa_message_id   text unique,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on messages (conversation_id, created_at);

create table if not exists quotes (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  items           jsonb not null,                -- [{code, descripcion, cantidad, precioUnit}]
  subtotal        numeric(10,2) not null,
  tax             numeric(10,2) not null,
  total           numeric(10,2) not null,
  created_at      timestamptz not null default now()
);

-- Eventos del funnel para el dashboard (cuántos escribieron, cotizados, alertas…)
create table if not exists funnel_events (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  type            text not null,                 -- primer_mensaje | cotizacion | alerta_vendedor | etapa
  data            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists funnel_events_type_idx on funnel_events (type, created_at);

-- Ajustes persistentes (configuración de IA del hub, etc.)
create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

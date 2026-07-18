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

create table if not exists messages (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  wa_message_id   text unique,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on messages (conversation_id, created_at);

create table if not exists quotes (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  items           jsonb not null,
  subtotal        numeric(10,2) not null,
  tax             numeric(10,2) not null,
  total           numeric(10,2) not null,
  created_at      timestamptz not null default now()
);

create table if not exists funnel_events (
  id              bigserial primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  type            text not null,
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
`;

/** Aplica el esquema (idempotente). Se llama al arrancar el bot. */
export async function ensureSchema(): Promise<void> {
  await sql.unsafe(SCHEMA);
}

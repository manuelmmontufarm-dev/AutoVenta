/**
 * Esquema como string (no como .sql suelto) para que corra al arrancar sin
 * depender de copiar archivos a dist/. Modelo inspirado en horoshi10v/tires-shop (MIT).
 * Todo es idempotente (`create if not exists`) → seguro en cada boot.
 */
import { sql } from "./client.js";
import { runFollowUpMigration } from "./migrations/001_follow_up_system.js";
import { runSalesPlanDiscountsMigration } from "./migrations/002_sales_follow_up_plan_discounts.js";
import { runFollowUpStagePromptsMigration } from "./migrations/003_follow_up_stage_prompts.js";
import { runOpportunityCampaignsPendingDiscountsMigration } from "./migrations/004_opportunity_campaigns_pending_discounts.js";
import { runConversationMemoryDiscountDeliveryMigration } from "./migrations/005_conversation_memory_discount_delivery.js";
import { runCycleContextQualityMigration } from "./migrations/006_cycle_context_quality.js";
import { runAdvisorNotificationsMigration } from "./migrations/007_advisor_notifications.js";
import { runBenefitsMigration } from "./migrations/008_benefits.js";
import { runBrandProfilesMigration } from "./migrations/009_brand_profiles.js";
import { runAdvisorsMigration } from "./migrations/010_advisors.js";
import { runVentaPrimeroMigration } from "./migrations/011_venta_primero.js";
import { runAroFotoVisitaMigration } from "./migrations/012_aro_foto_y_visita.js";
import { runAvisosEntregadosMigration } from "./migrations/013_avisos_entregados.js";
import { runVenderEnTodaEtapaMigration } from "./migrations/014_vender_en_toda_etapa.js";
import { runVentanaAsesoresMigration } from "./migrations/015_ventana_asesores.js";
import { runCumplirSolicitudMigration } from "./migrations/016_cumplir_solicitud_y_cierre.js";
import { runRolesDeAsesorMigration } from "./migrations/018_roles_de_asesor.js";
import { runConfirmationCouponsMigration } from "./migrations/017_confirmation_coupons.js";
import { runFranjaDeVisitaMigration } from "./migrations/019_franja_de_visita.js";
import { runAsesorEnTodaEtapaMigration } from "./migrations/020_asesor_en_toda_etapa.js";

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
alter table conversations add column if not exists vehicle_year integer;
alter table conversations add column if not exists closed_reason text;
alter table conversations add column if not exists closed_at timestamptz;
alter table conversations add column if not exists last_customer_message_at timestamptz;
alter table conversations add column if not exists last_assistant_message_at timestamptz;
alter table conversations add column if not exists current_cycle integer not null default 1;
alter table conversations add column if not exists bot_resume_in_progress boolean not null default false;
alter table conversations add column if not exists selected_product_code text;
alter table conversations add column if not exists selected_quantity integer;
alter table conversations add column if not exists location_label text;
alter table conversations add column if not exists nearest_store text;
-- El asesor la dejó "para después" en el modo revisión: seguimiento prioritario
-- que el tab Oportunidades pinta arriba de todo hasta cerrarla o soltarla.
alter table conversations add column if not exists review_later_at timestamptz;

-- Migración de las etapas históricas al pipeline canónico.
update conversations
set stage = case stage
  when 'conversando' then 'nuevo'
  when 'cotizado' then 'cotizacion_enviada'
  when 'alerta' then 'seguimiento_venta'
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
alter table ai_runs add column if not exists cached_input_tokens integer not null default 0;
alter table ai_runs add column if not exists reasoning_tokens integer not null default 0;
alter table ai_runs add column if not exists iterations integer not null default 1;
alter table ai_runs add column if not exists route text;
alter table ai_runs add column if not exists call_type text not null default 'chat';

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

-- Cuenta mensual del servicio: un registro por mes facturado ('YYYY-MM').
-- El snapshot congela los montos al momento de marcar pagado, para que el
-- historial no cambie si después se ajustan tarifas.
create table if not exists billing_months (
  period     text primary key,
  paid_at    timestamptz,
  paid_by    text,
  snapshot   jsonb,
  created_at timestamptz not null default now()
);

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

-- El Ángel Guardián: una fila por respuesta revisada, aprobada o corregida.
-- Es el registro con el que, al final de la semana, se arma la lista
-- documentada de errores del bot (ver services/guardian.ts).
create table if not exists guardian_reviews (
  id              bigserial primary key,
  conversation_id bigint references conversations(id) on delete cascade,
  cycle           integer not null default 1,
  model           text not null,
  verdict         text not null,
  findings        jsonb not null default '[]'::jsonb,
  original_text   text not null,
  corrected_text  text,
  latency_ms      integer,
  created_at      timestamptz not null default now()
);
create index if not exists guardian_reviews_created_idx on guardian_reviews (created_at);

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

-- Ajuste único solicitado para el piloto; después de esta migración la opción
-- vuelve a quedar totalmente controlada desde Account Settings.
with migration as (
  insert into settings (key, value)
  values ('migration_more_emojis_v1', 'true'::jsonb)
  on conflict (key) do nothing
  returning key
)
update settings
set value = jsonb_set(value, '{emojis}', '"muchos"'::jsonb, true),
    updated_at = now()
where key = 'ai_config' and exists (select 1 from migration);

-- Vuelta atrás de la anterior: el cliente reportó que los mensajes del bot se
-- leen como muros y nadie los abre. Un emoji por bloque, no tres. Igual que la
-- de arriba, corre una sola vez y después el dueño manda desde el panel.
with migration as (
  insert into settings (key, value)
  values ('migration_fewer_emojis_v2', 'true'::jsonb)
  on conflict (key) do nothing
  returning key
)
update settings
set value = jsonb_set(value, '{emojis}', '"pocos"'::jsonb, true),
    updated_at = now()
where key = 'ai_config' and exists (select 1 from migration);

-- La personalidad de producción fijaba «un solo mensaje», pero el cierre real
-- separa la pregunta para que no se pierda. Se retira solo esa configuración
-- histórica, una vez; después el dueño vuelve a mandar desde Ajustes.
with migration as (
  insert into settings (key, value)
  values ('migration_prompt_administrable_v1', 'true'::jsonb)
  on conflict (key) do nothing
  returning key
)
update settings
set value = jsonb_set(
      value,
      '{personalidad}',
      to_jsonb('Directo, claro y atento. Evita relleno, cortesías largas y repetir información ya dicha.'::text),
      true
    ),
    updated_at = now()
where key = 'ai_config'
  and exists (select 1 from migration)
  and value->>'personalidad' ilike '%No dividas la respuesta en varios mensajes seguidos:%un solo mensaje breve%';

-- Las cinco etapas activas repetían el contrato global casi palabra por
-- palabra. El objetivo y las herramientas permitidas se conservan; el campo
-- editable queda vacío para que solo se use cuando haya una diferencia real.
with migration as (
  insert into settings (key, value)
  values ('migration_stage_prompt_administrable_v1', 'true'::jsonb)
  on conflict (key) do nothing
  returning key
)
update stage_prompt_versions
set prompt = ''
where status = 'published'
  and stage in ('nuevo', 'medida_confirmada', 'seleccionando', 'cotizacion_enviada', 'seguimiento_venta')
  and exists (select 1 from migration);

-- La fase operativa elige pocas herramientas por turno, pero primero tienen
-- que existir en la lista publicada. El 29-ago se comprobó que el prompt pedía
-- respaldo_marcas, ubicacion_locales y agendar_visita mientras ninguna etapa
-- publicada se las ofrecía al modelo. Se agregan una vez, sin tocar objetivos
-- ni decisiones posteriores del administrador.
insert into settings (key, value)
values ('migration_herramientas_fase_operativa_v1', 'true'::jsonb)
on conflict (key) do nothing;

update stage_prompt_versions
set allowed_tools = allowed_tools || '["respaldo_marcas"]'::jsonb
where status = 'published'
  and stage = 'seleccionando'
  and not (allowed_tools ? 'respaldo_marcas');

update stage_prompt_versions
set allowed_tools = allowed_tools || '["ubicacion_locales"]'::jsonb
where status = 'published'
  and stage in ('cotizacion_enviada', 'seguimiento_venta')
  and not (allowed_tools ? 'ubicacion_locales');

update stage_prompt_versions
set allowed_tools = allowed_tools || '["agendar_visita"]'::jsonb
where status = 'published'
  and stage in ('cotizacion_enviada', 'seguimiento_venta')
  and not (allowed_tools ? 'agendar_visita');
`;

/** Aplica el esquema (idempotente). Se llama al arrancar el bot. */
export async function ensureSchema(): Promise<void> {
  await sql.unsafe(SCHEMA);
  await runFollowUpMigration(sql);
  await runSalesPlanDiscountsMigration(sql);
  await runFollowUpStagePromptsMigration(sql);
  await runOpportunityCampaignsPendingDiscountsMigration(sql);
  await runConversationMemoryDiscountDeliveryMigration(sql);
  await runCycleContextQualityMigration(sql);
  await runAdvisorNotificationsMigration(sql);
  await runBenefitsMigration(sql);
  await runBrandProfilesMigration(sql);
  await runAdvisorsMigration(sql);
  await runVentaPrimeroMigration(sql);
  await runAroFotoVisitaMigration(sql);
  await runAvisosEntregadosMigration(sql);
  await runVenderEnTodaEtapaMigration(sql);
  await runVentanaAsesoresMigration(sql);
  await runCumplirSolicitudMigration(sql);
  await runConfirmationCouponsMigration(sql);
  await runRolesDeAsesorMigration(sql);
  await runFranjaDeVisitaMigration(sql);
  await runAsesorEnTodaEtapaMigration(sql);
}

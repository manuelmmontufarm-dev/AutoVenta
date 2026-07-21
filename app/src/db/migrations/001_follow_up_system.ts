import type { Sql } from "../client.js";

export const FOLLOW_UP_MIGRATION_ID = "001_follow_up_system";

/**
 * Migración idempotente del pipeline y del dominio de seguimientos.
 *
 * Se ejecuta dentro de una transacción y conserva los ids/ciclos históricos:
 * únicamente normaliza el nombre de la etapa y agrega estructuras nuevas.
 */
export async function runFollowUpMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      );

      alter table conversations add column if not exists pickup_date date;
      alter table conversations add column if not exists visit_date timestamptz;
      alter table conversations add column if not exists offer_expires_at timestamptz;
      alter table conversations add column if not exists savings_amount numeric(10,2);
      alter table conversations add column if not exists customer_commitment text;
      alter table conversations add column if not exists follow_up_reason text;
      alter table conversations add column if not exists customer_opt_in boolean not null default false;
      alter table conversations add column if not exists opted_out_at timestamptz;
      alter table conversations add column if not exists negative_sentiment_at timestamptz;

      -- Renombre canónico sin recrear conversaciones ni ciclos.
      update conversations
      set stage = 'seguimiento_venta', updated_at = now()
      where stage = 'handoff_visita';

      update stage_transitions
      set from_stage = case when from_stage = 'handoff_visita' then 'seguimiento_venta' else from_stage end,
          to_stage = case when to_stage = 'handoff_visita' then 'seguimiento_venta' else to_stage end
      where from_stage = 'handoff_visita' or to_stage = 'handoff_visita';

      update stage_prompt_versions
      set stage = 'seguimiento_venta'
      where stage = 'handoff_visita'
        and not exists (
          select 1 from stage_prompt_versions existing
          where existing.stage = 'seguimiento_venta'
            and existing.version = stage_prompt_versions.version
        )
        and not (
          stage_prompt_versions.status = 'published'
          and exists (
            select 1 from stage_prompt_versions existing
            where existing.stage = 'seguimiento_venta' and existing.status = 'published'
          )
        );
      delete from stage_prompt_versions where stage = 'handoff_visita';

      update ai_runs set stage = 'seguimiento_venta' where stage = 'handoff_visita';

      update funnel_events
      set data = jsonb_set(
        jsonb_set(coalesce(data, '{}'::jsonb), '{stage}', '"seguimiento_venta"'::jsonb),
        '{from}',
        case when data->>'from' = 'handoff_visita'
          then '"seguimiento_venta"'::jsonb
          else coalesce(data->'from', 'null'::jsonb)
        end
      )
      where data->>'stage' = 'handoff_visita' or data->>'from' = 'handoff_visita';

      create table if not exists follow_up_policies (
        id bigserial primary key,
        policy_key text not null unique,
        enabled boolean not null default true,
        timezone text not null default 'America/Guayaquil',
        business_hours jsonb not null default '{}'::jsonb,
        quiet_hours jsonb not null default '{}'::jsonb,
        enabled_stages jsonb not null default '[]'::jsonb,
        first_delay_minutes integer not null default 180,
        second_before_close_minutes integer not null default 120,
        minimum_gap_minutes integer not null default 240,
        max_in_window_attempts integer not null default 2,
        max_post_window_attempts integer not null default 2,
        post_window_gap_minutes integer not null default 1440,
        advisor_alert_days integer not null default 3,
        recommend_close_days integer not null default 5,
        require_consent boolean not null default true,
        respect_opt_out boolean not null default true,
        never_outside_hours boolean not null default true,
        max_messages_per_day integer not null default 2,
        pause_on_human_control boolean not null default true,
        updated_at timestamptz not null default now()
      );
      alter table follow_up_policies add column if not exists alert_settings jsonb not null default '{"priorityByEvent":{},"sound":true,"recipient":"owner","autoAssign":false,"escalationRules":[]}'::jsonb;

      create table if not exists follow_up_templates (
        id bigserial primary key,
        template_key text not null unique,
        template_name text,
        language text not null default 'es',
        expected_category text not null default 'UTILITY',
        variables jsonb not null default '[]'::jsonb,
        buttons jsonb not null default '[]'::jsonb,
        preview text not null default '',
        approval_status text not null default 'not_configured',
        configured boolean not null default false,
        automatic_send boolean not null default false,
        updated_at timestamptz not null default now()
      );

      create table if not exists follow_up_jobs (
        id bigserial primary key,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        type text not null,
        channel text not null default 'whatsapp',
        due_at timestamptz not null,
        window_closes_at timestamptz,
        status text not null default 'scheduled',
        idempotency_key text not null,
        payload jsonb not null default '{}'::jsonb,
        attempt_count integer not null default 0,
        cancel_reason text,
        created_at timestamptz not null default now(),
        executed_at timestamptz,
        locked_at timestamptz,
        locked_by text,
        last_error text
      );
      create unique index if not exists follow_up_jobs_idempotency_idx
        on follow_up_jobs (idempotency_key);
      create index if not exists follow_up_jobs_due_idx
        on follow_up_jobs (status, due_at);
      create index if not exists follow_up_jobs_conversation_idx
        on follow_up_jobs (conversation_id, cycle, created_at);

      create table if not exists follow_up_attempts (
        id bigserial primary key,
        job_id bigint not null references follow_up_jobs(id) on delete cascade,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        attempt_number integer not null,
        status text not null,
        provider_message_id text,
        message_type text not null,
        template_name text,
        payload jsonb not null default '{}'::jsonb,
        error text,
        created_at timestamptz not null default now(),
        sent_at timestamptz,
        delivered_at timestamptz,
        read_at timestamptz,
        failed_at timestamptz,
        unique(job_id, attempt_number)
      );
      create index if not exists follow_up_attempts_provider_idx
        on follow_up_attempts (provider_message_id) where provider_message_id is not null;

      create table if not exists bot_alerts (
        id bigserial primary key,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        type text not null,
        priority text not null default 'medium',
        summary text not null,
        exact_reason text not null,
        suggested_action text not null,
        status text not null default 'open',
        assigned_to text,
        snoozed_until timestamptz,
        dedupe_key text not null,
        created_at timestamptz not null default now(),
        resolved_at timestamptz
      );
      create unique index if not exists bot_alerts_open_dedupe_idx
        on bot_alerts (dedupe_key) where status in ('open', 'snoozed');
      create index if not exists bot_alerts_status_idx
        on bot_alerts (status, priority, created_at desc);

      create table if not exists customer_consents (
        id bigserial primary key,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        channel text not null default 'whatsapp',
        status text not null,
        source text not null,
        evidence_message_id bigint references messages(id) on delete set null,
        recorded_by text not null default 'system',
        created_at timestamptz not null default now(),
        revoked_at timestamptz
      );
      create index if not exists customer_consents_conversation_idx
        on customer_consents (conversation_id, channel, created_at desc);

      create table if not exists conversation_summaries (
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        summary text not null default '',
        customer_need text,
        options_discussed jsonb not null default '[]'::jsonb,
        selected_option text,
        customer_commitment text,
        follow_up_reason text,
        generated_at timestamptz not null default now(),
        source_message_id bigint references messages(id) on delete set null,
        primary key (conversation_id, cycle)
      );

      insert into follow_up_policies (
        policy_key, timezone, business_hours, quiet_hours, enabled_stages
      ) values (
        'default',
        'America/Guayaquil',
        '{"0":null,"1":{"open":"08:30","close":"17:30"},"2":{"open":"08:30","close":"17:30"},"3":{"open":"08:30","close":"17:30"},"4":{"open":"08:30","close":"17:30"},"5":{"open":"08:30","close":"17:30"},"6":{"open":"08:30","close":"17:30"}}'::jsonb,
        '{"start":"17:30","end":"08:30"}'::jsonb,
        '["nuevo","medida_confirmada","seleccionando","cotizacion_enviada","seguimiento_venta"]'::jsonb
      ) on conflict (policy_key) do nothing;

      insert into follow_up_templates (
        template_key, language, expected_category, variables, buttons, preview
      ) values
        ('seguimiento_cotizacion_v1', 'es', 'UTILITY', '["customer_name","quote_number"]'::jsonb, '[]'::jsonb, 'Seguimiento de cotización pendiente de configurar en Meta.'),
        ('recordatorio_visita_v1', 'es', 'UTILITY', '["customer_name","visit_date","store"]'::jsonb, '[]'::jsonb, 'Recordatorio de visita pendiente de configurar en Meta.'),
        ('seguimiento_opciones_v1', 'es', 'UTILITY', '["customer_name","tire_size"]'::jsonb, '[]'::jsonb, 'Seguimiento de opciones pendiente de configurar en Meta.')
      on conflict (template_key) do nothing;

      insert into schema_migrations (id) values ('001_follow_up_system')
      on conflict (id) do nothing;
    `);
  });
}

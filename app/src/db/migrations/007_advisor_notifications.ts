import type { Sql } from "../client.js";

export const ADVISOR_NOTIFICATIONS_MIGRATION_ID = "007_advisor_notifications";

/** Cola/auditoría idempotente de avisos enviados al asesor comercial. */
export async function runAdvisorNotificationsMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists advisor_notifications (
        id bigserial primary key,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        event_type text not null,
        dedupe_key text not null unique,
        recipient_name text not null,
        recipient_phone text not null,
        message text not null,
        status text not null default 'queued'
          check (status in ('queued','sent','failed')),
        attempt_count integer not null default 0,
        provider_message_id text,
        error text,
        created_at timestamptz not null default now(),
        sent_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create index if not exists advisor_notifications_status_idx
        on advisor_notifications (status, created_at desc);
      create index if not exists advisor_notifications_conversation_idx
        on advisor_notifications (conversation_id, cycle, created_at desc);

      insert into schema_migrations (id)
      values ('007_advisor_notifications')
      on conflict (id) do nothing;
    `);
  });
}

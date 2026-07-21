import type { Sql } from "../client.js";

export const CONVERSATION_MEMORY_DISCOUNT_DELIVERY_MIGRATION_ID =
  "005_conversation_memory_discount_delivery";

/** Memoria comercial mínima y entrega explícita de descuentos. */
export async function runConversationMemoryDiscountDeliveryMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table conversations add column if not exists vehicle_year integer;
      alter table conversations add column if not exists bot_resume_in_progress boolean not null default false;

      alter table pending_discount_rules
        add column if not exists notification_mode text not null default 'next_message';
      alter table pending_discount_rules
        add column if not exists notified_at timestamptz;
      alter table discount_offers
        add column if not exists notification_mode text not null default 'next_message';
      alter table discount_offers
        add column if not exists notified_at timestamptz;

      insert into schema_migrations (id)
      values ('005_conversation_memory_discount_delivery')
      on conflict (id) do nothing;
    `);
  });
}

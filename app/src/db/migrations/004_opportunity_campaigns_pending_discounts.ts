import type { Sql } from "../client.js";

export const OPPORTUNITY_CAMPAIGNS_MIGRATION_ID = "004_opportunity_campaigns_pending_discounts";

/** Persistencia para planes post-24 h autorizados y descuentos creados antes de cotizar. */
export async function runOpportunityCampaignsPendingDiscountsMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table follow_up_policies add column if not exists template_follow_up_days integer not null default 8;
      alter table follow_up_policies add column if not exists template_send_time text not null default '10:00';

      create table if not exists follow_up_campaigns (
        id bigserial primary key,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        kind text not null default 'advisor_template_8_day',
        template_key text not null references follow_up_templates(template_key),
        status text not null default 'active'
          check (status in ('active','completed','cancelled')),
        days integer not null default 8,
        approved_by text not null default 'owner',
        approved_at timestamptz not null default now(),
        starts_at timestamptz not null,
        cancelled_at timestamptz,
        cancel_reason text,
        created_at timestamptz not null default now()
      );
      create unique index if not exists follow_up_campaigns_one_active_idx
        on follow_up_campaigns (conversation_id, cycle) where status = 'active';

      create table if not exists pending_discount_rules (
        id bigserial primary key,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        kind text not null check (kind in ('total_amount','percentage','final_price')),
        value_cents integer not null,
        reason text not null,
        condition_text text not null,
        expires_at timestamptz,
        status text not null default 'pending'
          check (status in ('pending','applied','revoked','superseded')),
        source text not null default 'admin_prompt',
        source_message_id bigint references messages(id) on delete set null,
        applied_offer_id bigint references discount_offers(id) on delete set null,
        created_at timestamptz not null default now(),
        applied_at timestamptz
      );
      create unique index if not exists pending_discount_rules_one_current_idx
        on pending_discount_rules (conversation_id, cycle) where status = 'pending';
      create unique index if not exists pending_discount_rules_source_message_idx
        on pending_discount_rules (source_message_id) where source_message_id is not null;

      insert into schema_migrations (id) values ('004_opportunity_campaigns_pending_discounts')
      on conflict (id) do nothing;
    `);
  });
}

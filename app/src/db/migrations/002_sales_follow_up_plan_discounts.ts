import type { Sql } from "../client.js";

export const SALES_PLAN_DISCOUNTS_MIGRATION_ID = "002_sales_follow_up_plan_discounts";

export async function runSalesPlanDiscountsMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists discount_offers (
        id bigserial primary key,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        quote_id bigint references quotes(id) on delete set null,
        kind text not null check (kind in ('total_amount','percentage','final_price')),
        value_cents integer not null,
        base_total_cents integer not null,
        discount_amount_cents integer not null,
        final_total_cents integer not null,
        reason text not null,
        condition_text text not null,
        expires_at timestamptz,
        status text not null default 'approved'
          check (status in ('draft','approved','offered','accepted','declined','expired','revoked','superseded')),
        source text not null default 'admin_form',
        created_by text not null default 'owner',
        source_message_id bigint references messages(id) on delete set null,
        supersedes_offer_id bigint references discount_offers(id) on delete set null,
        offered_at timestamptz,
        accepted_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create unique index if not exists discount_offers_source_message_idx
        on discount_offers (source_message_id) where source_message_id is not null;
      create unique index if not exists discount_offers_one_current_idx
        on discount_offers (conversation_id, cycle)
        where status in ('approved','offered','accepted');
      create index if not exists discount_offers_metrics_idx
        on discount_offers (created_at, status, conversation_id, cycle);

      alter table quotes add column if not exists original_subtotal numeric(10,2);
      alter table quotes add column if not exists original_tax numeric(10,2);
      alter table quotes add column if not exists original_total numeric(10,2);
      alter table quotes add column if not exists discount_amount numeric(10,2);
      alter table quotes add column if not exists discount_reason text;
      alter table quotes add column if not exists discount_condition text;
      alter table quotes add column if not exists discount_offer_id bigint references discount_offers(id) on delete set null;

      alter table sales_history add column if not exists discount_offer_id bigint references discount_offers(id) on delete set null;
      alter table sales_history add column if not exists discount_amount numeric(10,2);
      alter table sales_history add column if not exists original_total numeric(10,2);

      insert into schema_migrations (id) values ('002_sales_follow_up_plan_discounts')
      on conflict (id) do nothing;
    `);
  });
}

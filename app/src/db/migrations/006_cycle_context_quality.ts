import type { Sql } from "../client.js";

export const CYCLE_CONTEXT_QUALITY_MIGRATION_ID = "006_cycle_context_quality";

/** Evita que compromisos y motivos de una compra anterior contaminen el ciclo actual. */
export async function runCycleContextQualityMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table conversations add column if not exists follow_up_reason_cycle integer;
      alter table conversations add column if not exists customer_commitment_cycle integer;

      update conversations
      set follow_up_reason = null, follow_up_reason_cycle = null
      where follow_up_reason ilike 'Oferta autorizada:%';

      update conversations
      set follow_up_reason_cycle = current_cycle
      where follow_up_reason is not null and follow_up_reason_cycle is null;

      update conversations
      set customer_commitment_cycle = current_cycle
      where customer_commitment is not null and customer_commitment_cycle is null;

      update stage_prompt_versions
      set allowed_tools = allowed_tools || '["fitment_vehiculo"]'::jsonb
      where stage in ('medida_confirmada','seleccionando','cotizacion_enviada','seguimiento_venta')
        and not (allowed_tools ? 'fitment_vehiculo');

      insert into schema_migrations (id)
      values ('006_cycle_context_quality')
      on conflict (id) do nothing;
    `);
  });
}

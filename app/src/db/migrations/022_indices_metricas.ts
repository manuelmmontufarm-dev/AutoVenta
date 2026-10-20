import type { Sql } from "../client.js";

export const INDICES_METRICAS_MIGRATION_ID = "022_indices_metricas";

/**
 * Índices para las consultas de Métricas (`getHubMetrics`), que recorren por
 * fecha conversaciones, cotizaciones y cierres. Sin ellos cada cambio de mes
 * en el panel barría las tablas enteras (Manuel, 25-sep-2026: «se demora
 * mucho tiempo en cargarse las estadísticas»). `messages`,
 * `stage_transitions` y `sales_history` ya tenían el suyo.
 */
export async function runIndicesMetricasMigration(sql: Sql): Promise<void> {
  await sql.unsafe(`
    create index if not exists conversations_created_idx on conversations (created_at);
    create index if not exists quotes_created_idx on quotes (created_at);
  `);
  await sql`
    insert into schema_migrations (id)
    values (${INDICES_METRICAS_MIGRATION_ID})
    on conflict do nothing
  `;
}

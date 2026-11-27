import type { Sql } from "../client.js";

export const ESCRITURA_CACHE_1H_MIGRATION_ID = "043_escritura_cache_1h";

/**
 * LO ESCRITO AL CACHÉ CON TTL DE UNA HORA (27-nov-2026).
 *
 * El vendedor en Claude marca su prefijo fijo (herramientas + system) con TTL
 * de 1 hora: escribirlo cuesta 2× la entrada en vez del 1,25× del caché de 5
 * minutos. `cache_write_tokens` sigue siendo TODO lo escrito; esta columna es
 * la parte de 1 hora, para que `services/billing.ts` la cobre a su tarifa y la
 * cuenta cuadre con la factura de Anthropic. Ver `agent/chatClaude.ts`, punto 5.
 */
export async function runEscrituraCache1hMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table ai_runs add column if not exists cache_write_1h_tokens integer not null default 0;

      insert into schema_migrations (id)
      values ('043_escritura_cache_1h')
      on conflict (id) do nothing;
    `);
  });
}

import type { Sql } from "../client.js";

export const TOKENS_ESCRITOS_EN_CACHE_MIGRATION_ID = "041_tokens_escritos_en_cache";

/**
 * CUÁNTO SE ESCRIBIÓ AL CACHÉ, POR CORRIDA (22-nov-2026).
 *
 * OpenAI cachea solo y no cobra por escribir. Claude sí: lo que una llamada
 * deja en el caché cuesta 1,25× la entrada normal, y lo que la siguiente lee
 * de ahí cuesta una fracción. Sin esta columna la cuenta de un modelo Claude
 * (services/billing.ts) no cuadra con la factura de Anthropic, y la prueba de
 * costo contra gpt-5.5 mediría otra cosa. Para OpenAI queda siempre en 0.
 */
export async function runTokensEscritosEnCacheMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table ai_runs add column if not exists cache_write_tokens integer not null default 0;

      insert into schema_migrations (id)
      values ('041_tokens_escritos_en_cache')
      on conflict (id) do nothing;
    `);
  });
}

import type { Sql } from "../client.js";

export const FITMENT_APRENDIDO_MIGRATION_ID = "021_fitment_aprendido";

/**
 * Lo que la investigación de medidas por vehículo encontró en la web, anotado
 * para consultarlo antes de volver a investigar (Manuel, 1-sep-2026: «cada vez
 * que el modelo busca una llanta, que se la anote en la tabla»).
 *
 * `year_key` nulo = el cliente no dijo año. La unicidad usa `coalesce` para
 * que dos filas «sin año» del mismo modelo no se dupliquen.
 */
export async function runFitmentAprendidoMigration(sql: Sql): Promise<void> {
  await sql.unsafe(`
    create table if not exists vehicle_fitment_learned (
      id             bigserial primary key,
      make_key       text not null,
      model_key      text not null,
      year_key       integer,
      vehicle_label  text not null,
      sizes          jsonb not null default '[]'::jsonb,
      candidatos     jsonb not null default '[]'::jsonb,
      note           text,
      next_question  text,
      sources        jsonb not null default '[]'::jsonb,
      provider       text not null default 'web',
      hits           integer not null default 0,
      created_at     timestamptz not null default now(),
      updated_at     timestamptz not null default now()
    );
    create unique index if not exists vehicle_fitment_learned_key
      on vehicle_fitment_learned (make_key, model_key, coalesce(year_key, 0));
  `);
  await sql`
    insert into schema_migrations (id)
    values (${FITMENT_APRENDIDO_MIGRATION_ID})
    on conflict do nothing
  `;
}

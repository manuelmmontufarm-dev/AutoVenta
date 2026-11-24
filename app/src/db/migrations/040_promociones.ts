import type { Sql } from "../client.js";

export const PROMOCIONES_MIGRATION_ID = "040_promociones";

/**
 * PROMOCIONES QUE EL NEGOCIO ARMA SOLO (pestaña «Promociones», 24-nov-2026).
 *
 * Una fila por promoción guardada: su tipo, nombre, texto, fechas, interruptor
 * y las llantas con sus valores (`filas`, lo que el negocio subió en el Excel).
 * `desde` y `hasta` son días de Ecuador en texto («2026-12-05»), no `date`:
 * así ningún huso horario los corre un día. Las cuentas viven en
 * `domain/promociones.ts`.
 *
 * `origen`: «panel», o «politica:<nombre>» para la que venía escrita en el
 * código (el Black Friday de Competimotor): se siembra UNA vez y desde ahí la
 * maneja el negocio.
 */
export async function runPromocionesMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists promociones (
        id bigserial primary key,
        nombre text not null,
        tipo text not null,
        texto_extra text,
        activa boolean not null default true,
        archivada boolean not null default false,
        desde text,
        hasta text,
        parametros jsonb not null default '{}'::jsonb,
        filas jsonb not null default '[]'::jsonb,
        origen text not null default 'panel',
        creada_por text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create unique index if not exists promociones_origen_politica
        on promociones (origen) where origen like 'politica:%';

      insert into schema_migrations (id)
      values ('040_promociones')
      on conflict (id) do nothing;
    `);
  });
}

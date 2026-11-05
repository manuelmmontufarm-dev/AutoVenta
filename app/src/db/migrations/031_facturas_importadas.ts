import type { Sql } from "../client.js";

export const FACTURAS_IMPORTADAS_MIGRATION_ID = "031_facturas_importadas";

/**
 * FACTURAS IMPORTADAS: las ventas de un cliente SIN API de facturación (R-26).
 *
 * Fénix (Mundillantas) corre en un servidor local sin API: las facturas llegan
 * como un Excel/CSV subido en el panel (`POST /api/ventas/import`). Una fila
 * por factura; las líneas van en jsonb porque el cruce solo filtra las de
 * llantas por nombre. Los índices son simples (sin CONCURRENTLY): la tabla es
 * nueva y nace vacía, no hay candado que esperar.
 *
 * Con Contífico la tabla no se usa: la fuente en vivo tiene prioridad
 * (`services/fuentes/index.ts`).
 */
export async function runFacturasImportadasMigration(sql: Sql): Promise<void> {
  await sql.unsafe(`
    create table if not exists facturas_importadas (
      documento     text primary key,
      dia           text not null,
      hora          int,
      total         numeric not null default 0,
      subtotal      numeric not null default 0,
      cliente       text not null default '',
      -- Teléfonos ya normalizados a 9 dígitos (tel9): la llave del cruce.
      telefonos     text[] not null default '{}',
      lineas        jsonb not null default '[]',
      local         text,
      archivo       text,
      importada_at  timestamptz not null default now()
    );
    create index if not exists facturas_importadas_dia_idx on facturas_importadas (dia);
    create index if not exists facturas_importadas_telefonos_idx on facturas_importadas using gin (telefonos);
  `);
  await sql`
    insert into schema_migrations (id)
    values (${FACTURAS_IMPORTADAS_MIGRATION_ID})
    on conflict do nothing
  `;
}

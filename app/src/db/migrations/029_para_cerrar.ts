import type { Sql } from "../client.js";

export const PARA_CERRAR_MIGRATION_ID = "029_para_cerrar";

/**
 * PARA CERRAR: lo que el asesor decidió sobre un cliente que ya aceptó precio
 * y local (Manuel, 24-oct). Todo lo demás de la pestaña —quién escribió último,
 * si compró, si pasaron 14 días— se calcula de mensajes y facturas; aquí solo
 * va lo que nadie más sabe:
 *
 *  · `cerrar_descartado_at` — el asesor le puso la ✕. Si el cliente vuelve a
 *    escribir después, el descarte deja de valer y el cliente vuelve solo.
 *  · `cerrar_pospuesto_hasta` / `cerrar_pospuesto_en` — «me dijo que cobra el
 *    30»: no sale en la lista hasta esa fecha, salvo que escriba antes.
 *  · `cerrar_revivido_at` — lo sacaron del archivo: los 14 días cuentan desde ahí.
 */
export async function runParaCerrarMigration(sql: Sql): Promise<void> {
  await sql.unsafe(`
    alter table conversations add column if not exists cerrar_descartado_at timestamptz;
    alter table conversations add column if not exists cerrar_pospuesto_hasta timestamptz;
    alter table conversations add column if not exists cerrar_pospuesto_en timestamptz;
    alter table conversations add column if not exists cerrar_revivido_at timestamptz;
  `);
  await sql`
    insert into schema_migrations (id)
    values (${PARA_CERRAR_MIGRATION_ID})
    on conflict do nothing
  `;
}

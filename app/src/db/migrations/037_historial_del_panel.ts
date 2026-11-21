import type { Sql } from "../client.js";

export const HISTORIAL_DEL_PANEL_MIGRATION_ID = "037_historial_del_panel";

/**
 * QUIÉN HIZO QUÉ EN EL PANEL (21-nov-2026): las acciones sobre un ticket se
 * guardan en `audit_events` (services/accionesDelPanel.ts) y la ficha las lee
 * por ticket. Sin índice esa lectura recorre la tabla entera. Solo un índice:
 * ni tabla ni columna nueva.
 */
export async function runHistorialDelPanelMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create index if not exists audit_events_entidad_idx
        on audit_events (entity_type, entity_id, created_at desc);

      insert into schema_migrations (id)
      values ('037_historial_del_panel')
      on conflict (id) do nothing;
    `);
  });
}

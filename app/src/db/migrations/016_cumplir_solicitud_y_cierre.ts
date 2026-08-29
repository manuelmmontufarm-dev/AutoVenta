import type { Sql } from "../client.js";

export const CUMPLIR_SOLICITUD_MIGRATION_ID = "016_cumplir_solicitud_y_cierre";

/**
 * Habilita reenvío/comparación en las etapas de cierre.
 *
 * La versión original también volvía a pegar un párrafo de reglas en cada
 * prompt por etapa en TODOS los arranques. Esas reglas ya viven en la política
 * única y en las herramientas; aquí solo corresponde habilitar capacidades.
 */
export async function runCumplirSolicitudMigration(sql: Sql): Promise<void> {
  const closing = ["cotizacion_enviada", "seguimiento_venta"];
  await sql.begin(async (tx) => {
    const rows = await tx<{ id: number; allowed_tools: string[] }[]>`
      select id, allowed_tools from stage_prompt_versions
      where stage = any(${closing}) and status='published'
    `;
    for (const row of rows) {
      const allowed = [...new Set([...(row.allowed_tools ?? []), "enviar_comparacion", "reenviar_cotizacion"])];
      await tx`
        update stage_prompt_versions
        set allowed_tools=${tx.json(allowed as never)}
        where id=${row.id}
      `;
    }
    await tx`
      insert into schema_migrations (id) values (${CUMPLIR_SOLICITUD_MIGRATION_ID})
      on conflict (id) do nothing
    `;
  });
}

import type { Sql } from "../client.js";

export const CUMPLIR_SOLICITUD_MIGRATION_ID = "016_cumplir_solicitud_y_cierre";

/** Habilita reenvío/comparación en prompts publicados y corrige el cierre repetitivo. */
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
        set allowed_tools=${tx.json(allowed as never)},
            prompt='Cumple primero la solicitud actual: si pide la cotización otra vez usa reenviar_cotizacion; si pide otras opciones o una comparación, envía esa pieza. Después pide únicamente el dato de visita que falte. Si local y fecha/compromiso ya están guardados, confirma el plan una vez y no los vuelvas a preguntar. El local elegido explícitamente por el cliente gana sobre cualquier recomendación.'
        where id=${row.id}
      `;
    }
    await tx`
      insert into schema_migrations (id) values (${CUMPLIR_SOLICITUD_MIGRATION_ID})
      on conflict (id) do nothing
    `;
  });
}

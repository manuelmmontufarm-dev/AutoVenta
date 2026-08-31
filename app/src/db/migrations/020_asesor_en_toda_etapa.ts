import type { Sql } from "../client.js";

export const ASESOR_EN_TODA_ETAPA_MIGRATION_ID = "020_asesor_en_toda_etapa";

/**
 * Prometer intervención humana sin poder avisarle a nadie es peor que admitir
 * que falta el dato. La regla comercial aplica en cualquier punto del flujo,
 * así que toda etapa abierta necesita `notificar_vendedor`.
 *
 * Se une y nunca se pisa la lista publicada por el administrador, igual que
 * las migraciones 012 y 014. Las etapas cerradas siguen sin herramientas.
 */
export async function runAsesorEnTodaEtapaMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    const filas = await tx<{ id: number; allowed_tools: string[] }[]>`
      select id, allowed_tools from stage_prompt_versions
      where status = 'published'
        and stage in ('nuevo', 'medida_confirmada', 'seleccionando', 'cotizacion_enviada', 'seguimiento_venta')
    `;
    for (const fila of filas) {
      const union = [...new Set([...(fila.allowed_tools ?? []), "notificar_vendedor"])];
      await tx`
        update stage_prompt_versions
        set allowed_tools = ${tx.json(union as never)}
        where id = ${fila.id}
      `;
    }
    await tx`
      insert into schema_migrations (id)
      values (${ASESOR_EN_TODA_ETAPA_MIGRATION_ID})
      on conflict (id) do nothing
    `;
  });
}

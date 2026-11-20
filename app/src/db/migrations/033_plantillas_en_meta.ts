import type { Sql } from "../client.js";

export const PLANTILLAS_EN_META_MIGRATION_ID = "033_plantillas_en_meta";

/**
 * Las plantillas de seguimiento, al día con lo que dice Meta (19-nov-2026).
 *
 * Hasta hoy el estado de cada plantilla se tecleaba a mano en Ajustes →
 * Seguimientos, y nadie lo hacía: las tres de 001 seguían «sin configurar»
 * meses después. El 18-nov se crearon por API `recordatorio_visita_v1` y
 * `visita_no_llego_v1` en Depot y Competimotor, y Meta pasó una de ellas a
 * MARKETING (~7 ¢ en vez de ~1 ¢) sin que el panel pudiera mostrarlo.
 *
 * - Columnas `meta_*`: lo último que contestó Meta, para que el panel muestre
 *   estado y categoría reales en vez de lo que alguien escribió.
 * - `visita_no_llego_v1`: la plantilla nueva, sembrada con su nombre en Meta.
 * - Las de 001 sin nombre toman el de su clave, que es como se crearon en Meta.
 */
export async function runPlantillasEnMetaMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table follow_up_templates
        add column if not exists meta_status text,
        add column if not exists meta_category text,
        add column if not exists meta_template_id text,
        add column if not exists meta_synced_at timestamptz;

      insert into follow_up_templates (
        template_key, template_name, language, expected_category, variables, buttons, preview
      ) values (
        'visita_no_llego_v1', 'visita_no_llego_v1', 'es', 'UTILITY',
        '["customer_name","store","tire_size"]'::jsonb,
        '["Agendar otro día","Ya no las necesito"]'::jsonb,
        'Hola {{1}}, ayer le esperábamos en {{2}}. Sus llantas {{3}} siguen disponibles. Díganos qué día le queda mejor y lo dejamos agendado.'
      ) on conflict (template_key) do nothing;

      update follow_up_templates set template_name = template_key
      where template_name is null and template_key in ('recordatorio_visita_v1', 'seguimiento_cotizacion_v1', 'seguimiento_opciones_v1');

      insert into schema_migrations (id)
      values ('033_plantillas_en_meta')
      on conflict (id) do nothing;
    `);
  });
}

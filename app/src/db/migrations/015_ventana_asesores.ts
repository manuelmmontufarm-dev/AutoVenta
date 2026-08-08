import type { Sql } from "../client.js";

export const VENTANA_ASESORES_MIGRATION_ID = "015_ventana_asesores";

/**
 * Cuándo se le puede escribir a cada asesor.
 *
 * Meta solo deja mandar texto libre a alguien que le escribió al número del
 * negocio en las últimas 24 horas. Fuera de esa ventana devuelve el 131047 y el
 * aviso muere. Manuel nunca lo notó porque le escribe al bot todo el día: su
 * ventana está siempre abierta. Joaquín no le había escrito nunca, así que
 * ninguno de sus avisos podía llegar — ni con el número corregido.
 *
 * La decisión (8-ago) fue no usar plantillas aprobadas sino avisar antes de que
 * la ventana se cierre, para pedirle al asesor que mande cualquier mensaje. Eso
 * necesita guardar dos cosas: hasta cuándo dura la ventana y cuándo se avisó por
 * última vez, para no repetir el mismo recordatorio cada quince minutos.
 */
export async function runVentanaAsesoresMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table advisors
        add column if not exists ventana_hasta timestamptz,
        add column if not exists ventana_avisada_en timestamptz;

      insert into schema_migrations (id)
      values ('015_ventana_asesores')
      on conflict (id) do nothing;
    `);
  });
}

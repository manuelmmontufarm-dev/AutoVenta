import type { Sql } from "../client.js";

export const MOTIVO_DE_LA_PAUSA_MIGRATION_ID = "026_motivo_de_la_pausa";

/**
 * POR QUÉ está pausado el bot, guardado como hecho cuando se pausa (auditoría
 * del 19-oct, familia 4).
 *
 * `bot_paused_until` decía hasta cuándo, pero no quién lo pidió. Una pausa que
 * puso una persona (escribió desde el panel o desde su WhatsApp, o el cliente
 * pidió un asesor) y la que puso la revisión automática de 24 h
 * (`advisor_review`) se veían iguales, así que el cliente que escribía durante
 * la revisión —sin que ninguna persona estuviera en el chat— quedaba mudo hasta
 * el rescate de la mañana siguiente (chat 26121: 12:50 → 08:42).
 *
 * Valores (`domain/turnoDelHumano.ts`, `MotivoDePausa`): 'revision_automatica',
 * 'pidio_asesor', 'persona_escribio', 'panel', 'opt_out', 'molesto'. Nulo en
 * las pausas anteriores a esta migración: se tratan como de una persona, que es
 * lo que el bot hacía hasta hoy.
 */
export async function runMotivoDeLaPausaMigration(sql: Sql): Promise<void> {
  await sql.unsafe(`
    alter table conversations add column if not exists bot_paused_reason text;
  `);
  await sql`
    insert into schema_migrations (id)
    values (${MOTIVO_DE_LA_PAUSA_MIGRATION_ID})
    on conflict do nothing
  `;
}

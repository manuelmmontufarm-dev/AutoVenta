import type { Sql } from "../client.js";

export const FRANJA_DE_VISITA_MIGRATION_ID = "019_franja_de_visita";

/**
 * La HORA que el cliente dijo, en sus palabras.
 *
 * `visit_date` guarda un timestamp, pero la hora que lleva dentro casi nunca la
 * dijo nadie: es el relleno con el que se construyó la fecha (10:00 para un día
 * de la semana, 15:00 para «hoy»). Con eso, el aviso al asesor decía «jueves 27
 * de agosto, 10:00» de un cliente que había escrito «de 4 a 5» — una hora
 * inventada, en el mensaje que existe justamente para que el asesor lo espere.
 *
 * Se guarda la etiqueta y no solo el número porque «de 4 a 5 pm» es un tramo, y
 * un tramo no cabe en un timestamp. El bot se la devuelve tal cual al confirmar
 * y al recordar la visita.
 */
export async function runFranjaDeVisitaMigration(sql: Sql): Promise<void> {
  await sql`alter table conversations add column if not exists visit_time_label text`;
}

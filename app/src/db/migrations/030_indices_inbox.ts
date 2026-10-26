import type { Sql } from "../client.js";

export const INDICES_INBOX_MIGRATION_ID = "030_indices_inbox";

/**
 * ÍNDICES QUE LE FALTABAN AL INBOX (Manuel, 26-oct 16:24: «la website está
 * bien lenta en cargar los chats»). `GET /api/hub/tickets` tardaba 44–50 s en
 * producción: la lista arma diez subconsultas por conversación (cotización
 * del ciclo, seguimientos, intentos, notas, descuentos, ventas ganadas) y
 * varias de esas tablas no tenían índice por conversación, así que cada
 * subconsulta recorría la tabla entera. Con 498 chats abiertos y cuatro
 * pestañas sondeando cada 15 s, las consultas se apilaban y el panel decía
 * «Sin conexión con el servidor».
 *
 * Solo índices, solo aditivo, `if not exists`: se puede correr las veces que
 * haga falta. Las tablas son chicas (miles de filas), así que crearlos al
 * arrancar tarda segundos, no minutos.
 */
export async function runIndicesInboxMigration(sql: Sql): Promise<void> {
  await sql.unsafe(`
    create index if not exists quotes_conversation_cycle_idx
      on quotes (conversation_id, cycle, created_at desc);
    create index if not exists conversation_notes_conversation_idx
      on conversation_notes (conversation_id, created_at);
    create index if not exists sales_history_conversation_idx
      on sales_history (conversation_id, cycle);
    create index if not exists follow_up_attempts_conversation_cycle_idx
      on follow_up_attempts (conversation_id, cycle, created_at desc);
    create index if not exists conversations_updated_idx
      on conversations (updated_at desc);
  `);
  await sql`
    insert into schema_migrations (id)
    values (${INDICES_INBOX_MIGRATION_ID})
    on conflict do nothing
  `;
}

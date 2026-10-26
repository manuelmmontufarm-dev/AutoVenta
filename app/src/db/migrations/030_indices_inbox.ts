import type { Sql } from "../client.js";

export const INDICES_INBOX_MIGRATION_ID = "030_indices_inbox";

/**
 * ÍNDICES QUE LE FALTABAN AL INBOX (Manuel, 26-oct 16:24: «la website está
 * bien lenta en cargar los chats»). `GET /api/hub/tickets` tardaba 44–50 s en
 * producción: varias de las tablas que la lista consulta por conversación no
 * tenían índice por conversación.
 *
 * SE CREAN EN SEGUNDO PLANO Y CON CONCURRENTLY (26-oct, 16:36). La primera
 * versión corría dentro de `ensureSchema`, antes de abrir el puerto, con
 * `create index` normal: ese bloquea mientras haya escrituras en la tabla, y
 * con la base de Depot saturada por el proceso viejo el contenedor nuevo no
 * llegó a contestar `/health` en 100 s → Railway marcó el deploy FAILED y siguió
 * sirviendo el proceso lento. Ahora: el servidor arranca primero, y después
 * se crea cada índice por separado con `concurrently` (no bloquea lecturas ni
 * escrituras). Si uno quedó a medias de un intento anterior (índice INVALID),
 * se borra y se vuelve a crear.
 */
const INDICES: { nombre: string; definicion: string }[] = [
  { nombre: "quotes_conversation_cycle_idx", definicion: "quotes (conversation_id, cycle, created_at desc)" },
  { nombre: "conversation_notes_conversation_idx", definicion: "conversation_notes (conversation_id, created_at)" },
  { nombre: "sales_history_conversation_idx", definicion: "sales_history (conversation_id, cycle)" },
  { nombre: "follow_up_attempts_conversation_cycle_idx", definicion: "follow_up_attempts (conversation_id, cycle, created_at desc)" },
  { nombre: "conversations_updated_idx", definicion: "conversations (updated_at desc)" },
];

export async function runIndicesInboxMigration(sql: Sql): Promise<void> {
  for (const { nombre, definicion } of INDICES) {
    const [estado] = await sql<{ valido: boolean }[]>`
      select i.indisvalid as valido
      from pg_class c join pg_index i on i.indexrelid = c.oid
      where c.relname = ${nombre}
    `;
    if (estado?.valido) continue;
    if (estado && !estado.valido) await sql.unsafe(`drop index concurrently if exists ${nombre}`);
    await sql.unsafe(`create index concurrently if not exists ${nombre} on ${definicion}`);
  }
  await sql`
    insert into schema_migrations (id)
    values (${INDICES_INBOX_MIGRATION_ID})
    on conflict do nothing
  `;
}

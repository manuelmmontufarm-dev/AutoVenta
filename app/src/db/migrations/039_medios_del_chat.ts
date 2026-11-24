import type { Sql } from "../client.js";

export const MEDIOS_DEL_CHAT_MIGRATION_ID = "039_medios_del_chat";

/**
 * FOTOS, AUDIOS Y ARCHIVOS DEL CHAT (23-nov-2026).
 *
 * Hasta hoy una foto o un audio del cliente se leía (visión / transcripción),
 * se guardaba SOLO el texto y el archivo se tiraba: en el panel el asesor veía
 * «[El cliente mandó una foto. Se lee: …]» y no podía abrirla. Lo que mandaba
 * un asesor desde su WhatsApp era peor: «[el asesor envió una imagen]».
 *
 * `message_media` guarda el archivo, enlazado al mensaje por el id de WhatsApp
 * (`wa_message_id`) — así no hay que tocar cómo se guarda cada mensaje.
 *  · `bytes` puede ser null: Meta no entregó el archivo cuando llegó. Queda el
 *    `wa_media_id` y se vuelve a intentar cuando alguien lo abre.
 */
export async function runMediosDelChatMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists message_media (
        id bigserial primary key,
        wa_message_id text not null unique,
        conversation_id bigint,
        kind text not null,
        mime text not null default 'application/octet-stream',
        filename text,
        wa_media_id text,
        bytes bytea,
        size integer not null default 0,
        created_at timestamptz not null default now()
      );

      insert into schema_migrations (id)
      values ('039_medios_del_chat')
      on conflict (id) do nothing;
    `);
  });
}

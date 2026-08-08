import type { Sql } from "../client.js";

export const AVISOS_ENTREGADOS_MIGRATION_ID = "013_avisos_entregados";

/**
 * Un aviso "enviado" que nadie recibió no puede verse igual que uno entregado.
 *
 * El 8-ago se descubrió que Joaquín llevaba 62 avisos sin recibir. Su número
 * estaba mal tecleado en el panel (+32, Bélgica, en vez de +34, España). La
 * Graph API acepta cualquier número con formato válido y devuelve un wamid, así
 * que `notifyAdvisor` los marcaba `sent` y ahí moría el asunto. Meta SÍ avisaba
 * del fallo —131026 "Message undeliverable"— por el webhook de estados, y ese
 * evento se guardaba en `message_status_events`, pero `advisor_notifications`
 * nunca se enteraba: la reconciliación por `provider_message_id` existía para
 * `messages` y `follow_up_attempts`, y saltaba justo la tabla de los asesores.
 *
 * `delivered_at` es la única columna nueva. El `status` sigue con su check de
 * ('queued','sent','failed') a propósito: media docena de consultas dependen de
 * esos tres valores, y "entregado" es una marca de tiempo, no un cuarto estado.
 */
export async function runAvisosEntregadosMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table advisor_notifications
        add column if not exists delivered_at timestamptz;

      -- La reconciliación busca por wamid; sin índice es un scan por cada
      -- webhook de estado, y esos llegan varios por mensaje (sent/delivered/read).
      create index if not exists advisor_notifications_provider_idx
        on advisor_notifications (provider_message_id)
        where provider_message_id is not null;

      insert into schema_migrations (id)
      values ('013_avisos_entregados')
      on conflict (id) do nothing;
    `);
  });
}

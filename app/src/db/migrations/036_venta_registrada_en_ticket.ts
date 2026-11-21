import type { Sql } from "../client.js";

export const VENTA_EN_TICKET_MIGRATION_ID = "036_venta_registrada_en_ticket";

/**
 * LA VENTA REGISTRADA MARCA EL TICKET (21-nov-2026).
 *
 * Hasta acá `/venta` guardaba el registro y el panel no se enteraba. Ahora un
 * registro que cruza con un chat pasa ese ticket a «ganado», y el panel
 * distingue los ganados con venta registrada de los marcados a mano.
 *
 *  - `cycle`: el ciclo del chat al registrar. Un ticket = conversación + ciclo;
 *    sin esto, la venta de la visita de octubre se pegaría al ticket de diciembre.
 *  - `efecto_en_ticket`: qué le hizo el registro al ticket — 'marcado_ganado'
 *    (lo cerramos nosotros), 'ya_ganado' (ya estaba ganado, no se tocó),
 *    'sin_chat' (el número no cruzó con ningún chat). null = registro de antes
 *    de este cambio, que no tocó el ticket.
 *  - `etapa_anterior` / `motivo_anterior`: para devolver el ticket a donde
 *    estaba si el vendedor corrige el número (`anulada_at`).
 *
 * Los registros del 20-nov se vinculan a su ciclo (el que estaba vivo cuando se
 * registraron) para que el panel los muestre, pero NO se les cambia la etapa:
 * una migración no cierra tickets.
 */
export async function runVentaEnTicketMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table ventas_registradas add column if not exists cycle integer;
      alter table ventas_registradas add column if not exists efecto_en_ticket text;
      alter table ventas_registradas add column if not exists etapa_anterior text;
      alter table ventas_registradas add column if not exists motivo_anterior text;
      alter table ventas_registradas add column if not exists anulada_at timestamptz;

      update ventas_registradas v
      set cycle = coalesce(
        (select max(m.cycle) from messages m
          where m.conversation_id = v.conversation_id and m.created_at <= v.created_at),
        (select c.current_cycle from conversations c where c.id = v.conversation_id)
      )
      where v.conversation_id is not null and v.cycle is null;

      create index if not exists ventas_registradas_ticket_idx
        on ventas_registradas (conversation_id, cycle) where anulada_at is null;

      insert into schema_migrations (id)
      values ('036_venta_registrada_en_ticket')
      on conflict (id) do nothing;
    `);
  });
}

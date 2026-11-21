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
 *  - `monto`: lo que pagó el cliente. Con `factura`, completa la venta; sin
 *    alguno de los dos la venta cuenta, pero queda «factura pendiente».
 *  - `origen`: 'vendedor' (página /venta) o 'panel' (el asesor cerró como
 *    ganado, o completó un ganado viejo). «Ganado» a mano y venta registrada
 *    son ahora una sola cosa: el cierre del panel escribe en esta misma tabla.
 *
 * Y en `conversations`, la COMPRA POR CONFIRMAR: el cliente escribió «ya
 * compré» y el bot ya no lo cierra como ganado solo (conv 293 de Competimotor,
 * 21-nov: casi seguro compró en otro lado). Queda a la espera de que el asesor
 * diga si compró acá (ganado) o en otro lado (perdido). Por ciclo.
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
      alter table ventas_registradas add column if not exists monto numeric(12,2);
      alter table ventas_registradas add column if not exists origen text not null default 'vendedor';

      alter table conversations add column if not exists compra_por_confirmar_at timestamptz;
      alter table conversations add column if not exists compra_por_confirmar_cycle integer;
      alter table conversations add column if not exists compra_por_confirmar_texto text;

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

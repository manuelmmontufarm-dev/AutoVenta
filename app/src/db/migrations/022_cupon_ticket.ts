import type { Sql } from "../client.js";

export const CUPON_TICKET_MIGRATION_ID = "022_cupon_ticket";

/**
 * El cupón pasa de ser un mensaje de texto a ser un ticket con QR (19-oct-2026,
 * luz verde de Depot para los descuentos del 2 %).
 *
 * - `valid_until`: el ticket dice «válido hasta» porque un premio sin fecha no
 *   apura a nadie. Nulo en los cupones viejos (los 8 de agosto): no se les
 *   inventa una fecha que el cliente nunca vio.
 * - `motivo`: «visita» (el cliente dijo cuándo viene) o «seguimiento» (se le
 *   regaló en el último seguimiento). Cambia la frase del ticket y deja medir
 *   cuál de las dos puertas trae más gente a caja.
 * - `ticket_sent_at`: la imagen se manda UNA vez. Es la marca que deja a las
 *   tres puertas (turno normal, retomada y seguimiento) llamar al mismo
 *   «manda lo pendiente» sin duplicar el ticket.
 */
export async function runCuponTicketMigration(sql: Sql): Promise<void> {
  await sql.unsafe(`
    alter table confirmation_coupons add column if not exists valid_until timestamptz;
    alter table confirmation_coupons add column if not exists motivo text not null default 'visita';
    alter table confirmation_coupons add column if not exists ticket_sent_at timestamptz;
  `);
  await sql`
    insert into schema_migrations (id)
    values (${CUPON_TICKET_MIGRATION_ID})
    on conflict do nothing
  `;
}

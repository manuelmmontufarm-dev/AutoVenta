import type { Sql } from "../client.js";

export const VENTAS_REGISTRADAS_MIGRATION_ID = "035_ventas_registradas";

/**
 * VENTAS QUE REGISTRA EL VENDEDOR A MANO (20-nov-2026).
 *
 * Mientras no leamos las facturas del cliente, el vendedor abre `/venta`,
 * escribe su nombre y el número del comprador, y la página le dice si ese
 * número está en los chats de WhatsApp del bot. Una fila por registro, haya
 * chat o no: el «no» también es un dato (número mal escrito o venta de calle).
 *
 * `tel9` es la misma llave del cruce de facturas (últimos 9 dígitos). SIEMPRE
 * se guarda: cada número que el vendedor valida deja su fila, aunque ya esté
 * registrado ese día o esté mal tipeado (pedido de Manuel, 20-nov). La factura
 * o referencia llega en un segundo paso y se escribe sobre la misma fila.
 */
export async function runVentasRegistradasMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists ventas_registradas (
        id                bigserial primary key,
        vendedor          text not null,
        telefono          text not null,
        tel9              text not null,
        factura           text,
        vino_de_whatsapp  boolean not null,
        conversation_id   bigint references conversations(id) on delete set null,
        cliente           text,
        ultimo_mensaje_at timestamptz,
        cotizaciones      integer not null default 0,
        dia               date not null,
        created_at        timestamptz not null default now()
      );
      create index if not exists ventas_registradas_tel9_idx on ventas_registradas (tel9, dia);
      create index if not exists ventas_registradas_created_idx on ventas_registradas (created_at desc);

      insert into schema_migrations (id)
      values ('035_ventas_registradas')
      on conflict (id) do nothing;
    `);
  });
}

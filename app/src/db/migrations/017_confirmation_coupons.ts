import type { Sql } from "../client.js";

export const CONFIRMATION_COUPONS_MIGRATION_ID = "017_confirmation_coupons";

/**
 * Cupón de confirmación: el código que el cliente lleva al local para reclamar
 * su 2 % adicional y que, al canjearse, dice qué cotización fue venta de verdad.
 *
 * Decisiones que están en la forma de la tabla:
 *
 * - `code` único global. Se dicta por teléfono y se busca sin más contexto que
 *   lo que el cliente muestra, así que tiene que identificar una sola fila.
 * - Único por `(conversation_id, cycle)` mientras el cupón sigue vivo: si el
 *   cliente cambia la fecha de visita no se le emite un segundo descuento. El
 *   índice es parcial (deja fuera los anulados) para que un cupón anulado no
 *   bloquee la emisión de uno nuevo en la misma conversación.
 * - `extra_pct` se guarda POR CUPÓN y no se lee del ajuste al canjear: si Depot
 *   sube el porcentaje el mes que viene, el cliente que ya tiene su papel en la
 *   mano sigue teniendo el que se le prometió.
 * - `redeemed_by` es texto libre y nullable. Hoy el hub entra con una sola clave
 *   compartida, así que puede quedar vacío; cuando exista el login por usuario
 *   pasará a llevar el nombre de quien canjeó.
 */
export async function runConfirmationCouponsMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      create table if not exists confirmation_coupons (
        id              bigserial primary key,
        code            text not null unique,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle           integer not null default 1,
        quote_id        bigint references quotes(id) on delete set null,
        extra_pct       numeric(5,2) not null default 2,
        status          text not null default 'emitido',
        issued_at       timestamptz not null default now(),
        redeemed_at     timestamptz,
        redeemed_by     text,
        notes           text
      )
    `;
    await tx`
      create unique index if not exists confirmation_coupons_conv_cycle_idx
        on confirmation_coupons (conversation_id, cycle)
        where status <> 'anulado'
    `;
    await tx`
      create index if not exists confirmation_coupons_status_idx
        on confirmation_coupons (status, issued_at)
    `;
    await tx`
      insert into schema_migrations (id) values (${CONFIRMATION_COUPONS_MIGRATION_ID})
      on conflict (id) do nothing
    `;
  });
}

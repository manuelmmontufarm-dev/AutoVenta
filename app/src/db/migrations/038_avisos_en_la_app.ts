import type { Sql } from "../client.js";

export const AVISOS_EN_LA_APP_MIGRATION_ID = "038_avisos_en_la_app";

/**
 * AVISOS EN LA APP DEL TELÉFONO (22-nov-2026).
 *
 * Los avisos al asesor salían solo por WhatsApp. Ahora los que no piden actuar
 * (cotización enviada, venta confirmada) pueden ir por la app instalada en el
 * teléfono, y los urgentes siguen por WhatsApp con la app de respaldo.
 *
 *  · `advisor_notifications.channel`: por dónde salió cada aviso («whatsapp» o
 *    «app»). El historial de la app se lee de esta misma tabla.
 *  · `push_subscriptions`: cada teléfono/navegador que activó las
 *    notificaciones, de qué usuario del panel es y a qué asesor corresponde.
 *  · `push_keys`: el par de claves con que el servidor firma los avisos. Tabla
 *    propia (no `settings`) para que el simulador no las copie de producción.
 */
export async function runAvisosEnLaAppMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table advisor_notifications
        add column if not exists channel text not null default 'whatsapp';

      create index if not exists advisor_notifications_recientes_idx
        on advisor_notifications (created_at desc);

      create table if not exists push_subscriptions (
        id bigserial primary key,
        user_id text not null,
        user_name text not null default '',
        advisor_phone text,
        endpoint text not null unique,
        p256dh text not null,
        auth text not null,
        user_agent text,
        failed_count integer not null default 0,
        created_at timestamptz not null default now(),
        last_ok_at timestamptz
      );

      create table if not exists push_keys (
        id integer primary key default 1 check (id = 1),
        public_key text not null,
        private_key text not null,
        created_at timestamptz not null default now()
      );

      insert into schema_migrations (id)
      values ('038_avisos_en_la_app')
      on conflict (id) do nothing;
    `);
  });
}

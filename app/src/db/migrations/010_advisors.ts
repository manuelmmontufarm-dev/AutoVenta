import type { Sql } from "../client.js";

export const ADVISORS_MIGRATION_ID = "010_advisors";

/**
 * Asesores que reciben los avisos del bot.
 *
 * Hasta ahora había uno solo, fijado por variable de entorno (`SELLER_PHONE`),
 * así que sumar a alguien exigía un redeploy. Con la tabla, el negocio agrega o
 * quita asesores desde el panel y cada aviso sale a todos los activos.
 *
 * `prioridad` ordena a quién se le manda primero; 0 es el principal.
 */
export async function runAdvisorsMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists advisors (
        id         bigserial primary key,
        nombre     text not null,
        -- Formato internacional SIN el "+", como lo espera la Graph API.
        telefono   text not null unique,
        prioridad  integer not null default 10,
        active     boolean not null default true,
        creado_en  timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists advisors_activos_idx on advisors (active, prioridad);

      -- Cada aviso se encola una vez POR asesor: sin el teléfono en la clave,
      -- el segundo asesor chocaba con el unique del primero y nunca recibía nada.
      alter table advisor_notifications
        drop constraint if exists advisor_notifications_dedupe_key_key;
      create unique index if not exists advisor_notifications_dedupe_destinatario_idx
        on advisor_notifications (dedupe_key, recipient_phone);

      insert into schema_migrations (id)
      values ('010_advisors')
      on conflict (id) do nothing;
    `);

    // Siembra única. El asesor del entorno entra como principal para no perder
    // los avisos que ya funcionaban.
    const [seeded] = await tx<{ key: string }[]>`
      insert into settings (key, value)
      values ('advisors_seeded_v1', 'true'::jsonb)
      on conflict (key) do nothing
      returning key
    `;
    if (!seeded) return;

    const delEntorno = (process.env.SELLER_PHONE ?? "").replace(/\D/g, "");
    if (delEntorno) {
      await tx`
        insert into advisors (nombre, telefono, prioridad)
        values (${process.env.SELLER_NAME ?? "Asesor principal"}, ${delEntorno}, 0)
        on conflict (telefono) do nothing
      `;
    }
  });
}

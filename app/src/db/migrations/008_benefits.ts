import type { Sql } from "../client.js";

export const BENEFITS_MIGRATION_ID = "008_benefits";

/**
 * Bloque *INCLUYE* que los vendedores humanos mandan después de cada precio.
 *
 * Va en tabla y no en el prompt a propósito: el §8 del PDF de especificaciones
 * prohíbe que una promoción viva escrita en las instrucciones del modelo, porque
 * entonces nadie del negocio puede cambiarla ni darla de baja cuando vence. Cada
 * beneficio lleva sus condiciones (marca, cantidad mínima, sucursal, vigencia)
 * para que el bot solo prometa lo que aplica a ese cliente.
 */
export async function runBenefitsMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists benefits (
        id           bigserial primary key,
        text         text not null,
        position     integer not null default 0,
        active       boolean not null default true,
        -- Condiciones: null = sin restricción por ese eje.
        brand        text,
        min_quantity integer,
        store        text,
        starts_at    timestamptz,
        expires_at   timestamptz,
        created_at   timestamptz not null default now(),
        updated_at   timestamptz not null default now()
      );
      create index if not exists benefits_active_idx
        on benefits (active, position);

      insert into schema_migrations (id)
      values ('008_benefits')
      on conflict (id) do nothing;
    `);

    // Siembra única: el texto literal de los tres chats que el cliente mandó
    // como modelo. Se hace una sola vez — si el negocio los edita o los borra,
    // un redeploy no debe resucitarlos.
    const [seeded] = await tx<{ key: string }[]>`
      insert into settings (key, value)
      values ('benefits_seeded_v1', 'true'::jsonb)
      on conflict (key) do nothing
      returning key
    `;
    if (!seeded) return;

    const defaults = [
      "Todos los servicios de instalación y beneficios",
      "Seguro gratuito contra golpes, cortes o cualquier daño que sufra la llanta",
      "Mantenimiento gratuito cada 10.000km para alargar la vida útil de las llantas",
      // Se quitó "Camiseta de la TRI🇪🇨": la promoción venció en agosto de 2026.
      "Revisión gratuita de su vehículo para que ruede seguro",
    ];
    for (const [index, text] of defaults.entries()) {
      await tx`
        insert into benefits (text, position, active)
        values (${text}, ${index}, true)
      `;
    }
  });
}

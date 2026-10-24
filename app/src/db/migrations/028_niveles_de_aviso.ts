import type { Sql } from "../client.js";

export const NIVELES_DE_AVISO_MIGRATION_ID = "028_niveles_de_aviso";

/**
 * Los niveles de aviso dejan de ser dos fijos.
 *
 * Manuel (24-oct): «Todo» y «Solo local» confundían, y quería poder crear
 * niveles nuevos para asignar. Los niveles ahora viven en `settings`
 * (`aviso_niveles`) y `advisors.rol` guarda el id del nivel, así que el check
 * que solo aceptaba 'admin' o 'asesor' sobra. Los ids viejos siguen siendo
 * válidos: 'admin' es el Nivel 1 y 'asesor' el Nivel 2, y nadie pierde avisos.
 * La validación de que el nivel exista pasa a la API (admin.ts), que sabe
 * cuáles hay.
 */
export async function runNivelesDeAvisoMigration(sql: Sql): Promise<void> {
  await sql.unsafe(/* sql */ `
    alter table advisors drop constraint if exists advisors_rol_valido;

    insert into schema_migrations (id)
    values ('${NIVELES_DE_AVISO_MIGRATION_ID}')
    on conflict (id) do nothing;
  `);
}

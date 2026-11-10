import type { Sql } from "../client.js";

export const ROLES_DE_ASESOR_MIGRATION_ID = "018_roles_de_asesor";

/**
 * Nivel de aviso de cada asesor.
 *
 * Hasta ahora todos recibían todo: el que atiende el local se comía el reporte
 * de las 20:00, las trazas del guardián y las fallas de envío. La reunión del
 * 14-ago partió la lista en dos — `admin` (Manuel, Joaquín) sigue igual, y
 * `asesor` recibe solo los cinco avisos que puede accionar desde el mostrador.
 *
 * El default es `admin` a propósito: al correr la migración nadie pierde un
 * aviso que ya estaba recibiendo. Bajar a alguien a `asesor` es una decisión
 * explícita que se toma desde Ajustes.
 */
export async function runRolesDeAsesorMigration(sql: Sql): Promise<void> {
  await sql.unsafe(/* sql */ `
    alter table advisors add column if not exists rol text not null default 'admin';

    -- Aquí se creaba el check advisors_rol_valido (rol in 'admin','asesor').
    -- Ya NO: la 028 lo quita porque los niveles de aviso pasaron a ser
    -- configurables, pero esta migración corre en CADA arranque y lo volvía a
    -- crear. Con un asesor en un nivel nuevo, el arranque moría con 23514 y el
    -- deploy quedaba FAILED (9-nov 18:06): Depot no podía reiniciar.

    insert into schema_migrations (id)
    values ('${ROLES_DE_ASESOR_MIGRATION_ID}')
    on conflict (id) do nothing;
  `);
}

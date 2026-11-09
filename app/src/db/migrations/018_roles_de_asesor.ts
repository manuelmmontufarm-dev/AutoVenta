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

    -- El check advisors_rol_valido (solo 'admin'/'asesor') ya NO se crea acá.
    -- Desde la 028 rol guarda el id de cualquier nivel (p. ej. 'nivel-2') y
    -- la 028 borra el check. Pero esta migración corre en CADA arranque, antes
    -- que la 028: volvía a crear el check y, con un asesor en un nivel nuevo,
    -- el arranque moría (deploy FAILED de Depot, 9-nov-2026). La validación del
    -- nivel vive en la API (admin.ts).

    insert into schema_migrations (id)
    values ('${ROLES_DE_ASESOR_MIGRATION_ID}')
    on conflict (id) do nothing;
  `);
}

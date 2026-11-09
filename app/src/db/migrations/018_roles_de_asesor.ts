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

    -- Un rol mal escrito desde la API dejaría al asesor sin ningún aviso (el
    -- filtro no lo reconocería como admin ni como asesor). Que falle al
    -- guardarse, no en silencio a las tres semanas.
    do $$
    begin
      -- Una vez aplicada 028 (los niveles viven en settings y rol guarda el id del nivel,
      -- p. ej. 'nivel-2'), este check ya no aplica: 028 lo borró a propósito. Sin esta
      -- compuerta, cada arranque lo volvía a crear y Postgres validaba las filas existentes:
      -- con un asesor en 'nivel-2' daba 23514 y el bot no arrancaba (9-nov-2026).
      if not exists (
        select 1 from pg_constraint where conname = 'advisors_rol_valido'
      ) and not exists (
        select 1 from schema_migrations where id = '028_niveles_de_aviso'
      ) then
        alter table advisors add constraint advisors_rol_valido
          check (rol in ('admin', 'asesor'));
      end if;
    end $$;

    insert into schema_migrations (id)
    values ('${ROLES_DE_ASESOR_MIGRATION_ID}')
    on conflict (id) do nothing;
  `);
}

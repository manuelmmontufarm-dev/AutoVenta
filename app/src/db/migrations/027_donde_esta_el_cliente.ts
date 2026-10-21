import type { Sql } from "../client.js";

export const DONDE_ESTA_EL_CLIENTE_MIGRATION_ID = "027_donde_esta_el_cliente";

/**
 * DÓNDE ESTÁ EL CLIENTE, guardado como hecho cuando lo dice (auditoría del
 * 19-oct, familia 7-A; regla de Manuel del 20-oct: ningún estado se recupera
 * releyendo textos).
 *
 * Hasta hoy `porQueNoPasaPorElLocal` volvía a leer los últimos 40 mensajes del
 * cliente en cada turno, y lo que la regla no reconocía —«parte de Manabí»,
 * «Tungurahua Cantón Píllaro», «soy de provincia»— no existía para nadie: en
 * 27932 y 8924 salieron mapas, «¿A cuál local…?» y «¿Qué día puede pasar…?».
 *
 * `cobertura_estado`: 'cobertura' | 'viene' | 'fuera' (`domain/fueraDeCobertura.ts`).
 * `cobertura_ciclo`: el ciclo en que lo dijo — de otro ciclo solo se hereda el
 * lugar, no el viaje («viene» de un ciclo viejo cuenta como «fuera»).
 * No se borra al reabrir: la ciudad de una persona no cambia porque el chat se
 * enfrió. Nulo en las conversaciones anteriores: ahí se lee la conversación,
 * como antes.
 */
export async function runDondeEstaElClienteMigration(sql: Sql): Promise<void> {
  await sql.unsafe(`
    alter table conversations add column if not exists cobertura_estado text;
    alter table conversations add column if not exists cobertura_ciudad text;
    alter table conversations add column if not exists cobertura_ciclo integer;
    alter table conversations add column if not exists cobertura_dicha_at timestamptz;
  `);
  await sql`
    insert into schema_migrations (id)
    values (${DONDE_ESTA_EL_CLIENTE_MIGRATION_ID})
    on conflict do nothing
  `;
}

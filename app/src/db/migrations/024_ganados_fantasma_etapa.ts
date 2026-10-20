import type { Sql } from "../client.js";
import { MOTIVO_CORREGIDO } from "./023_ganados_fantasma.js";

export const GANADOS_FANTASMA_ETAPA_MIGRATION_ID = "024_ganados_fantasma_etapa";

/**
 * Remate de la 023. Esa migración comparaba `closed_at` con una fecha que
 * pasó por JavaScript (milisegundos) contra una columna con microsegundos:
 * las filas de `sales_history` sí se corrigieron, pero la etapa de la
 * conversación quedó en `ganado` (convs 3 y 8162 en producción, 28-sep).
 * Acá el cruce es entero en SQL: toda conversación que sigue «ganada» por el
 * cierre del arranque y cuyo ciclo ya figura corregido en `sales_history`
 * pasa a `perdido` con el mismo motivo.
 */
export async function runGanadosFantasmaEtapaMigration(sql: Sql): Promise<void> {
  const [ya] = await sql<{ existe: boolean }[]>`
    select exists(select 1 from schema_migrations where id = ${GANADOS_FANTASMA_ETAPA_MIGRATION_ID}) as existe
  `;
  if (ya?.existe) return;
  const corregidas = await sql<{ id: number }[]>`
    update conversations c
    set stage = 'perdido', closed_reason = ${MOTIVO_CORREGIDO}
    where c.stage = 'ganado'
      and c.closed_reason = 'Cliente confirmó explícitamente que la compra fue realizada'
      and exists (
        select 1 from sales_history s
        where s.conversation_id = c.id and s.cycle = c.current_cycle
          and s.reason = ${MOTIVO_CORREGIDO}
      )
    returning c.id
  `;
  if (corregidas.length) {
    console.warn(`🧹 Etapa de ganados fantasma corregida: ${corregidas.map((r) => r.id).join(", ")}`);
  }
  await sql`
    insert into schema_migrations (id)
    values (${GANADOS_FANTASMA_ETAPA_MIGRATION_ID})
    on conflict do nothing
  `;
}

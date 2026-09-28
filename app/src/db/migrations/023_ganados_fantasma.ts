import type { Sql } from "../client.js";

export const GANADOS_FANTASMA_MIGRATION_ID = "023_ganados_fantasma";

/** Los cierres «ganado» que fabricó el arranque, no una compra. */
export const MOTIVO_CORREGIDO =
  "Cierre automático corregido (28-sep-2026): no hubo confirmación de compra en el chat";

/**
 * Deshace los «ganados fantasma».
 *
 * Hasta el 28-sep-2026 el DDL de `schema.ts` traía un `update` que en CADA
 * arranque cerraba como ganada toda conversación cuyo cliente alguna vez
 * escribió «ya compré» — también «ya se compró en El Carmen» (conv 8162). Como
 * corría al arrancar, sus cierres caen en los instantes exactos de cada deploy
 * y sin ningún mensaje del cliente cerca: esa es la firma con la que se los
 * reconoce acá. Auditoría del 27-sep: 22 de los 33 ganados de septiembre.
 *
 * Qué hace: borra esas filas de `sales_history` (la métrica del panel) y pasa
 * la conversación a `perdido` con un motivo que dice por qué, si seguía en
 * `ganado` por ese mismo cierre. Un ganado de verdad tiene el «ya compré» del
 * cliente a minutos del cierre y no se toca.
 */
export async function runGanadosFantasmaMigration(sql: Sql): Promise<void> {
  const [ya] = await sql<{ existe: boolean }[]>`
    select exists(select 1 from schema_migrations where id = ${GANADOS_FANTASMA_MIGRATION_ID}) as existe
  `;
  if (ya?.existe) return;

  const fantasmas = await sql<{ conversation_id: number; cycle: number; closed_at: Date }[]>`
    select s.conversation_id, s.cycle, s.closed_at
    from sales_history s
    where s.outcome = 'ganado'
      and s.reason = 'Cliente confirmó explícitamente que la compra fue realizada'
      and not exists (
        select 1 from messages m
        where m.conversation_id = s.conversation_id
          and m.direction = 'inbound'
          and m.created_at between s.closed_at - interval '10 minutes' and s.closed_at
      )
  `;
  for (const f of fantasmas) {
    await sql`
      delete from sales_history
      where conversation_id = ${f.conversation_id} and cycle = ${f.cycle}
    `;
    await sql`
      update conversations
      set stage = 'perdido', closed_reason = ${MOTIVO_CORREGIDO}
      where id = ${f.conversation_id}
        and stage = 'ganado'
        and closed_reason = 'Cliente confirmó explícitamente que la compra fue realizada'
        and closed_at = ${f.closed_at}
    `;
    await sql`
      insert into sales_history (conversation_id, cycle, outcome, reason, closed_at)
      values (${f.conversation_id}, ${f.cycle}, 'perdido', ${MOTIVO_CORREGIDO}, ${f.closed_at})
      on conflict (conversation_id, cycle) do nothing
    `;
  }
  if (fantasmas.length) {
    console.warn(`🧹 Ganados fantasma corregidos: ${fantasmas.length} (${fantasmas.map((f) => f.conversation_id).join(", ")})`);
  }
  await sql`
    insert into schema_migrations (id)
    values (${GANADOS_FANTASMA_MIGRATION_ID})
    on conflict do nothing
  `;
}

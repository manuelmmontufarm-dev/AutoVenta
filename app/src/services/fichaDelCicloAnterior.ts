/**
 * Lee de la base la ficha del ciclo anterior (`domain/fichaDelCicloAnterior.ts`).
 *
 * Solo datos guardados: la fila de `sales_history` que se archivó al cerrar
 * (con su local y sus fechas desde el 21-nov), el registro de la venta de ese
 * ciclo (`ventas_registradas`: factura y monto), la cotización a la que apunta, y
 * el último mensaje que una persona (owner/advisor) le escribió al cliente en
 * los ciclos anteriores.
 *
 * Qué ciclo: el más reciente ANTERIOR al vigente que tenga algo que contar. Un
 * ciclo vacío (se abrió y se reinició por silencio sin que nadie anotara nada)
 * se salta: en la conv 469 habría tapado la venta ganada del ciclo 1. Un
 * `/restart` corta la búsqueda: empezar de cero a propósito no arrastra nada.
 */
import { sql } from "../db/client.js";
import { detalleDeItems } from "../domain/detalleDeCotizacion.js";
import type { FichaDelCicloAnterior } from "../domain/fichaDelCicloAnterior.js";
import { MOTIVO_DEL_RESTART } from "../domain/reinicio.js";

export async function leerFichaDelCicloAnterior(conversationId: number): Promise<FichaDelCicloAnterior | null> {
  const filas = await sql<{
    cycle: number; outcome: "ganado" | "perdido"; reason: string | null; closed_at: Date;
    tire_size: string | null; selected_product_code: string | null; selected_quantity: number | null;
    quote_number: string | null; total: string | number | null; store: string | null;
    pickup_date: Date | null; visit_date: Date | null; items: unknown;
    factura: string | null; monto: string | number | null;
  }[]>`
    select s.cycle, s.outcome, s.reason, s.closed_at, s.tire_size, s.selected_product_code,
      s.selected_quantity, s.quote_number, s.total, s.store, s.pickup_date, s.visit_date, q.items,
      v.factura, v.monto
    from sales_history s
    join conversations c on c.id = s.conversation_id
    left join quotes q on q.id = s.quote_id
    left join lateral (
      select factura, monto from ventas_registradas
      where conversation_id = s.conversation_id and cycle = s.cycle and anulada_at is null
      order by id desc limit 1
    ) v on true
    where s.conversation_id = ${conversationId} and s.cycle < c.current_cycle
    order by s.cycle desc
    limit 8
  `;
  for (const f of filas) {
    if (f.reason === MOTIVO_DEL_RESTART) return null;
    const tieneAlgo = f.outcome === "ganado" || f.tire_size || f.selected_product_code || f.quote_number
      || f.store || f.pickup_date || f.visit_date;
    if (!tieneAlgo) continue;
    const items = Array.isArray(f.items) ? f.items as Array<{ quantity?: unknown; sizeLabel?: unknown; size?: unknown }> : [];
    const cantidadDeLaCotizacion = items.reduce((n, i) => n + (Number(i.quantity) || 0), 0) || null;
    const [humano] = await sql<{ content: string | null; created_at: Date }[]>`
      select content, created_at from messages
      where conversation_id = ${conversationId} and direction = 'outbound' and type <> 'note'
        and author_kind in ('owner', 'advisor')
        and cycle < (select current_cycle from conversations where id = ${conversationId})
        and coalesce(content, '') <> ''
      order by created_at desc, id desc limit 1
    `;
    return {
      cycle: Number(f.cycle),
      resultado: f.outcome,
      cerradoEn: f.closed_at,
      nota: f.reason,
      medida: f.tire_size ?? (items[0]?.sizeLabel ? String(items[0].sizeLabel) : items[0]?.size ? String(items[0].size) : null),
      llanta: detalleDeItems(f.items) ?? f.selected_product_code,
      cotizacion: f.quote_number || f.total != null
        ? {
            numero: f.quote_number,
            cantidad: f.selected_quantity ?? cantidadDeLaCotizacion,
            total: f.total == null ? null : Number(f.total),
          }
        : null,
      venta: f.factura || f.monto != null
        ? { factura: f.factura, monto: f.monto == null ? null : Number(f.monto) }
        : null,
      local: f.store,
      entrega: f.pickup_date,
      visita: f.visit_date,
      ultimoDelAsesor: humano?.content ? { texto: humano.content, en: humano.created_at } : null,
    };
  }
  return null;
}

/**
 * La pestaña Para cerrar del hub: lee de la base a quién le aplican las reglas
 * de `domain/paraCerrar.ts` y guarda lo que el asesor decide (✕, posponer,
 * sacar del archivo).
 */
import { sql } from "../db/client.js";
import { clasificar, type FilaParaCerrar, type ParaCerrar } from "../domain/paraCerrar.js";
import { diaDeGuayaquil } from "../domain/estadisticaVentas.js";
import { LOCAL_ELEGIDO } from "./conversations.js";
import { cruceVigente } from "./ventasConfirmadas.js";

/** Más atrás que esto el archivo ya no sirve para nada y la consulta crece sin límite. */
const ARCHIVO_DIAS = 90;
const ARCHIVO_MAX = 200;

interface FilaSql {
  id: string; name: string | null; phone: string; tire_size: string | null;
  // Cotizaciones del bot: {quantity, brand, design}; las viejas del hub: {cantidad, descripcion}.
  items: Array<{ quantity?: number; brand?: string; design?: string; cantidad?: number; descripcion?: string }> | null; total: string;
  cotizado_at: Date; nearest_store: string; visit_date: Date | null; visit_time_label: string | null;
  customer_commitment: string | null; last_customer_message_at: Date | null;
  ultimo_asesor: Date | null; asesor_antes_del_cliente: boolean;
  cerrar_descartado_at: Date | null; cerrar_pospuesto_hasta: Date | null;
  cerrar_pospuesto_en: Date | null; cerrar_revivido_at: Date | null;
}

export async function leerParaCerrar(ahora = new Date()): Promise<ParaCerrar> {
  const filas = await sql<FilaSql[]>`
    select c.id, c.name, c.phone, c.tire_size, q.items, q.total, q.created_at as cotizado_at,
      c.nearest_store, c.visit_date, c.visit_time_label, c.customer_commitment,
      c.last_customer_message_at, a.ultimo_asesor,
      exists (
        select 1 from messages m
        where m.conversation_id = c.id and m.cycle = c.current_cycle
          and m.role = 'assistant' and m.author_kind is distinct from 'bot'
          and m.created_at < c.last_customer_message_at
      ) as asesor_antes_del_cliente,
      c.cerrar_descartado_at, c.cerrar_pospuesto_hasta, c.cerrar_pospuesto_en, c.cerrar_revivido_at
    from conversations c
    join lateral (
      select items, total, created_at from quotes
      where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc limit 1
    ) q on true
    left join lateral (
      select max(m.created_at) as ultimo_asesor from messages m
      where m.conversation_id = c.id and m.cycle = c.current_cycle
        and m.role = 'assistant' and m.author_kind is distinct from 'bot'
    ) a on true
    where c.status = 'open'
      and c.nearest_store is not null
      and c.location_label like ${LOCAL_ELEGIDO + "%"}
      and greatest(c.last_customer_message_at, a.ultimo_asesor, c.cerrar_revivido_at)
          > now() - make_interval(days => ${ARCHIVO_DIAS})
  `;

  // Compró = factura con llantas el día de la cotización o después.
  const { ventas } = await cruceVigente();
  const diaDeCompra = new Map(ventas.map((v) => [v.ticketId, v.dia]));

  const resultado = clasificar(filas.map((f): FilaParaCerrar => {
    const compra = diaDeCompra.get(Number(f.id));
    return {
      ticketId: Number(f.id),
      nombre: f.name,
      telefono: f.phone,
      medida: f.tire_size,
      llantas: (f.items ?? [])
        .map((i) => `${i.quantity ?? i.cantidad ?? 1}× ${i.brand ? `${i.brand} ${i.design ?? ""}` : i.descripcion ?? ""}`.trim())
        .join(" · "),
      total: Number(f.total),
      local: f.nearest_store,
      visita: f.visit_date,
      visitaHora: f.visit_time_label,
      compromiso: f.customer_commitment,
      ultimoCliente: f.last_customer_message_at,
      ultimoAsesor: f.ultimo_asesor,
      asesorAntesDelCliente: f.asesor_antes_del_cliente,
      descartadoAt: f.cerrar_descartado_at,
      pospuestoHasta: f.cerrar_pospuesto_hasta,
      pospuestoEn: f.cerrar_pospuesto_en,
      revividoAt: f.cerrar_revivido_at,
      compro: Boolean(compra && compra >= diaDeGuayaquil(f.cotizado_at)),
    };
  }), ahora);
  resultado.archivo = resultado.archivo.slice(0, ARCHIVO_MAX);
  return resultado;
}

export type AccionParaCerrar =
  | { accion: "sacar" }
  | { accion: "devolver" }
  | { accion: "posponer"; hasta: Date }
  | { accion: "no_posponer" }
  | { accion: "revivir" }
  | { accion: "no_revivir" };

/** Lo que decide el asesor. `devolver` y `no_*` son el «Deshacer» del aviso. */
export async function decidirParaCerrar(conversationId: number, a: AccionParaCerrar): Promise<boolean> {
  const filas = await (() => {
    switch (a.accion) {
      case "sacar":
        return sql`update conversations set cerrar_descartado_at = now() where id = ${conversationId} returning id`;
      case "devolver":
        return sql`update conversations set cerrar_descartado_at = null where id = ${conversationId} returning id`;
      case "posponer":
        return sql`update conversations set cerrar_pospuesto_hasta = ${a.hasta}, cerrar_pospuesto_en = now() where id = ${conversationId} returning id`;
      case "no_posponer":
        return sql`update conversations set cerrar_pospuesto_hasta = null, cerrar_pospuesto_en = null where id = ${conversationId} returning id`;
      case "revivir":
        return sql`update conversations set cerrar_revivido_at = now(), cerrar_descartado_at = null where id = ${conversationId} returning id`;
      case "no_revivir":
        return sql`update conversations set cerrar_revivido_at = null where id = ${conversationId} returning id`;
    }
  })();
  return filas.length > 0;
}

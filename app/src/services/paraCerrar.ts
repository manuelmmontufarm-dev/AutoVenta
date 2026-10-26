/**
 * La pestaña Para cerrar del hub: lee de la base a quién le aplican las reglas
 * de `domain/paraCerrar.ts` y guarda lo que el asesor decide (✕, posponer,
 * sacar del archivo).
 */
import { sql } from "../db/client.js";
import {
  clasificar, DIAS_CALLADO_FRIO, DIAS_FECHA_FRIA, ESTADISTICA_POR_DEFECTO,
  type Estadistica, type FilaParaCerrar, type ParaCerrar,
} from "../domain/paraCerrar.js";
import { diaDeGuayaquil } from "../domain/estadisticaVentas.js";
import { medirCurva, type Observacion } from "../domain/llegada.js";
import { LOCAL_ELEGIDO } from "./conversations.js";
import { cruceVigente, ultimaSyncFacturas } from "./ventasConfirmadas.js";

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

/* ── La curva de llegada, medida con las ventas reales ──────────────────────
   Se rehace cuando baja una tanda nueva de facturas o cada 30 min (los días
   que pasan también cambian la curva: alguien más llegó a «3 días sin venir»). */

const REHACER_MS = 30 * 60_000;
let estadisticaGuardada: { at: number; sync: number | null; est: Estadistica } | null = null;

export async function estadisticaDeLlegada(ahora = new Date()): Promise<Estadistica> {
  const sync = ultimaSyncFacturas()?.getTime() ?? null;
  // Sin facturas bajadas todavía (recién arrancó) no hay nada que medir.
  if (sync === null) return ESTADISTICA_POR_DEFECTO;
  if (estadisticaGuardada && estadisticaGuardada.sync === sync && ahora.getTime() - estadisticaGuardada.at < REHACER_MS) {
    return estadisticaGuardada.est;
  }
  const { ventas } = await cruceVigente();
  const compra = new Map<number, string>();
  for (const v of ventas) if (!compra.has(v.ticketId) || v.dia < compra.get(v.ticketId)!) compra.set(v.ticketId, v.dia);
  const hoy = diaDeGuayaquil(ahora);

  // Reloj «fecha»: todos los que alguna vez dijeron un día (abiertos o cerrados).
  const conFecha = await sql<{ id: string; visit_date: Date }[]>`
    select id, visit_date from conversations where visit_date is not null
  `;
  const fecha: Observacion[] = conFecha.map((c) => ({ inicio: diaDeGuayaquil(c.visit_date), compra: compra.get(Number(c.id)) ?? null }));

  // Reloj «silencio»: los que eligieron local, desde su último mensaje antes de comprar.
  const conLocal = await sql<{ id: string; mensajes: Date[] | null }[]>`
    select c.id, (
      select array_agg(m.created_at order by m.created_at) from messages m
      where m.conversation_id = c.id and m.role = 'user'
    ) as mensajes
    from conversations c
    where c.location_label like ${LOCAL_ELEGIDO + "%"}
      and exists (select 1 from quotes q where q.conversation_id = c.id)
  `;
  const silencio: Observacion[] = [];
  for (const c of conLocal) {
    const dias = (c.mensajes ?? []).map(diaDeGuayaquil);
    const diaCompra = compra.get(Number(c.id)) ?? null;
    const previos = diaCompra ? dias.filter((d) => d <= diaCompra) : dias;
    const inicio = previos[previos.length - 1];
    if (inicio) silencio.push({ inicio, compra: diaCompra });
  }

  const est: Estadistica = {
    fecha: medirCurva(fecha, hoy, DIAS_FECHA_FRIA),
    silencio: medirCurva(silencio, hoy, DIAS_CALLADO_FRIO),
    calculada: ahora.toISOString(),
    ultimaFactura: new Date(sync).toISOString(),
  };
  estadisticaGuardada = { at: ahora.getTime(), sync, est };
  return est;
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

  const est = await estadisticaDeLlegada(ahora);
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
  }), ahora, est);
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

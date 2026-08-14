import { motion } from "framer-motion";
import { useMemo } from "react";
import { BillingSection } from "../components/billing";
import { AreaChart, DonutChart, FunnelChart, MetricBars, StatTile } from "../components/charts";
import { CIERRE_META, ETAPAS, ETAPA_META } from "../data/types";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

export function Dashboard() {
  const { tickets, feed, metrics } = useHub();
  const now = useNow();

  const stats = useMemo(() => {
    const abiertos = tickets.filter((t) => t.estado === "abierto");
    const conCotizacion = tickets.filter((t) => t.cotizacion);
    const ganados = tickets.filter((t) => t.cierre === "ganado");
    // El respaldo local solo ve la etapa de HOY: el ticket que llegó al final y
    // se cerró ya no cuenta. Por eso manda `metrics.reachedFinal`, que lo lee
    // del historial de etapas y sí incluye a los cerrados.
    const llegaronVisita = tickets.filter(
      (t) => t.cierre === "ganado" || t.etapa === "seguimiento_venta",
    );
    const conversion = metrics?.reachedFinal
      ? Math.round(metrics.reachedFinal.ratio * 100)
      : conCotizacion.length
        ? Math.round((llegaronVisita.length / conCotizacion.length) * 100)
        : 0;
    const enJuego = abiertos.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);
    const vendido = ganados.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);
    return {
      abiertos: metrics?.summary.abiertos ?? abiertos.length,
      cotizaciones: metrics?.summary.cotizaciones ?? conCotizacion.length,
      conversion,
      llegaron: metrics?.reachedFinal?.total ?? llegaronVisita.length,
      enJuego: metrics?.summary.enJuego ?? enJuego,
      vendido: metrics?.summary.vendido ?? vendido,
    };
  }, [tickets, metrics]);

  const embudo = useMemo(() => {
    if (metrics?.funnel?.length) {
      const byStage = new Map(metrics.funnel.map((item) => [item.stage, item.value]));
      return [
        ...ETAPAS.map((e) => ({ label: ETAPA_META[e].nombre, valor: byStage.get(e) ?? 0, color: ETAPA_META[e].color })),
        { label: "Ganado", valor: byStage.get("ganado") ?? 0, color: CIERRE_META.ganado.color },
      ];
    }
    const alcanza = (idx: number) =>
      tickets.filter((t) =>
        t.cierre === "ganado" ? true : ETAPAS.indexOf(t.etapa) >= idx,
      ).length;
    return [
      ...ETAPAS.map((e, i) => ({ label: ETAPA_META[e].nombre, valor: alcanza(i), color: ETAPA_META[e].color })),
      { label: "Ganado", valor: tickets.filter((t) => t.cierre === "ganado").length, color: CIERRE_META.ganado.color },
    ];
  }, [tickets, metrics]);

  const serie = useMemo(
    () => metrics?.daily.map((item) => item.value) ?? Array.from({ length: 14 }, () => 0),
    [metrics],
  );
  const piezasFallidas = (metrics?.visualPieces ?? []).reduce((total, p) => total + p.failed, 0);
  const replyHours = metrics?.replyHours ?? [];
  const peakReplyHour = replyHours.reduce((best, item) => item.replies > (best?.replies ?? -1) ? item : best, replyHours[0]);
  const maxHourReplies = Math.max(1, ...replyHours.map((item) => item.replies));

  return (
    <div className="h-full overflow-y-auto px-4 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <StatTile label="Tickets abiertos" valor={stats.abiertos} detalle="conversaciones activas ahora" delay={0} sparkline={serie} />
        <StatTile label="Cotizaciones enviadas" valor={stats.cotizaciones} detalle="PDF generados este mes" delay={0.06} />
        <StatTile
          label="Llegan a seguimiento"
          valor={stats.llegaron}
          color="var(--etapa-visita)"
          detalle={
            metrics?.reachedFinal
              ? `${metrics.reachedFinal.esteMes} este mes · ${metrics.reachedFinal.abiertosAhora} abiertos hoy`
              : "tickets que llegaron a la última columna"
          }
          delay={0.12}
        />
        <StatTile
          label="Cotizado → seguimiento"
          valor={stats.conversion}
          formato={(n) => `${Math.round(n)}%`}
          color="var(--color-lime)"
          detalle="de cada cotización enviada"
          progress={stats.conversion}
          delay={0.18}
        />
        <StatTile
          label="Respuesta del bot"
          valor={metrics?.summary.primeraRespuestaSegundos ?? 0}
          formato={(n) => (n > 0 ? `${Math.round(n)} s` : "—")}
          color="var(--color-ok)"
          detalle="mediana real de primera respuesta"
          delay={0.24}
        />
      </div>

      {/* La venta se cierra en el local y nadie la registra ahí. Esta sección
          dice en voz alta cuál es el número que sí se puede medir y cuál no,
          para que "conversión" no se lea como "ventas". */}
      {metrics?.reachedFinal && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass mt-2.5 rounded-3xl p-5">
          <div className="mb-4">
            <p className="microlabel">Hasta dónde llega el bot</p>
            <p className="mt-1 text-[10.5px] text-faint">
              La venta se cierra en el local y no vuelve al sistema, así que no se puede medir.
              Lo que sí se mide es cuántos tickets llegan a <b>Seguimiento hasta venta</b>: cotizados,
              con local y con la visita en conversación. Es el último punto que el bot controla.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "Llegaron al final", value: String(metrics.reachedFinal.total), detail: "en todo el histórico", color: "var(--etapa-visita)" },
              { label: "Este mes", value: String(metrics.reachedFinal.esteMes), detail: "llegadas desde el día 1", color: "var(--color-paper)" },
              { label: "De los cotizados", value: `${Math.round(metrics.reachedFinal.ratio * 100)}%`, detail: `${metrics.reachedFinal.cotizadosQueLlegaron} de ${metrics.reachedFinal.cotizados} cotizaciones`, color: "var(--color-lime)" },
              { label: "Abiertos ahora", value: String(metrics.reachedFinal.abiertosAhora), detail: "esperando la visita", color: "var(--color-warn)" },
              { label: "Confirmados como venta", value: String(metrics.reachedFinal.ganados), detail: "solo los que alguien marcó a mano", color: "var(--color-ok)" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-paper/[.07] bg-paper/[.035] p-4">
                <p className="microlabel">{item.label}</p>
                <p className="serif tnum mt-2 text-[25px]" style={{ color: item.color }}>{item.value}</p>
                <p className="mt-1 text-[10.5px] text-faint">{item.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] text-faint">
            Valor cotizado de los que llegaron: <span className="tnum font-bold text-lime">{money(metrics.reachedFinal.valor)}</span>.
            No es dinero cobrado — es lo que estaba sobre la mesa cuando la conversación llegó al final.
          </p>
        </motion.section>
      )}

      {replyHours.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass mt-2.5 rounded-3xl p-5">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div><p className="microlabel">¿A qué hora contestan más?</p><p className="mt-1 text-[10.5px] text-faint">Respuestas reales de clientes durante los últimos 90 días · hora de Guayaquil</p></div>
            <div className="rounded-2xl border border-paper/[.08] bg-paper/[.04] px-4 py-2 text-right"><p className="microlabel">Hora pico</p><p className="serif tnum text-[22px] text-lime">{peakReplyHour ? `${peakReplyHour.label}–${String((peakReplyHour.hour + 1) % 24).padStart(2, "0")}:00` : "—"}</p><p className="text-[10px] text-faint">{peakReplyHour?.replies ?? 0} respuestas</p></div>
          </div>
          <div className="flex h-36 items-end gap-1.5" aria-label="Respuestas por hora">
            {replyHours.map((item) => <div key={item.hour} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${item.label}: ${item.replies} respuestas`}><span className="tnum text-[8px] text-faint">{item.replies || ""}</span><div className="w-full rounded-t-md bg-lime/75" style={{ height: `${Math.max(item.replies ? 5 : 1, (item.replies / maxHourReplies) * 92)}px` }} /><span className="tnum text-[8px] text-faint">{item.hour % 3 === 0 ? String(item.hour).padStart(2, "0") : ""}</span></div>)}
          </div>
        </motion.section>
      )}

      {/* $ en juego / vendido */}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="glass rounded-3xl p-5">
          <p className="microlabel">En juego (pipeline abierto)</p>
          <p className="serif tnum mt-2 text-[26px] text-lime">{money(stats.enJuego)}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="glass rounded-3xl p-5">
          <p className="microlabel">Vendido (tickets ganados)</p>
          <p className="serif tnum mt-2 text-[26px]" style={{ color: "var(--color-ok)" }}>
            {money(stats.vendido)}
          </p>
        </motion.div>
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-5">
        {/* Serie 14 días */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-3xl p-5 lg:col-span-3"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <p className="microlabel">Conversaciones por día</p>
            <p className="text-[10.5px] text-faint">últimos 14 días</p>
          </div>
          <AreaChart serie={serie} />
        </motion.section>

        {/* Embudo */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
          className="glass rounded-3xl p-5 lg:col-span-2"
        >
          <p className="microlabel mb-4">Embudo del mes</p>
          <FunnelChart pasos={embudo} />
        </motion.section>
      </div>

      {/* Piezas visuales: la imagen ES el mensaje. Si no sale, el cliente
          recibe el texto largo y nadie se entera — por eso se mide aparte. */}
      {metrics?.visualPieces && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass mt-2.5 rounded-3xl p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="microlabel">Piezas visuales enviadas</p>
              <p className="mt-1 text-[10.5px] text-faint">
                Últimos 7 días. Una pieza fallida deja al cliente con el mensaje en texto.
              </p>
            </div>
            {piezasFallidas > 0 && (
              <span className="rounded-full bg-[var(--color-red)]/15 px-3 py-1 text-[10.5px] text-[var(--color-red)]">
                {piezasFallidas} sin entregar
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {metrics.visualPieces.map((pieza) => {
              const total = pieza.sent + pieza.failed;
              return (
                <div key={pieza.piece} className="rounded-2xl border border-paper/[.07] bg-paper/[.035] p-4">
                  <div className="flex items-baseline justify-between">
                    <p className="microlabel">{pieza.label}</p>
                    <p className="tnum text-[10.5px] text-faint">
                      {total === 0 ? "sin envíos" : `${Math.round((pieza.sent / total) * 100)}% entregadas`}
                    </p>
                  </div>
                  <p className="serif tnum mt-2 text-[22px]">
                    {pieza.sent}
                    <span className="text-[13px] text-faint"> enviadas</span>
                  </p>
                  <p
                    className="tnum mt-1 text-[11px]"
                    style={{ color: pieza.failed > 0 ? "var(--color-red)" : "var(--color-faint)" }}
                  >
                    {pieza.failed} fallidas
                    {pieza.renderErrors > 0 ? ` · ${pieza.renderErrors} con error de render` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {metrics?.followUps && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass mt-2.5 rounded-3xl p-5">
          <p className="microlabel mb-4">Resultados de seguimientos</p>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-6">
            {[
              ["Programados", metrics.followUps.scheduled], ["Enviados", metrics.followUps.sent],
              ["Respondidos", metrics.followUps.responded], ["Ventas recuperadas", metrics.followUps.converted],
              ["Cancelados por respuesta", metrics.followUps.cancelled_by_reply], ["Ventanas perdidas", metrics.followUps.missed_windows],
              ["Plantillas entregadas", metrics.followUps.template_delivered], ["Plantillas leídas", metrics.followUps.template_read],
              ["Opt-outs", metrics.followUps.opt_outs], ["Clientes molestos", metrics.followUps.negative],
              ["Promedio hasta respuesta", metrics.followUps.avg_response_seconds === null ? "—" : `${Math.round(metrics.followUps.avg_response_seconds / 60)} min`],
            ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-paper/[.07] bg-paper/[.035] p-4"><p className="microlabel">{label}</p><p className="serif tnum mt-2 text-[22px]">{value}</p></div>)}
          </div>
          <div className="mt-4 grid gap-2.5 lg:grid-cols-2">
            <div className="rounded-2xl border border-paper/[.07] bg-paper/[.025] p-4">
              <p className="microlabel mb-4">Recorrido de seguimientos</p>
              <MetricBars items={[
                { label: "Programados", value: metrics.followUps.scheduled, color: "var(--color-violet)" },
                { label: "Enviados", value: metrics.followUps.sent, color: "var(--color-lime)" },
                { label: "Respondidos", value: metrics.followUps.responded, color: "var(--color-ok)" },
                { label: "Ventas recuperadas", value: metrics.followUps.converted, color: "#f8ce5e" },
              ]} />
            </div>
            <div className="rounded-2xl border border-paper/[.07] bg-paper/[.025] p-4">
              <p className="microlabel mb-4">Estados reales de entrega</p>
              <DonutChart items={(metrics.deliveries.length > 0 ? metrics.deliveries : [{ status: "sin datos", value: 0 }]).map((item, index) => ({
                label: deliveryLabel(item.status),
                value: item.value,
                color: ["var(--color-violet)", "var(--color-ok)", "var(--color-lime)", "var(--color-warn)", "var(--color-danger)"][index % 5],
              }))} />
            </div>
          </div>
          {metrics.followUps.byStageAndType.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-faint"><tr><th className="py-2">Etapa</th><th>Tipo</th><th>Total</th><th>Enviados</th></tr></thead><tbody>{metrics.followUps.byStageAndType.map((row) => <tr key={`${row.stage}-${row.type}`} className="border-t border-paper/[.06]"><td className="py-2">{row.stage}</td><td>{row.type}</td><td>{row.total}</td><td>{row.sent}</td></tr>)}</tbody></table></div>}
        </motion.section>
      )}

      {metrics?.discounts && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass mt-2.5 rounded-3xl p-5">
          <div className="mb-4"><p className="microlabel">Impacto de descuentos autorizados</p><p className="mt-1 text-[10.5px] text-faint">Comparación por ciclo cotizado; muestra asociación, no causalidad.</p></div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <StatTile label="Ofertas con descuento" valor={metrics.discounts.offered} detalle={`${metrics.discounts.wonWith} terminaron en venta`} />
            <StatTile label="Conversión con descuento" valor={metrics.discounts.conversionWith * 100} formato={(n) => `${Math.round(n)}%`} color="var(--color-lime)" detalle="ciclos únicos" />
            <StatTile label="Respuesta tras oferta" valor={metrics.discounts.avgHoursToReply ?? 0} formato={(n) => metrics.discounts?.avgHoursToReply == null ? "—" : `${n.toFixed(1)} h`} detalle="promedio hasta el siguiente inbound" />
            <StatTile label="Descuento autorizado" valor={metrics.discounts.totalDiscount} formato={money} color="var(--color-warn)" detalle="monto acumulado" />
          </div>
          <div className="mt-4 grid gap-2.5 lg:grid-cols-2">
            <div className="rounded-2xl border border-paper/[.07] bg-paper/[.025] p-4"><p className="microlabel mb-4">Conversión: con vs. sin descuento</p><MetricBars items={[{ label: "Con descuento", value: Math.round(metrics.discounts.conversionWith * 100), color: "var(--color-lime)" }, { label: "Sin descuento", value: Math.round(metrics.discounts.conversionWithout * 100), color: "var(--color-violet)" }]} /></div>
            <div className="rounded-2xl border border-paper/[.07] bg-paper/[.025] p-4"><p className="microlabel mb-4">Días promedio hasta venta</p><MetricBars items={[{ label: "Con descuento", value: Number((metrics.discounts.avgDaysToWinWith ?? 0).toFixed(1)), color: "var(--color-ok)" }, { label: "Sin descuento", value: Number((metrics.discounts.avgDaysToWinWithout ?? 0).toFixed(1)), color: "var(--color-violet)" }]} /></div>
          </div>
        </motion.section>
      )}

      {/* Inventario real */}
      {metrics?.inventory && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass mt-2.5 rounded-3xl p-5"
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="microlabel">Inventario real</p>
              <p className="mt-1 text-xs text-paper/65">
                Salud del catálogo que usa el bot para recomendar y cotizar.
              </p>
            </div>
            <p className="tnum text-[10.5px] text-faint">
              {metrics.inventory.source?.toUpperCase() ?? "SIN FUENTE"}
              {metrics.inventory.lastSync
                ? ` · ${new Date(metrics.inventory.lastSync).toLocaleString("es-EC")}`
                : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "Productos",
                value: metrics.inventory.total,
                detail: `${metrics.inventory.brands} marcas`,
                color: "var(--color-paper)",
              },
              {
                label: "Disponibles",
                value: metrics.inventory.available,
                detail: `${Math.round(
                  (metrics.inventory.available / Math.max(metrics.inventory.total, 1)) * 100,
                )}% del catálogo`,
                color: "var(--color-ok)",
              },
              {
                label: "Por confirmar",
                value: metrics.inventory.check,
                detail: "validar antes de ofrecer",
                color: "var(--color-warn)",
              },
              {
                label: "Agotadas",
                value: metrics.inventory.out,
                detail: "fuera de recomendación",
                color: "var(--color-danger)",
              },
              {
                label: "Con fotografía",
                value: metrics.inventory.withImage,
                detail: "imagen exacta verificada",
                color: "var(--color-lime)",
              },
              {
                label: "Cobertura visual",
                value: metrics.inventory.imageCoverage,
                detail: "meta: 100%",
                color:
                  metrics.inventory.imageCoverage >= 90
                    ? "var(--color-ok)"
                    : "var(--color-warn)",
                suffix: "%",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-paper/[.07] bg-paper/[.035] p-4"
              >
                <p className="microlabel">{item.label}</p>
                <p
                  className="serif tnum mt-2 text-[25px]"
                  style={{ color: item.color }}
                >
                  {item.value.toLocaleString("es-EC")}
                  {item.suffix}
                </p>
                <p className="mt-1 text-[10.5px] text-faint">{item.detail}</p>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Tokens y cuenta del servicio */}
      <BillingSection />

      {/* Actividad */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.46 }}
        className="glass mt-2.5 rounded-3xl p-5"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="pulse-dot" />
          <p className="microlabel">Actividad en vivo</p>
        </div>
        <ul className="flex flex-col">
          {feed.slice(0, 9).map((item) => (
            <motion.li key={item.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
              <button
                onClick={() => item.ticketId && navigate(`ticket/${item.ticketId}`)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-paper/[.04]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: "color-mix(in srgb, var(--color-paper) 5%, transparent)" }}>
                  {item.icono}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-paper/85">{item.texto}</span>
                <span className="tnum shrink-0 text-[10.5px] text-faint">{relTime(item.hora, now)}</span>
              </button>
            </motion.li>
          ))}
        </ul>
      </motion.section>
    </div>
  );
}

function deliveryLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "En cola",
    sent: "Enviados",
    delivered: "Entregados",
    read: "Leídos",
    failed: "Fallidos",
    unknown: "Sin confirmar",
    "sin datos": "Sin datos",
  };
  return labels[status.toLowerCase()] ?? status;
}

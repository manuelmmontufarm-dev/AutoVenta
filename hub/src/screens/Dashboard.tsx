import { motion } from "framer-motion";
import { useMemo } from "react";
import { AreaChart, FunnelChart, StatTile } from "../components/charts";
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
    const llegaronVisita = tickets.filter(
      (t) => t.cierre === "ganado" || t.etapa === "handoff_visita",
    );
    const conversion = conCotizacion.length
      ? Math.round((llegaronVisita.length / conCotizacion.length) * 100)
      : 0;
    const enJuego = abiertos.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);
    const vendido = ganados.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);
    return {
      abiertos: metrics?.summary.abiertos ?? abiertos.length,
      cotizaciones: metrics?.summary.cotizaciones ?? conCotizacion.length,
      conversion,
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

  return (
    <div className="h-full overflow-y-auto px-4 pb-8">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Tickets abiertos" valor={stats.abiertos} detalle="conversaciones activas ahora" delay={0} />
        <StatTile label="Cotizaciones enviadas" valor={stats.cotizaciones} detalle="PDF generados este mes" delay={0.06} />
        <StatTile
          label="Cotizado → visita"
          valor={stats.conversion}
          formato={(n) => `${Math.round(n)}%`}
          color="var(--color-lime)"
          detalle="confirman que vienen al local"
          delay={0.12}
        />
        <StatTile
          label="Respuesta del bot"
          valor={metrics?.summary.primeraRespuestaSegundos ?? 0}
          formato={(n) => (n > 0 ? `${Math.round(n)} s` : "—")}
          color="var(--color-ok)"
          detalle="mediana real de primera respuesta"
          delay={0.18}
        />
      </div>

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

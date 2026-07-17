import { motion } from "framer-motion";
import { useMemo } from "react";
import { AreaChart, FunnelChart, StatTile } from "../components/charts";
import { CIERRE_META, ETAPAS, ETAPA_META } from "../data/types";
import { SERIE_14D } from "../data/mock/fixtures";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

export function Dashboard() {
  const { tickets, feed } = useHub();
  const now = useNow();

  const stats = useMemo(() => {
    const abiertos = tickets.filter((t) => t.estado === "abierto");
    const conCotizacion = tickets.filter((t) => t.cotizacion);
    const ganados = tickets.filter((t) => t.cierre === "ganado");
    const llegaronVisita = tickets.filter(
      (t) => t.cierre === "ganado" || t.etapa === "por_visitar",
    );
    const conversion = conCotizacion.length
      ? Math.round((llegaronVisita.length / conCotizacion.length) * 100)
      : 0;
    const enJuego = abiertos.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);
    const vendido = ganados.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);
    return { abiertos: abiertos.length, cotizaciones: conCotizacion.length, conversion, enJuego, vendido };
  }, [tickets]);

  const embudo = useMemo(() => {
    const alcanza = (idx: number) =>
      tickets.filter((t) =>
        t.cierre === "ganado" ? true : ETAPAS.indexOf(t.etapa) >= idx,
      ).length;
    return [
      ...ETAPAS.map((e, i) => ({ label: ETAPA_META[e].nombre, valor: alcanza(i), color: ETAPA_META[e].color })),
      { label: "Ganado", valor: tickets.filter((t) => t.cierre === "ganado").length, color: CIERRE_META.ganado.color },
    ];
  }, [tickets]);

  const serie = useMemo(() => {
    const copia = [...SERIE_14D];
    copia[copia.length - 1] = Math.max(copia[copia.length - 1], stats.abiertos);
    return copia;
  }, [stats.abiertos]);

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
          color="#a9c39d"
          detalle="confirman que vienen al local"
          delay={0.12}
        />
        <StatTile
          label="Respuesta del bot"
          valor={9}
          formato={(n) => `${Math.round(n)} s`}
          color="#86c79a"
          detalle="promedio · 24/7 sin descanso"
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
          <p className="serif tnum mt-2 text-[26px]" style={{ color: "#86c79a" }}>
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

      {/* Actividad */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42 }}
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
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[.04]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: "rgba(255,255,255,.05)" }}>
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

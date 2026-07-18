import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { ETAPAS, ETAPA_META, type Etapa, type Ticket } from "../data/types";
import { relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";
import { IconSearch } from "../components/icons";
import { AtiendePill, Avatar, CierreBadge, EmptyState, Segmented, SkeletonRows, StageBadge } from "../components/ui";

type FiltroEstado = "abiertos" | "cerrados" | "todos";

function TicketRow({ ticket, now }: { ticket: Ticket; now: number }) {
  const esperando = ticket.sinLeer > 0;
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      onClick={() => navigate(`ticket/${ticket.id}`)}
      className="group flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-[background,transform] duration-150 hover:-translate-y-px hover:bg-paper/[.045]"
    >
      <Avatar ticket={ticket} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-[13.5px] ${esperando ? "font-bold text-paper" : "font-semibold text-paper/90"}`}>
            {ticket.nombre ?? ticket.telefono}
          </p>
          <span className={`tnum shrink-0 text-[11px] ${esperando ? "font-bold text-red" : "text-faint"}`}>
            {relTime(ticket.ultimaActividad, now)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-xs ${esperando ? "text-paper/80" : "text-muted"}`}>{ticket.ultimoMensaje}</p>
          {esperando && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="tnum grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-red px-1 text-[10.5px] font-bold text-white"
            >
              {ticket.sinLeer}
            </motion.span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          {ticket.estado === "cerrado" && ticket.cierre ? <CierreBadge cierre={ticket.cierre} /> : <StageBadge etapa={ticket.etapa} />}
          <AtiendePill atiende={ticket.atiende} />
          {ticket.medida && <span className="medida-chip hidden text-[10.5px] text-muted sm:inline">{ticket.medida}</span>}
        </div>
      </div>
    </motion.button>
  );
}

export function Inbox() {
  const { tickets, cargando } = useHub();
  const now = useNow();
  const [estado, setEstado] = useState<FiltroEstado>("abiertos");
  const [etapa, setEtapa] = useState<Etapa | "todas">("todas");
  const [q, setQ] = useState("");

  const abiertos = tickets.filter((t) => t.estado === "abierto").length;
  const cerrados = tickets.length - abiertos;

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return tickets.filter((t) => {
      if (estado === "abiertos" && t.estado !== "abierto") return false;
      if (estado === "cerrados" && t.estado !== "cerrado") return false;
      if (etapa !== "todas" && (t.estado !== "abierto" || t.etapa !== etapa)) return false;
      if (texto) {
        const blob = `${t.nombre ?? ""} ${t.telefono} ${t.medida ?? ""} ${t.vehiculo ?? ""}`.toLowerCase();
        if (!blob.includes(texto)) return false;
      }
      return true;
    });
  }, [tickets, estado, etapa, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2.5 px-4 pt-1 pb-3">
        <Segmented<FiltroEstado>
          id="estado"
          valor={estado}
          onChange={setEstado}
          opciones={[
            { valor: "abiertos", label: "Abiertos", badge: abiertos },
            { valor: "cerrados", label: "Cerrados", badge: cerrados },
            { valor: "todos", label: "Todos" },
          ]}
        />
        <div className="glass flex min-w-40 flex-1 items-center gap-2 rounded-xl px-3 py-2 sm:max-w-64">
          <IconSearch size={14} className="shrink-0 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, medida, vehículo…"
            className="w-full bg-transparent text-xs outline-none placeholder:text-faint"
          />
        </div>
      </div>

      <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-3">
        <FiltroEtapaChip activo={etapa === "todas"} color="#8b95ab" label="Todas" onClick={() => setEtapa("todas")} />
        {ETAPAS.map((e) => (
          <FiltroEtapaChip
            key={e}
            activo={etapa === e}
            color={ETAPA_META[e].color}
            label={ETAPA_META[e].nombre}
            onClick={() => setEtapa(etapa === e ? "todas" : e)}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {cargando ? (
          <SkeletonRows n={8} />
        ) : visibles.length === 0 ? (
          <EmptyState
            titulo={estado === "cerrados" ? "Sin tickets cerrados aquí" : "Sin tickets en esta vista"}
            detalle="El bot está atento — cuando un cliente escriba, su ticket aparece aquí solo."
          />
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {visibles.map((t) => (
              <TicketRow key={t.id} ticket={t} now={now} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function FiltroEtapaChip({
  activo,
  color,
  label,
  onClick,
}: {
  activo: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-all"
      style={{
        color: activo ? color : "var(--color-muted)",
        background: activo ? `color-mix(in srgb, ${color} 14%, transparent)` : "color-mix(in srgb, var(--color-paper) 4%, transparent)",
        border: `1px solid ${activo ? `color-mix(in srgb, ${color} 38%, transparent)` : "color-mix(in srgb, var(--color-paper) 6%, transparent)"}`,
      }}
    >
      {label}
    </button>
  );
}

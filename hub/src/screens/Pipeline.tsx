import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { FunnelChart } from "../components/charts";
import { Avatar, EmptyState, Segmented } from "../components/ui";
import { CIERRE_META, ETAPAS, ETAPA_META, type Etapa, type FollowUpBucket, type FollowUpCard, type Ticket } from "../data/types";
import { money, moneyCompact, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";
import { CerrarSheet } from "./TicketDetail";

function CardKanban({ ticket, now, arrastrando = false }: { ticket: Ticket; now: number; arrastrando?: boolean }) {
  return (
    <div
      className={`glass w-full rounded-2xl p-3 text-left ${arrastrando ? "rotate-2 scale-105 shadow-pop" : "shadow-soft"}`}
      style={{ cursor: arrastrando ? "grabbing" : "grab" }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar ticket={ticket} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">{ticket.nombre ?? ticket.telefono}</p>
          <p className="tnum text-[10px] text-faint">{relTime(ticket.ultimaActividad, now)}</p>
        </div>
        {ticket.sinLeer > 0 && <span className="pulse-dot rojo" />}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {ticket.medida ? (
          <span className="medida-chip rounded-md px-1.5 py-0.5 text-[10.5px] text-paper/85" style={{ background: "color-mix(in srgb, var(--color-paper) 7%, transparent)" }}>
            {ticket.medida}
          </span>
        ) : (
          <span className="text-[10.5px] text-faint italic">sin medida</span>
        )}
        {ticket.cotizacion && <span className="tnum text-[11.5px] font-bold text-lime">{money(ticket.cotizacion.total)}</span>}
      </div>
    </div>
  );
}

function CardArrastrable({ ticket, now }: { ticket: Ticket; now: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id });
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: isDragging ? 0.25 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && navigate(`ticket/${ticket.id}`)}
    >
      <CardKanban ticket={ticket} now={now} />
    </motion.div>
  );
}

function Columna({ etapa, tickets, now }: { etapa: Etapa; tickets: Ticket[]; now: number }) {
  const meta = ETAPA_META[etapa];
  const { setNodeRef, isOver } = useDroppable({ id: etapa });
  const potencial = tickets.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);

  return (
    <div className="flex w-60 shrink-0 flex-col" ref={setNodeRef}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
        <span className="text-xs font-bold tracking-wide uppercase" style={{ color: meta.color }}>
          {meta.nombre}
        </span>
        <span className="tnum rounded-full px-1.5 text-[10.5px] font-bold text-muted" style={{ background: "color-mix(in srgb, var(--color-paper) 6%, transparent)" }}>
          {tickets.length}
        </span>
        <span className="tnum ml-auto text-[10.5px] font-bold text-faint">{potencial > 0 ? moneyCompact(potencial) : ""}</span>
      </div>
      <p className="mb-2 px-1 text-[10px] leading-snug text-faint">{meta.descripcion}</p>
      <div
        className="flex min-h-24 flex-1 flex-col gap-2 rounded-2xl p-2 transition-colors"
        style={{
          background: isOver ? `color-mix(in srgb, ${meta.color} 7%, transparent)` : "color-mix(in srgb, var(--color-paper) 2%, transparent)",
          border: `1px dashed ${isOver ? `color-mix(in srgb, ${meta.color} 45%, transparent)` : "color-mix(in srgb, var(--color-paper) 6%, transparent)"}`,
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {tickets.map((t) => (
            <CardArrastrable key={t.id} ticket={t} now={now} />
          ))}
        </AnimatePresence>
        {tickets.length === 0 && (
          <p className="py-6 text-center text-[10.5px] text-faint italic">Suelta un ticket aquí</p>
        )}
      </div>
    </div>
  );
}

function ZonaCierre() {
  const { setNodeRef, isOver } = useDroppable({ id: "cerrar" });
  return (
    <div
      ref={setNodeRef}
      className="grid w-36 shrink-0 place-items-center rounded-2xl text-center transition-all"
      style={{
        background: isOver ? "color-mix(in srgb, var(--color-violet) 12%, transparent)" : "color-mix(in srgb, var(--color-paper) 2%, transparent)",
        border: `1px dashed ${isOver ? "var(--color-violet)" : "color-mix(in srgb, var(--color-paper) 8%, transparent)"}`,
        transform: isOver ? "scale(1.03)" : "scale(1)",
      }}
    >
      <div className="px-3 py-6">
        <p className="text-2xl">🏁</p>
        <p className="mt-1.5 text-[11px] font-bold text-paper/80">Cerrar ticket</p>
        <p className="mt-0.5 text-[10px] text-faint">ganado · perdido</p>
      </div>
    </div>
  );
}

const FOLLOW_UP_GROUPS: Array<{ id: FollowUpBucket; label: string; icon: string; hint: string }> = [
  { id: "attention_now", label: "Atención ahora", icon: "🔴", hint: "Vencidos o listos para actuar" },
  { id: "today", label: "Programados para hoy", icon: "⏰", hint: "Ordenados por hora de envío" },
  { id: "commitments", label: "Visitas y compromisos", icon: "🚗", hint: "Clientes que dijeron cuándo irían o retirarían" },
  { id: "scheduled", label: "Programados", icon: "📅", hint: "Próximos envíos, en orden de tiempo" },
  { id: "human_review", label: "Revisión humana", icon: "👤", hint: "Sin respuesta; decidir si continuar o marcar Perdido" },
  { id: "window_closed", label: "Ventana cerrada", icon: "🔒", hint: "Solo se puede contactar con plantilla aprobada" },
  { id: "cancelled_failed", label: "Cancelados o fallidos", icon: "⚠️", hint: "Casos que necesitan revisión técnica" },
];

function FollowUpCardView({ item, now }: { item: FollowUpCard; now: number }) {
  const { setAtiende, followUpAction, cerrar } = useHub();
  const [copied, setCopied] = useState(false);
  const remaining = item.windowClosesAt
    ? Math.max(0, new Date(item.windowClosesAt).getTime() - now)
    : null;
  const remainingLabel = remaining === null ? "Sin ventana" : remaining === 0
    ? "Ventana cerrada"
    : `${Math.floor(remaining / 3_600_000)} h ${Math.floor((remaining % 3_600_000) / 60_000)} min`;
  const dueLabel = item.dueAt ? new Date(item.dueAt).toLocaleString("es-EC", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "Sin programar";
  return <article className="glass rounded-xl px-3 py-2.5 shadow-soft transition-colors hover:bg-paper/[.035]">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button onClick={() => navigate(`ticket/${item.conversationId}`)} className="min-w-0 text-left text-[12.5px] font-black hover:text-lime hover:underline">{item.customer}</button>
      <span className="rounded-full bg-paper/[.07] px-2 py-0.5 text-[9.5px] font-bold">{ETAPA_META[item.stage].corto}</span>
      {(item.tireSize || item.selectedProductCode) && <span className="truncate text-[10.5px] text-muted">{item.tireSize ?? item.selectedProductCode}</span>}
      <span className="tnum ml-auto text-[10.5px] font-bold">{dueLabel}</span>
      <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[9.5px] font-bold">{remainingLabel}</span>
    </div>
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
      <span className={item.unansweredDays > 0 ? "font-black text-red" : "text-faint"}>Sin responder {item.unansweredDays} {item.unansweredDays === 1 ? "día" : "días"}</span>
      {item.commitment && <span className="line-clamp-1 text-lime">🚗 {item.commitment}</span>}
      {!item.commitment && <span className="line-clamp-1 min-w-0 flex-1 text-faint">{item.summary}</span>}
    </div>
    {item.preview && <div className="mt-2 rounded-lg bg-paper/[.045] px-2.5 py-2">
      <p className="text-[9px] font-black uppercase tracking-wider text-faint">Mensaje programado</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed">{item.preview}</p>
      {item.type !== "advisor_review" && <button onClick={() => void navigator.clipboard.writeText(item.preview).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })} className="mt-1 text-[9.5px] font-black text-lime hover:underline">{copied ? "✓ Copiado" : "Copiar mensaje"}</button>}
    </div>}
    {(item.templateRequired || item.alertReason) && <p className="mt-1.5 text-[10px] font-bold text-amber-500">{item.templateRequired ? `Plantilla: ${item.templateRequired}` : `Motivo: ${item.alertReason}`}</p>}
    <div className="mt-2 flex flex-wrap gap-1">
      <button onClick={() => navigate(`ticket/${item.conversationId}`)} className="rounded-md bg-paper/10 px-2 py-1 text-[9.5px] font-bold">Abrir chat</button>
      {item.assignedTo === "bot" && <button onClick={() => void setAtiende(item.conversationId, "humano")} className="rounded-md bg-violet/15 px-2 py-1 text-[9.5px] font-bold">Tomar control</button>}
      {item.bucket === "human_review" && item.assignedTo === "human" && <button onClick={() => void setAtiende(item.conversationId, "bot")} className="rounded-md bg-lime/15 px-2 py-1 text-[9.5px] font-bold">Continuar con bot</button>}
      {item.bucket === "human_review" && <button onClick={() => { if (window.confirm(`¿Marcar a ${item.customer} como Perdido por falta de respuesta?`)) void cerrar(item.conversationId, "perdido", "Sin respuesta tras revisión humana"); }} className="rounded-md bg-red/10 px-2 py-1 text-[9.5px] font-bold text-red">Marcar Perdido</button>}
      {item.id && item.status === "scheduled" && <button onClick={() => void followUpAction(item.id!, "send")} className="rounded-md bg-lime/15 px-2 py-1 text-[9.5px] font-bold">Enviar ahora</button>}
      {item.id && item.status === "scheduled" && <button onClick={() => { const value = window.prompt("Editar mensaje", item.preview); if (value?.trim()) void followUpAction(item.id!, "edit", value.trim()); }} className="rounded-md bg-paper/10 px-2 py-1 text-[9.5px] font-bold">Editar</button>}
      {item.id && ["scheduled", "blocked"].includes(item.status ?? "") && <button onClick={() => void followUpAction(item.id!, "cancel")} className="rounded-md bg-red/10 px-2 py-1 text-[9.5px] font-bold text-red">Cancelar</button>}
    </div>
  </article>;
}

function FollowUpsView({ now }: { now: number }) {
  const followUps = useHub((state) => state.followUps);
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
    <div className="mx-auto grid max-w-6xl gap-4">
      {FOLLOW_UP_GROUPS.map((group) => {
        const items = followUps.filter((item) => item.bucket === group.id).sort((a, b) => group.id === "human_review" ? b.unansweredDays - a.unansweredDays : new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime());
        return <section key={group.id} className="rounded-2xl border border-paper/[.06] bg-paper/[.015] p-3">
          <div className="mb-2 flex items-center gap-2"><span>{group.icon}</span><h3 className="text-xs font-black uppercase tracking-wide">{group.label}</h3><span className="tnum rounded-full bg-paper/10 px-2 text-[10px]">{items.length}</span><p className="ml-auto hidden text-[10px] text-faint sm:block">{group.hint}</p></div>
          <div className="grid gap-1.5">{items.length ? items.map((item) => <FollowUpCardView key={`${item.conversationId}-${item.id ?? group.id}`} item={item} now={now} />) : <div className="rounded-xl border border-dashed border-paper/[.07] px-3 py-2 text-center text-[10.5px] text-faint">Sin casos</div>}</div>
        </section>;
      })}
    </div>
  </div>;
}

export function Pipeline() {
  const { tickets, moverEtapa, metrics } = useHub();
  const now = useNow();
  const [vista, setVista] = useState<"kanban" | "embudo">("kanban");
  const [activo, setActivo] = useState<Ticket | null>(null);
  const [cerrando, setCerrando] = useState<Ticket | null>(null);
  const cerrar = useHub((s) => s.cerrar);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const abiertos = tickets.filter((t) => t.estado === "abierto");
  const porEtapa = useMemo(() => {
    const mapa = Object.fromEntries(ETAPAS.map((e) => [e, [] as Ticket[]])) as Record<Etapa, Ticket[]>;
    for (const t of abiertos) mapa[t.etapa].push(t);
    return mapa;
  }, [abiertos]);

  const embudo = useMemo(() => {
    if (metrics?.funnel?.length) {
      const byStage = new Map(metrics.funnel.map((item) => [item.stage, item.value]));
      return [
        ...ETAPAS.map((e) => ({ label: ETAPA_META[e].nombre, valor: byStage.get(e) ?? 0, color: ETAPA_META[e].color })),
        { label: "Ganado", valor: byStage.get("ganado") ?? 0, color: CIERRE_META.ganado.color },
      ];
    }
    const alcanza = (idx: number) =>
      tickets.filter((t) => {
        if (t.estado === "cerrado")
          return t.cierre === "ganado" ? true : ETAPAS.indexOf(t.etapa) >= idx;
        return ETAPAS.indexOf(t.etapa) >= idx;
      }).length;
    const pasos = ETAPAS.map((e, i) => ({ label: ETAPA_META[e].nombre, valor: alcanza(i), color: ETAPA_META[e].color }));
    pasos.push({
      label: "Ganado",
      valor: tickets.filter((t) => t.cierre === "ganado").length,
      color: CIERRE_META.ganado.color,
    });
    return pasos;
  }, [tickets, metrics]);

  function onDragStart(ev: DragStartEvent) {
    setActivo(abiertos.find((t) => t.id === ev.active.id) ?? null);
  }

  function onDragEnd(ev: DragEndEvent) {
    const ticket = activo;
    setActivo(null);
    if (!ticket || !ev.over) return;
    const destino = ev.over.id;
    if (destino === "cerrar") {
      setCerrando(ticket);
    } else if (ETAPAS.includes(destino as Etapa) && destino !== ticket.etapa) {
      void moverEtapa(ticket.id, destino as Etapa);
    }
  }

  const potencialTotal = abiertos.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 pt-1 pb-3">
        <Segmented
          id="pipeline"
          valor={vista}
          onChange={setVista}
          opciones={[
            { valor: "kanban", label: "Kanban" },
            { valor: "embudo", label: "Embudo" },
          ]}
        />
        <p className="text-xs text-muted">
          <span className="tnum font-bold text-lime">{money(potencialTotal)}</span> en juego ·{" "}
          <span className="tnum font-bold text-paper">{abiertos.length}</span> tickets abiertos
        </p>
      </div>

      {vista === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="kanban-scroll flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-5">
            {ETAPAS.map((e) => (
              <Columna key={e} etapa={e} tickets={porEtapa[e]} now={now} />
            ))}
            <ZonaCierre />
          </div>
          <DragOverlay dropAnimation={{ duration: 220 }}>
            {activo && (
              <div className="w-56">
                <CardKanban ticket={activo} now={now} arrastrando />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass max-w-2xl rounded-3xl p-6">
            <p className="microlabel mb-4">Embudo del mes — conversión etapa a etapa</p>
            <FunnelChart pasos={embudo} />
            {embudo[0].valor === 0 && <EmptyState titulo="Aún no hay datos del embudo" />}
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {cerrando && (
          <CerrarSheet
            ticket={cerrando}
            onCerrar={(cierre, nota) => {
              void cerrar(cerrando.id, cierre, nota);
              setCerrando(null);
            }}
            onCancelar={() => setCerrando(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

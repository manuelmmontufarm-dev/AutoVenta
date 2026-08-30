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
import { useEffect, useMemo, useState } from "react";
import { FunnelChart } from "../components/charts";
import { IconAlert, IconAuto, IconBandera, IconCalendario, IconCandado, IconChevronR, IconClock, IconUser } from "../components/icons";
import { Avatar, EmptyState, Segmented } from "../components/ui";
import { authHeaders } from "../data/realSource";
import { CIERRE_META, ETAPAS, ETAPA_META, type Etapa, type FinalStage, type FollowUpBucket, type FollowUpCard, type Ticket } from "../data/types";
import { etiquetaVisita, money, moneyCompact, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";
import { CerrarSheet } from "./TicketDetail";

/**
 * ¿Pantalla táctil chica? El drag & drop del kanban con el dedo era una
 * lotería (se confundía con el scroll y soltaba la tarjeta donde caía), así
 * que en móvil el tablero es de solo-lectura y mover es un botón explícito.
 */
function useEsMovil(): boolean {
  const [movil, setMovil] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setMovil(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return movil;
}

function CardKanban({ ticket, now, arrastrando = false, onMover }: { ticket: Ticket; now: number; arrastrando?: boolean; onMover?: () => void }) {
  const dia = etiquetaVisita(ticket.visitDate, ticket.compromisoCliente, now);
  return (
    <div
      className={`glass w-full rounded-2xl p-3 text-left ${arrastrando ? "rotate-2 scale-105 shadow-pop" : "shadow-soft"}`}
      style={{ cursor: arrastrando ? "grabbing" : onMover ? "pointer" : "grab" }}
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
        {/* Un monto en blanco se leía como un error del panel. Decir "sin
            cotización" es el dato: nadie le puso precio a este ticket todavía. */}
        {ticket.cotizacion ? (
          <span className="tnum text-[11.5px] font-bold text-lime">{money(ticket.cotizacion.total)}</span>
        ) : (
          <span className="text-[10px] text-faint italic">sin cotización</span>
        )}
      </div>
      {/* El día de la visita, del mismo tamaño que la medida: es el otro dato
          que decide qué tarjeta se trabaja hoy. */}
      {dia && (
        <div className="mt-1.5">
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold"
            style={{ background: "color-mix(in srgb, var(--color-lime) 14%, transparent)", color: "var(--color-lime)" }}
            title={ticket.compromisoCliente ?? undefined}
          >
            <IconClock size={11} /> {dia}
          </span>
        </div>
      )}
      {/* Móvil: mover es un botón, no un arrastre a ciegas. */}
      {onMover && (
        <button
          onClick={(e) => { e.stopPropagation(); onMover(); }}
          className="mt-2 w-full rounded-lg py-1.5 text-[10.5px] font-black"
          style={{ background: "color-mix(in srgb, var(--color-paper) 8%, transparent)", color: "var(--color-paper)" }}
        >
          Mover de etapa
        </button>
      )}
    </div>
  );
}

function CardArrastrable({ ticket, now, movil, onMover }: { ticket: Ticket; now: number; movil: boolean; onMover: (t: Ticket) => void }) {
  // En móvil no se registran los listeners de drag: la columna se scrollea
  // sin pelearse con el dedo y la tarjeta solo navega o abre "Mover".
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id, disabled: movil });
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: isDragging ? 0.25 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      ref={setNodeRef}
      {...attributes}
      {...(movil ? {} : listeners)}
      onClick={() => !isDragging && navigate(`ticket/${ticket.id}`)}
    >
      <CardKanban ticket={ticket} now={now} onMover={movil ? () => onMover(ticket) : undefined} />
    </motion.div>
  );
}

function EtapaResumen({
  etapa, tickets, total, grupo, movil, abierta, onAlternar,
}: {
  etapa: Etapa; tickets: Ticket[]; total: number; grupo: string;
  movil: boolean; abierta: boolean; onAlternar: () => void;
}) {
  const meta = ETAPA_META[etapa];
  const { setNodeRef, isOver } = useDroppable({ id: `${grupo}:${etapa}`, disabled: movil });
  const porcentaje = total > 0 ? Math.round((tickets.length / total) * 100) : 0;
  const panelId = `tickets-${grupo}-${etapa}`;
  const radio = 34;
  const circunferencia = 2 * Math.PI * radio;

  return (
    <div
      ref={setNodeRef}
      // El cuadrado perfecto es de escritorio: en una columna de 70 px obliga a
      // una tarjeta de 70 px de alto donde no entra el anillo con su nombre.
      // En el teléfono manda el contenido.
      className="overflow-hidden rounded-xl transition-colors md:aspect-square md:rounded-2xl"
      // La etapa abierta se marca en la propia tarjeta y no solo con el
      // chevron: en el teléfono el chevron no cabe, y sin esta señal no se ve
      // de qué etapa son los tickets que aparecen debajo.
      style={{
        background: isOver || abierta
          ? `color-mix(in srgb, ${meta.color} 10%, var(--color-ink2))`
          : "var(--color-ink2)",
        outline: isOver || abierta ? `2px solid ${meta.color}` : "1px solid var(--color-line)",
        outlineOffset: "-1px",
      }}
    >
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={panelId}
        onClick={onAlternar}
        className="group flex h-full w-full flex-col items-center justify-center gap-1 p-1.5 text-center focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-red md:gap-2 md:p-3"
        title={meta.descripcion}
      >
        {/* El SVG es un viewBox de 80: al encoger la caja, el anillo y su grosor
            escalan solos. */}
        <span className="relative grid h-11 w-11 shrink-0 place-items-center md:h-20 md:w-20" aria-hidden="true">
          <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="40" cy="40" r={radio} fill="none" stroke="var(--color-ink)" strokeWidth="7" />
            <motion.circle
              cx="40" cy="40" r={radio} fill="none" stroke={meta.color} strokeWidth="7"
              strokeLinecap="round"
              initial={false}
              animate={{ strokeDashoffset: circunferencia * (1 - porcentaje / 100) }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{ strokeDasharray: circunferencia }}
            />
          </svg>
          <span className="tnum text-[11.5px] font-black text-paper md:text-[17px]">{porcentaje}%</span>
        </span>
        <span className="flex min-w-0 items-center justify-center gap-1.5">
          {/* «Opciones y comparación» no cabe en 70 px; el nombre corto sí, y
              es el mismo que usan el Inbox y las alertas. */}
          <span className="line-clamp-2 text-[9.5px] leading-tight font-bold md:text-[11px]" style={{ color: meta.color }}>
            <span className="md:hidden">{meta.corto}</span>
            <span className="hidden md:inline">{meta.nombre}</span>
          </span>
          <IconChevronR
            size={14}
            className="hidden shrink-0 text-faint transition-transform duration-200 md:block"
            style={{ transform: abierta ? "rotate(90deg)" : "rotate(0deg)" }}
            aria-hidden="true"
          />
        </span>
        <span className="tnum text-[10px] text-faint md:text-[11px]">
          <span className="md:hidden">{tickets.length}</span>
          <span className="hidden md:inline">{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</span>
        </span>
      </button>
    </div>
  );
}

function TicketsDeEtapa({ etapa, tickets, now, grupo, movil, onMover }: {
  etapa: Etapa; tickets: Ticket[]; now: number; grupo: string;
  movil: boolean; onMover: (t: Ticket) => void;
}) {
  const meta = ETAPA_META[etapa];
  const potencial = tickets.reduce((s, t) => s + (t.cotizacion?.total ?? 0), 0);
  return (
    <motion.div
      id={`tickets-${grupo}-${etapa}`}
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="mt-3 rounded-2xl bg-ink2 p-4 outline-1 outline-line"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="font-bold" style={{ color: meta.color }}>{meta.nombre}</span>
        <span className="tnum font-bold text-paper">{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</span>
        {potencial > 0 && <span className="tnum">{moneyCompact(potencial)} en cotizaciones</span>}
        <span>{meta.descripcion}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {tickets.map((t) => (
            <CardArrastrable key={t.id} ticket={t} now={now} movil={movil} onMover={onMover} />
          ))}
        </AnimatePresence>
        {tickets.length === 0 && (
          <p className="col-span-full py-4 text-center text-[11px] text-faint">Sin tickets en esta etapa</p>
        )}
      </div>
    </motion.div>
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
      <div className="grid justify-items-center px-3 py-6">
        <IconBandera size={24} className="text-paper/70" />
        <p className="mt-1.5 text-[11px] font-bold text-paper/80">Cerrar ticket</p>
        <p className="mt-0.5 text-[11px] text-muted">ganado · perdido</p>
      </div>
    </div>
  );
}

/** YYYY-MM-DD en hora de Guayaquil — el mismo corte de día que usa el backend. */
const diaGuayaquil = (fecha: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);

function etiquetaDia(day: string, hoy: string, ayer: string): string {
  if (day === hoy) return "Hoy";
  if (day === ayer) return "Ayer";
  // Mediodía para que el desfase horario no corra la fecha al día anterior.
  return new Date(`${day}T12:00:00`).toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * El contador del final del tablero. Cuenta a quien tocó la última columna
 * alguna vez — incluidos los cerrados, que ya no aparecen en el kanban — y
 * abre el detalle por día.
 */
function ZonaFinal({ total, onAbrir }: { total: number; onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      // Ancho fijo de 144 px: en escritorio va en una fila junto a la zona de
      // cierre; en el teléfono queda sola y un tercio de ancho se lee como una
      // tarjeta a medio cargar, así que ahí ocupa la fila entera.
      className="grid w-full shrink-0 place-items-center rounded-2xl text-center transition-all md:w-36 md:hover:scale-[1.03]"
      style={{
        background: "color-mix(in srgb, var(--color-lime) 8%, transparent)",
        border: "1px dashed color-mix(in srgb, var(--color-lime) 35%, transparent)",
      }}
    >
      <div className="px-3 py-6">
        <p className="tnum text-2xl font-black text-lime">{total}</p>
        <p className="mt-1.5 text-[11px] font-bold text-paper/80">Llegaron al final</p>
        <p className="mt-0.5 text-[10px] text-faint">{total === 0 ? "todavía nadie" : "ver por día"}</p>
      </div>
    </button>
  );
}

function PanelFinal({ data, now, onCerrar }: { data: FinalStage; now: number; onCerrar: () => void }) {
  const hoy = diaGuayaquil(new Date(now));
  const ayer = diaGuayaquil(new Date(now - 86_400_000));
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onCerrar} className="fixed inset-0 z-40" style={{ background: "var(--color-scrim)" }}
      />
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
        className="glass fixed top-1/2 left-1/2 z-50 flex max-h-[82vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl p-5"
      >
        <div className="mb-3 flex items-baseline gap-2.5">
          <p className="microlabel">Llegaron al final del tablero</p>
          <span className="tnum ml-auto text-[11px] text-faint">
            <span className="font-bold text-lime">{data.ganados}</span> de {data.total} terminaron en venta
          </span>
        </div>

        {data.days.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-[11.5px] text-faint"
             style={{ borderColor: "color-mix(in srgb, var(--color-paper) 12%, transparent)" }}>
            Todavía nadie llegó a la última columna.
          </p>
        ) : (
          <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
            {data.days.map((grupo) => (
              <section key={grupo.day} className="mb-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <h3 className="text-[11px] font-black uppercase tracking-wide">
                    {etiquetaDia(grupo.day, hoy, ayer)}
                  </h3>
                  <span className="tnum rounded-full bg-paper/10 px-2 text-[10px] font-bold">
                    {grupo.tickets.length}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {grupo.tickets.map((t) => (
                    <button
                      key={`${t.id}-${t.cycle}`}
                      onClick={() => { onCerrar(); navigate(`ticket/${t.id}`); }}
                      className="glass flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-left transition-colors hover:bg-paper/[.05]"
                    >
                      <span className="text-[12.5px] font-black">{t.nombre ?? t.telefono}</span>
                      {t.medida && <span className="text-[10.5px] text-muted">{t.medida}</span>}
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={
                          t.cierre === "ganado"
                            ? { background: "color-mix(in srgb, var(--color-ok) 16%, transparent)", color: "var(--color-ok)" }
                            : t.cierre === "perdido"
                              ? { background: "color-mix(in srgb, var(--color-red) 14%, transparent)", color: "var(--color-red)" }
                              : { background: "color-mix(in srgb, var(--color-paper) 8%, transparent)" }
                        }
                      >
                        {t.cierre === "ganado" ? "Ganado" : t.cierre === "perdido" ? "Perdido" : "Sigue abierto"}
                      </span>
                      {t.cotizacion != null ? (
                        <span className="tnum text-[11.5px] font-bold text-lime">{money(t.cotizacion)}</span>
                      ) : (
                        <span className="text-[10px] text-faint italic">sin cotización</span>
                      )}
                      <span className="tnum ml-auto text-[10px] text-faint">{relTime(t.llegoEn, now)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <button onClick={onCerrar} className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
                  style={{ background: "color-mix(in srgb, var(--color-paper) 8%, transparent)" }}>
            Cerrar
          </button>
        </div>
      </motion.div>
    </>
  );
}

// El icono sale del sistema de icons.tsx; el color distingue la urgencia
// (rojo = actuar ya) sin depender sólo de él: el label ya lo dice.
const FOLLOW_UP_GROUPS: Array<{ id: FollowUpBucket; label: string; icon: React.ReactNode; hint: string }> = [
  { id: "attention_now", label: "Atención ahora", icon: <IconAlert size={14} style={{ color: "var(--color-red)" }} />, hint: "Vencidos o listos para actuar" },
  { id: "today", label: "Programados para hoy", icon: <IconClock size={14} />, hint: "Ordenados por hora de envío" },
  { id: "commitments", label: "Visitas y compromisos", icon: <IconAuto size={14} />, hint: "Clientes que dijeron cuándo irían o retirarían" },
  { id: "scheduled", label: "Programados", icon: <IconCalendario size={14} />, hint: "Próximos envíos, en orden de tiempo" },
  { id: "human_review", label: "Revisión humana", icon: <IconUser size={14} />, hint: "Sin respuesta; decidir si continuar o marcar Perdido" },
  { id: "window_closed", label: "Ventana cerrada", icon: <IconCandado size={14} />, hint: "Solo se puede contactar con plantilla aprobada" },
  { id: "cancelled_failed", label: "Cancelados o fallidos", icon: <IconAlert size={14} />, hint: "Casos que necesitan revisión técnica" },
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
      <span className="rounded-full bg-paper/[.07] px-2 py-0.5 text-[11px] font-bold">{ETAPA_META[item.stage].corto}</span>
      {(item.tireSize || item.selectedProductCode) && <span className="truncate text-[10.5px] text-muted">{item.tireSize ?? item.selectedProductCode}</span>}
      <span className="tnum ml-auto text-[10.5px] font-bold">{dueLabel}</span>
      <span className="rounded-full bg-violet/10 px-2 py-0.5 text-[11px] font-bold">{remainingLabel}</span>
    </div>
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
      <span className={item.unansweredDays > 0 ? "font-black text-red" : "text-faint"}>Sin responder {item.unansweredDays} {item.unansweredDays === 1 ? "día" : "días"}</span>
      {item.commitment && <span className="inline-flex min-w-0 items-center gap-1 text-lime"><IconAuto size={12} className="shrink-0" /><span className="line-clamp-1">{item.commitment}</span></span>}
      {!item.commitment && <span className="line-clamp-1 min-w-0 flex-1 text-faint">{item.summary}</span>}
    </div>
    {item.preview && <div className="mt-2 rounded-lg bg-paper/[.045] px-2.5 py-2">
      <p className="text-[11px] font-black uppercase tracking-wider text-faint">Mensaje programado</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed">{item.preview}</p>
      {item.type !== "advisor_review" && <button onClick={() => void navigator.clipboard.writeText(item.preview).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })} className="mt-1 text-[11px] font-black text-lime hover:underline">{copied ? "Copiado" : "Copiar mensaje"}</button>}
    </div>}
    {(item.templateRequired || item.alertReason) && <p className="mt-1.5 text-[10px] font-bold text-amber-500">{item.templateRequired ? `Plantilla: ${item.templateRequired}` : `Motivo: ${item.alertReason}`}</p>}
    <div className="mt-2 flex flex-wrap gap-1">
      <button onClick={() => navigate(`ticket/${item.conversationId}`)} className="rounded-md bg-paper/10 px-2 py-1 text-[11px] font-bold">Abrir chat</button>
      {item.assignedTo === "bot" && <button onClick={() => void setAtiende(item.conversationId, "humano")} className="rounded-md bg-violet/15 px-2 py-1 text-[11px] font-bold">Tomar control</button>}
      {item.bucket === "human_review" && item.assignedTo === "human" && <button onClick={() => void setAtiende(item.conversationId, "bot")} className="rounded-md bg-lime/15 px-2 py-1 text-[11px] font-bold">Continuar con bot</button>}
      {item.bucket === "human_review" && <button onClick={() => { if (window.confirm(`¿Marcar a ${item.customer} como Perdido por falta de respuesta?`)) void cerrar(item.conversationId, "perdido", "Sin respuesta tras revisión humana"); }} className="rounded-md bg-red/10 px-2 py-1 text-[11px] font-bold text-red">Marcar Perdido</button>}
      {item.id && item.status === "scheduled" && <button onClick={() => void followUpAction(item.id!, "send")} className="rounded-md bg-lime/15 px-2 py-1 text-[11px] font-bold">Enviar ahora</button>}
      {item.id && item.status === "scheduled" && <button onClick={() => { const value = window.prompt("Editar mensaje", item.preview); if (value?.trim()) void followUpAction(item.id!, "edit", value.trim()); }} className="rounded-md bg-paper/10 px-2 py-1 text-[11px] font-bold">Editar</button>}
      {item.id && ["scheduled", "blocked"].includes(item.status ?? "") && <button onClick={() => void followUpAction(item.id!, "cancel")} className="rounded-md bg-red/10 px-2 py-1 text-[11px] font-bold text-red">Cancelar</button>}
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

/**
 * Acciones de puesta al día. Sirven sobre todo después de que el bot estuvo
 * apagado: mientras lo está, se siguen guardando los mensajes y extrayendo la
 * medida, pero nadie recalcula la etapa ni contesta.
 *
 * Las dos simulan primero y piden confirmación: mueven tarjetas reales y, la
 * segunda, manda mensajes a clientes reales.
 */
function AccionesPuestaAlDia({ onListo }: { onListo: () => void }) {
  const [cargando, setCargando] = useState<string | null>(null);
  const [previo, setPrevio] = useState<{ accion: string; texto: string; n: number } | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const llamar = async (ruta: string, simular: boolean) => {
    const r = await fetch(`/api/hub/tickets/${ruta}${simular ? "?simular=1" : ""}`, {
      method: "POST",
      // Token de sesión o clave cruda, lo que haya: con usuario logueado esto
      // salía sin credencial y el kanban devolvía 401.
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({}),
    });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error ?? `Error ${r.status}`);
    return d;
  };

  const simular = async (accion: "reorganizar" | "atender-pendientes") => {
    setCargando(accion); setResultado(null);
    try {
      const d = await llamar(accion, true);
      if (accion === "reorganizar") {
        const n = d.movimientos.length;
        setPrevio({ accion, n, texto: n === 0 ? "No hay tarjetas que mover: todas están donde corresponde."
          : `Se moverían ${n} tarjeta${n === 1 ? "" : "s"}, solo las que ya tienen medida o visita identificada:\n` +
            d.movimientos.slice(0, 8).map((m: { nombre: string; de: string; a: string; motivo: string }) =>
              `· ${m.nombre ?? "sin nombre"}: ${m.de} → ${m.a} (${m.motivo})`).join("\n") +
            (n > 8 ? `\n… y ${n - 8} más` : "") });
      } else {
        const n = d.candidatos;
        setPrevio({ accion, n, texto: n === 0 ? "No hay conversaciones sin responder dentro de las 24 h."
          : `El bot le escribiría a ${n} cliente${n === 1 ? "" : "s"} que quedaron sin respuesta y siguen dentro de las 24 h:\n` +
            d.resultados.slice(0, 8).map((x: { nombre: string; telefono: string }) =>
              `· ${x.nombre ?? x.telefono}`).join("\n") + (n > 8 ? `\n… y ${n - 8} más` : "") });
      }
    } catch (e) {
      setResultado(e instanceof Error ? e.message : "Falló");
    } finally { setCargando(null); }
  };

  const aplicar = async () => {
    if (!previo) return;
    setCargando(previo.accion);
    try {
      const d = await llamar(previo.accion, false);
      setResultado(previo.accion === "reorganizar"
        ? `${d.aplicados} tarjeta${d.aplicados === 1 ? "" : "s"} puesta${d.aplicados === 1 ? "" : "s"} al día.`
        : `El bot contestó ${(d.resultados ?? []).filter((x: { resultado: string }) => x.resultado === "answered").length} de ${d.candidatos}.`);
      setPrevio(null);
      onListo();
    } catch (e) {
      setResultado(e instanceof Error ? e.message : "Falló");
    } finally { setCargando(null); }
  };

  const btn = "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn} disabled={!!cargando} onClick={() => void simular("reorganizar")}
        style={{ background: "color-mix(in srgb, var(--color-paper) 8%, transparent)" }}>
        {cargando === "reorganizar" ? "Revisando…" : "Poner tarjetas al día"}
      </button>
      <button className={btn} disabled={!!cargando} onClick={() => void simular("atender-pendientes")}
        style={{ background: "color-mix(in srgb, var(--color-ok) 14%, transparent)", color: "var(--color-ok)" }}>
        {cargando === "atender-pendientes" ? "Revisando…" : "Que el bot conteste lo pendiente"}
      </button>
      {resultado && <span className="text-[11px] text-faint">{resultado}</span>}

      <AnimatePresence>
        {previo && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPrevio(null)} className="fixed inset-0 z-40"
              style={{ background: "var(--color-scrim)" }} />
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="glass fixed top-1/2 left-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-5">
              <p className="microlabel mb-2">
                {previo.accion === "reorganizar" ? "Poner tarjetas al día" : "Que el bot conteste lo pendiente"}
              </p>
              <pre className="mb-4 max-h-64 overflow-y-auto text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted">
                {previo.texto}
              </pre>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPrevio(null)} className={btn}
                  style={{ background: "color-mix(in srgb, var(--color-paper) 8%, transparent)" }}>
                  Cancelar
                </button>
                <button onClick={() => void aplicar()} disabled={previo.n === 0 || !!cargando} className={btn}
                  style={{ background: "var(--color-ok)", color: "#06210f" }}>
                  {cargando ? "Aplicando…" : previo.accion === "reorganizar" ? "Mover" : "Enviar"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Uno de los dos tableros. El de arriba es lo que el bot todavía puede
 * atender; el de abajo es la lista de pendientes reales de Joaquín.
 */
function TableroVentana({
  grupo, titulo, detalle, color, tickets, porEtapa, now, conZonaCierre = false, vacio, alFinal, movil, onMover,
}: {
  grupo: string; titulo: string; detalle: string; color: string;
  tickets: Ticket[]; porEtapa: Record<Etapa, Ticket[]>; now: number;
  conZonaCierre?: boolean; vacio?: string;
  /** Se pinta después de la última columna, al final del scroll horizontal. */
  alFinal?: React.ReactNode;
  movil: boolean; onMover: (t: Ticket) => void;
}) {
  const sinLeer = tickets.reduce((s, t) => s + (t.sinLeer ?? 0), 0);
  const [abierta, setAbierta] = useState<Etapa | null>(null);
  return (
    <section className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-2.5 px-4">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <span className="text-[13px] font-bold" style={{ color }}>{titulo}</span>
        <span
          className="tnum rounded-full px-2 py-0.5 text-[10.5px] font-bold"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          {tickets.length}
        </span>
        {sinLeer > 0 && (
          <span className="tnum text-[10.5px] font-bold text-faint">{sinLeer} sin leer</span>
        )}
        <span className="text-[10.5px] text-faint">{detalle}</span>
      </div>
      <div className="px-4">
          {/* LAS CINCO ETAPAS CABEN EN LA PANTALLA — SIN SCROLL HORIZONTAL.
              El carril arrastrable venía de `min-w-35` + `aspect-square`: cinco
              tarjetas de 140 px son 700 px, casi el doble de los 370 que da un
              teléfono. Y un embudo que hay que arrastrar deja de ser un embudo:
              su valor es ver la FORMA de las cinco etapas de una sola mirada,
              y con dos y media visibles eso no pasa. Las tarjetas se encogen en
              el teléfono (anillo de 44 px y el nombre corto) y conservan su
              tamaño completo en escritorio. */}
          <div className="grid grid-cols-5 gap-1.5 md:gap-2">
            {ETAPAS.map((e) => (
              <EtapaResumen
                key={e}
                etapa={e}
                tickets={porEtapa[e]}
                total={tickets.length}
                grupo={grupo}
                movil={movil}
                abierta={abierta === e}
                onAlternar={() => setAbierta((actual) => actual === e ? null : e)}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            {abierta && (
              <TicketsDeEtapa
                key={abierta}
                etapa={abierta}
                tickets={porEtapa[abierta]}
                now={now}
                grupo={grupo}
                movil={movil}
                onMover={onMover}
              />
            )}
          </AnimatePresence>
          {tickets.length === 0 && vacio && !abierta && (
            <p className="mt-3 rounded-2xl border border-dashed px-4 py-4 text-center text-[11.5px] text-faint"
               style={{ borderColor: "color-mix(in srgb, var(--color-paper) 12%, transparent)" }}>
              {vacio}
            </p>
          )}
          {(conZonaCierre && !movil) || alFinal ? (
            <div className="mt-3 grid min-h-24 gap-3 md:flex md:overflow-x-auto">
              {conZonaCierre && !movil && <ZonaCierre />}
              {alFinal}
            </div>
          ) : null}
        </div>
    </section>
  );
}

/**
 * La hoja "Mover de etapa" del móvil: reemplaza al drag & drop. Lista las
 * etapas con su color, marca la actual y ofrece cerrar el ticket — todo con
 * toques francos en vez de arrastres que se confunden con el scroll.
 */
function MoverSheet({ ticket, onMover, onCerrarTicket, onCancelar }: {
  ticket: Ticket;
  onMover: (etapa: Etapa) => void;
  onCerrarTicket: () => void;
  onCancelar: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-100 flex items-end justify-center"
      style={{ background: "var(--color-scrim)", backdropFilter: "blur(4px)" }}
      onClick={onCancelar}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
        className="glass-strong w-full max-w-md rounded-t-3xl p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[13px] font-black">{ticket.nombre ?? ticket.telefono}</p>
        <p className="mb-3 text-[10.5px] text-muted">
          Está en <span className="font-bold" style={{ color: ETAPA_META[ticket.etapa].color }}>{ETAPA_META[ticket.etapa].nombre}</span> — ¿a dónde lo movemos?
        </p>
        <div className="grid gap-1.5">
          {ETAPAS.map((e) => {
            const meta = ETAPA_META[e];
            const actual = e === ticket.etapa;
            return (
              <button
                key={e}
                disabled={actual}
                onClick={() => onMover(e)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[12px] font-bold disabled:opacity-45"
                style={{ background: `color-mix(in srgb, ${meta.color} ${actual ? 16 : 8}%, transparent)` }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                <span className="min-w-0 flex-1 truncate">{meta.nombre}</span>
                {actual && <span className="text-[11px] font-black uppercase text-faint">aquí</span>}
              </button>
            );
          })}
          <button
            onClick={onCerrarTicket}
            className="mt-1 rounded-xl px-3 py-2.5 text-[12px] font-black"
            style={{ background: "color-mix(in srgb, var(--color-violet) 14%, transparent)", color: "var(--color-violet)" }}
          >
            <span className="inline-flex items-center gap-1.5"><IconBandera size={14} /> Cerrar ticket — ganado o perdido</span>
          </button>
          <button onClick={onCancelar} className="glass rounded-xl py-2.5 text-[12px] font-bold text-muted">Cancelar</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Pipeline() {
  const { tickets, moverEtapa, metrics, refrescar, finalStage } = useHub();
  const now = useNow();
  const movil = useEsMovil();
  const [vista, setVista] = useState<"kanban" | "embudo">("kanban");
  const [activo, setActivo] = useState<Ticket | null>(null);
  const [cerrando, setCerrando] = useState<Ticket | null>(null);
  const [moviendo, setMoviendo] = useState<Ticket | null>(null);
  const [verFinal, setVerFinal] = useState(false);
  const cerrar = useHub((s) => s.cerrar);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const abiertos = tickets.filter((t) => t.estado === "abierto");

  // La ventana de 24 h de WhatsApp parte el tablero en dos mundos distintos:
  // dentro, el bot todavía puede contestar texto libre; fuera, Meta lo prohíbe
  // y el caso es de una persona. Mezclarlos escondía justamente los que hay
  // que atender a mano.
  const { enVentana, fueraVentana } = useMemo(() => {
    const dentro: Ticket[] = [], fuera: Ticket[] = [];
    for (const t of abiertos) {
      const cierra = t.ventanaCierraEn ? Date.parse(t.ventanaCierraEn) : NaN;
      // Sin dato de ventana se asume que el bot puede: es el caso de las
      // conversaciones que nunca recibieron un mensaje del cliente.
      (Number.isFinite(cierra) && cierra <= now ? fuera : dentro).push(t);
    }
    return { enVentana: dentro, fueraVentana: fuera };
  }, [abiertos, now]);

  const agrupar = (lista: Ticket[]) => {
    const mapa = Object.fromEntries(ETAPAS.map((e) => [e, [] as Ticket[]])) as Record<Etapa, Ticket[]>;
    for (const t of lista) mapa[t.etapa].push(t);
    return mapa;
  };
  const porEtapaEnVentana = useMemo(() => agrupar(enVentana), [enVentana]);
  const porEtapaFuera = useMemo(() => agrupar(fueraVentana), [fueraVentana]);

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
    const bruto = String(ev.over.id);
    if (bruto === "cerrar") {
      setCerrando(ticket);
      return;
    }
    const destino = bruto.includes(":") ? bruto.split(":")[1] : bruto;
    if (ETAPAS.includes(destino as Etapa) && destino !== ticket.etapa) {
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
        <div className="flex flex-wrap items-center gap-3">
          <AccionesPuestaAlDia onListo={() => void refrescar()} />
          <p className="text-xs text-muted">
            <span className="tnum font-bold text-lime">{money(potencialTotal)}</span> en juego ·{" "}
            <span className="tnum font-bold text-paper">{abiertos.length}</span> tickets abiertos
          </p>
        </div>
      </div>

      {vista === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="min-h-0 flex-1 overflow-y-auto pb-5">
            <TableroVentana
              grupo="viva"
              titulo="El bot puede responder"
              detalle="Dentro de las 24 h desde el último mensaje del cliente. El bot contesta solo."
              color="var(--color-ok)"
              tickets={enVentana}
              porEtapa={porEtapaEnVentana}
              now={now}
              conZonaCierre
              movil={movil}
              onMover={setMoviendo}
              alFinal={finalStage && <ZonaFinal total={finalStage.total} onAbrir={() => setVerFinal(true)} />}
            />
            <TableroVentana
              grupo="cerrada"
              titulo="Histórico (solo tú puedes responder)"
              detalle="Pasaron 24 h desde el último mensaje. WhatsApp ya no deja que el bot escriba texto libre: estos hay que contestarlos a mano."
              color="var(--color-red)"
              tickets={fueraVentana}
              porEtapa={porEtapaFuera}
              now={now}
              movil={movil}
              onMover={setMoviendo}
              vacio="Ninguna conversación se pasó de las 24 h. Todo al día."
            />
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
        {verFinal && finalStage && (
          <PanelFinal data={finalStage} now={now} onCerrar={() => setVerFinal(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {moviendo && (
          <MoverSheet
            ticket={moviendo}
            onMover={(etapa) => {
              void moverEtapa(moviendo.id, etapa);
              setMoviendo(null);
            }}
            onCerrarTicket={() => {
              setCerrando(moviendo);
              setMoviendo(null);
            }}
            onCancelar={() => setMoviendo(null)}
          />
        )}
      </AnimatePresence>

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

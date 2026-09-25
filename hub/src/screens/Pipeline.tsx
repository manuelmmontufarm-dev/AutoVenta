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
import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconBandera, IconX } from "../components/icons";
import { SelectorDeMes, etiquetaDeMes } from "../components/mes";
import { BlockTitle, MedidaChip, Modal, PageHeader } from "../components/ui";
import { authHeaders } from "../data/realSource";
import { ETAPAS, ETAPA_META, TODOS, type Etapa, type FinalStage, type Ticket } from "../data/types";
import { horaLista, money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";
import { CerrarSheet } from "./TicketDetail";

/**
 * ¿Pantalla táctil chica? El drag & drop con el dedo se confunde con el
 * scroll, así que en el teléfono el tablero es de sólo lectura y mover es un
 * botón explícito. Además se mira una etapa a la vez (DESIGN.md §17).
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

/* ── La tarjeta: lo justo para decidir sin abrirla ── */

function Tarjeta({ ticket, now, arrastrando = false, onMover }: { ticket: Ticket; now: number; arrastrando?: boolean; onMover?: () => void }) {
  const espera = ticket.sinLeer > 0;
  return (
    <div
      className={`flex w-full flex-col gap-2 rounded-[8px] border bg-surface px-3.5 py-3 text-left ${espera ? "border-signal/40" : "border-line"} ${arrastrando ? "shadow-pop" : ""}`}
      style={{ cursor: arrastrando ? "grabbing" : "pointer" }}
    >
      <div className="flex items-baseline justify-between gap-2.5">
        <span className={`truncate text-[14px] md:text-[14px] ${espera ? "font-semibold" : "font-medium"}`}>{ticket.nombre ?? ticket.telefono}</span>
        <span className={`tnum shrink-0 font-mono text-[11px] ${espera ? "font-bold text-signal" : "font-medium text-text2"}`}>{horaLista(ticket.ultimaActividad, now)}</span>
      </div>
      {ticket.medida ? <MedidaChip medida={ticket.medida} /> : <span className="text-[13px] text-text2">Sin medida</span>}
      <span className={`truncate text-[12px] leading-[1.4] ${espera ? "text-text" : "text-text2"}`}>{ticket.ultimoMensaje}</span>
      {(ticket.cotizacion || onMover) && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="tnum font-mono text-[12px] text-text2">{ticket.cotizacion ? money(ticket.cotizacion.total) : ""}</span>
          {onMover && (
            <button onClick={(e) => { e.stopPropagation(); onMover(); }} className="text-[12px] font-medium text-signal">
              Mover de etapa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaArrastrable({ ticket, now, movil, onMover }: { ticket: Ticket; now: number; movil: boolean; onMover: (t: Ticket) => void }) {
  // En el teléfono no se registran los listeners de drag: la lista se
  // desplaza sin pelearse con el dedo y la tarjeta sólo navega o abre «Mover».
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ticket.id, disabled: movil });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(movil ? {} : listeners)}
      className="shrink-0"
      style={{ opacity: isDragging ? 0.3 : 1 }}
      onClick={() => !isDragging && navigate(`ticket/${ticket.id}`)}
    >
      <Tarjeta ticket={ticket} now={now} onMover={movil ? () => onMover(ticket) : undefined} />
    </div>
  );
}

/* ── Un carril: la caja se desplaza por dentro, la pantalla no crece ── */

function Carril({ grupo, etapa, tickets, now, movil, onMover, className = "" }: {
  grupo: string; etapa: Etapa; tickets: Ticket[]; now: number; movil: boolean; onMover: (t: Ticket) => void; className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${grupo}:${etapa}`, disabled: movil });
  return (
    <div
      ref={setNodeRef}
      data-lane
      className={`flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[8px] border p-2 transition-colors ${isOver ? "border-signal bg-signal-tint" : "border-line bg-black/[.025]"} ${className}`}
      style={{ scrollbarGutter: "stable" }}
    >
      {tickets.map((t) => <TarjetaArrastrable key={t.id} ticket={t} now={now} movil={movil} onMover={onMover} />)}
      {tickets.length === 0 && <span className="px-1.5 py-2.5 text-[12px] text-text2">Nadie aquí</span>}
    </div>
  );
}

/* ── La barra de etapas: cuántos hay en cada una, de izquierda a derecha ── */

function BarraEtapas({ porEtapa, esperan, total, movil, seleccion, onSeleccionar, className = "" }: {
  porEtapa: Record<Etapa, number>; esperan?: Record<Etapa, number>; total: number; movil: boolean; seleccion?: Etapa; onSeleccionar?: (e: Etapa) => void; className?: string;
}) {
  return (
    <div className={`grid grid-cols-5 overflow-hidden rounded-[10px] border border-line bg-surface ${className}`}>
      {ETAPAS.map((e, i) => {
        const n = porEtapa[e];
        const urgentes = esperan?.[e] ?? 0;
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        const meta = ETAPA_META[e];
        const activa = movil && seleccion === e;
        // El tinte va en la etapa que tiene a alguien esperando respuesta, no
        // en cada tarjeta: así el ojo encuentra dónde mirar sin que el tablero
        // entero se pinte de rojo.
        const caliente = !movil && urgentes > 0;
        const borde = i < ETAPAS.length - 1 ? "border-r border-line" : "";
        if (movil) {
          return (
            <button
              key={e}
              type="button"
              onClick={() => onSeleccionar?.(e)}
              aria-pressed={activa}
              className={`flex flex-col items-center gap-0.5 px-1 pt-2.5 pb-2 ${borde} ${activa ? "bg-signal-tint text-signal" : "text-text"}`}
            >
              <span className="tnum font-mono text-[18px] font-medium">{n}</span>
              <span className={`text-[11px] ${activa ? "font-semibold" : "font-medium"}`}>{meta.corto}</span>
              <div className="mt-1 h-[3px] w-full overflow-hidden rounded-[2px] bg-black/10"><div className="h-full bg-text" style={{ width: `${pct}%` }} /></div>
            </button>
          );
        }
        return (
          <div key={e} className={`flex flex-col gap-2 px-4 pt-3 pb-3.5 ${borde} ${caliente ? "bg-signal-tint" : ""}`} title={meta.descripcion}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] font-semibold">{meta.nombre}</span>
              <span className={`tnum font-mono text-[20px] font-medium ${caliente ? "text-signal" : ""}`}>{n}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-1 flex-1 overflow-hidden rounded-[2px] bg-black/10"><div className={`h-full ${caliente ? "bg-signal" : "bg-text"}`} style={{ width: `${pct}%` }} /></div>
              <span className="tnum font-mono text-[11px] whitespace-nowrap text-text2">{caliente ? `${urgentes} espera${urgentes === 1 ? "" : "n"}` : `${pct} %`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Zona de cierre: sólo aparece mientras se arrastra ── */

function ZonaCierre({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "cerrar" });
  return (
    <div
      ref={setNodeRef}
      className={`pointer-events-auto fixed inset-x-0 bottom-6 z-30 mx-auto flex w-[min(520px,calc(100vw-4rem))] items-center justify-center gap-2 rounded-[8px] border border-dashed px-4 text-[13px] transition-all ${
        visible ? "h-14 opacity-100" : "h-0 overflow-hidden border-0 opacity-0"
      } ${isOver ? "border-signal bg-signal-tint font-semibold text-signal" : "border-line-strong bg-surface text-text2"}`}
    >
      <IconBandera size={16} /> Soltar aquí para cerrar el ticket (ganado o perdido)
    </div>
  );
}

/* ── «Llegaron al final»: quién tocó la última columna, por día ── */

const diaGuayaquil = (fecha: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);

function etiquetaDia(day: string, hoy: string, ayer: string): string {
  if (day === hoy) return "Hoy";
  if (day === ayer) return "Ayer";
  // Mediodía para que el desfase horario no corra la fecha al día anterior.
  return new Date(`${day}T12:00:00`).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });
}

function PanelFinal({ data, now, onCerrar }: { data: FinalStage; now: number; onCerrar: () => void }) {
  const hoy = diaGuayaquil(new Date(now));
  const ayer = diaGuayaquil(new Date(now - 86_400_000));
  return (
    <Modal onClose={onCerrar} ancho={640}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-4">
        <span className="text-[15px] font-semibold">Llegaron al final del tablero</span>
        <span className="tnum text-[12px] text-text2"><b className="font-semibold text-ok">{data.ganados}</b> de {data.total} terminaron en venta</span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
        {data.days.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text2">Todavía nadie llegó a la última columna.</p>
        ) : (
          data.days.map((grupo) => (
            <section key={grupo.day} className="mb-5">
              <BlockTitle aside={`${grupo.tickets.length}`}>{etiquetaDia(grupo.day, hoy, ayer)}</BlockTitle>
              <div className="mt-2 flex flex-col">
                {grupo.tickets.map((t) => (
                  <button
                    key={`${t.id}-${t.cycle}`}
                    onClick={() => { onCerrar(); navigate(`ticket/${t.id}`); }}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-4 border-b border-line py-2.5 text-left text-[13px] hover:bg-bg"
                  >
                    <span className="truncate font-medium">{t.nombre ?? t.telefono}{t.medida && <span className="ml-2 font-mono text-[12px] text-text2">{t.medida}</span>}</span>
                    <span className={t.cierre === "ganado" ? "font-medium text-ok" : t.cierre === "perdido" ? "font-medium text-signal" : "text-text2"}>
                      {t.cierre === "ganado" ? "Ganado" : t.cierre === "perdido" ? "Perdido" : "Sigue abierto"}
                    </span>
                    <span className="tnum font-mono text-[12px] text-text2">{t.cotizacion != null ? money(t.cotizacion) : "sin cotización"}</span>
                    <span className="tnum font-mono text-[11px] text-text2">{relTime(t.llegoEn, now)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <div className="flex justify-end border-t border-line px-5 py-3">
        <button onClick={onCerrar} className="btn-quiet h-9 rounded-[6px] px-4 text-[13px]">Cerrar</button>
      </div>
    </Modal>
  );
}

/* ── Puesta al día: simula, pide confirmación, mueve tarjetas reales ── */

function AccionesPuestaAlDia({ onListo }: { onListo: () => void }) {
  const [cargando, setCargando] = useState<string | null>(null);
  const [previo, setPrevio] = useState<{ accion: string; texto: string; n: number } | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const llamar = async (ruta: string, simular: boolean) => {
    const r = await fetch(`/api/hub/tickets/${ruta}${simular ? "?simular=1" : ""}`, {
      method: "POST",
      // Token de sesión o clave cruda, lo que haya: sin credencial el kanban devolvía 401.
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]" disabled={!!cargando} onClick={() => void simular("reorganizar")}>
        {cargando === "reorganizar" ? "Revisando…" : "Poner tarjetas al día"}
      </button>
      <button className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]" disabled={!!cargando} onClick={() => void simular("atender-pendientes")}>
        {cargando === "atender-pendientes" ? "Revisando…" : "Que el bot conteste lo pendiente"}
      </button>
      {resultado && <span className="text-[12px] text-text2">{resultado}</span>}

      <AnimatePresence>
        {previo && (
          <Modal onClose={() => setPrevio(null)} ancho={520}>
            <div className="p-5">
              <p className="text-[15px] font-semibold">{previo.accion === "reorganizar" ? "Poner tarjetas al día" : "Que el bot conteste lo pendiente"}</p>
              <pre className="mt-3 mb-4 max-h-64 overflow-y-auto font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-text2">{previo.texto}</pre>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPrevio(null)} className="btn-quiet h-9 rounded-[6px] px-4 text-[13px]">Cancelar</button>
                <button onClick={() => void aplicar()} disabled={previo.n === 0 || !!cargando} className="btn-signal h-9 rounded-[6px] px-4 text-[13px]">
                  {cargando ? "Aplicando…" : previo.accion === "reorganizar" ? "Mover" : "Enviar"}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── «Mover de etapa» del teléfono: reemplaza al arrastre ── */

function MoverSheet({ ticket, onMover, onCerrarTicket, onCancelar }: {
  ticket: Ticket; onMover: (etapa: Etapa) => void; onCerrarTicket: () => void; onCancelar: () => void;
}) {
  return (
    <Modal onClose={onCancelar} ancho={420}>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[15px] font-semibold">{ticket.nombre ?? ticket.telefono}</p>
            <p className="mt-0.5 text-[13px] text-text2">Está en {ETAPA_META[ticket.etapa].nombre}. ¿A dónde lo movemos?</p>
          </div>
          <button onClick={onCancelar} className="text-text2" aria-label="Cancelar"><IconX size={17} /></button>
        </div>
        <div className="mt-4 flex flex-col gap-1.5" role="radiogroup" aria-label="Etapa destino">
          {ETAPAS.map((e) => {
            const actual = e === ticket.etapa;
            return (
              <button
                key={e}
                disabled={actual}
                onClick={() => onMover(e)}
                className={`flex items-center justify-between rounded-[8px] border px-4 py-3 text-left text-[14px] ${actual ? "border-line bg-bg text-text2" : "border-line bg-surface font-medium hover:bg-bg"}`}
              >
                <span>{ETAPA_META[e].nombre}</span>
                {actual && <span className="text-[12px]">aquí</span>}
              </button>
            );
          })}
          <button onClick={onCerrarTicket} className="btn-quiet mt-1 flex h-11 items-center justify-center gap-2 rounded-[6px] text-[14px]">
            <IconBandera size={15} /> Cerrar ticket
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Un tablero: título, y los cinco carriles ── */

function Tablero({ grupo, titulo, sub, tickets, porEtapa, now, movil, onMover }: {
  grupo: string; titulo: string; sub: string; tickets: Ticket[]; porEtapa: Record<Etapa, Ticket[]>; now: number; movil: boolean; onMover: (t: Ticket) => void;
}) {
  // Cada tablero cuenta lo suyo: así se ve la diferencia entre lo que el bot
  // todavía puede atender y lo que ya es de ustedes.
  const conteo = Object.fromEntries(ETAPAS.map((e) => [e, porEtapa[e].length])) as Record<Etapa, number>;
  const esperan = Object.fromEntries(ETAPAS.map((e) => [e, porEtapa[e].filter((t) => t.sinLeer > 0).length])) as Record<Etapa, number>;
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5 px-0.5">
        <span className="text-[13px] font-semibold">{titulo}</span>
        <span className="text-[12px] text-text2">{sub}</span>
        <span className="tnum ml-auto font-mono text-[12px] text-text2">{tickets.length} tickets</span>
      </div>
      <BarraEtapas porEtapa={conteo} esperan={esperan} total={tickets.length} movil={false} />
      <div className="grid min-h-0 flex-1 grid-cols-5 gap-3">
        {ETAPAS.map((e) => <Carril key={e} grupo={grupo} etapa={e} tickets={porEtapa[e]} now={now} movil={movil} onMover={onMover} />)}
      </div>
    </section>
  );
}

export function Pipeline() {
  const { tickets, moverEtapa, refrescar, finalStage } = useHub();
  const mes = useHub((s) => s.mes);
  const ticketsDelMes = useHub((s) => s.ticketsDelMes);
  const verMes = useHub((s) => s.verMes);
  const cerrar = useHub((s) => s.cerrar);
  const now = useNow();
  const movil = useEsMovil();
  const [activo, setActivo] = useState<Ticket | null>(null);
  const [cerrando, setCerrando] = useState<Ticket | null>(null);
  const [moviendo, setMoviendo] = useState<Ticket | null>(null);
  const [verFinal, setVerFinal] = useState(false);
  const [etapaMovil, setEtapaMovil] = useState<Etapa | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  /**
   * El tablero del mes elegido. Un mes PASADO llega ya filtrado del servidor
   * (`ticketsDelMes`): el listado corta en 500 y lo viejo se cae del lote. El
   * mes en curso y `todos` se resuelven acá con lo que ya está en memoria.
   */
  const delMes = useMemo(() => {
    if (ticketsDelMes) return ticketsDelMes;
    if (mes === TODOS) return tickets;
    const [año, numero] = mes.split("-").map(Number);
    const desde = new Date(año, numero - 1, 1).getTime();
    const hasta = new Date(año, numero, 1).getTime();
    const dentro = (iso: string) => {
      const t = Date.parse(iso);
      return t >= desde && t < hasta;
    };
    return tickets.filter((t) => dentro(t.creadoEn) || dentro(t.ultimaActividad));
  }, [tickets, ticketsDelMes, mes]);

  const abiertos = useMemo(() => delMes.filter((t) => t.estado === "abierto"), [delMes]);
  // Trabajo vivo que el filtro está tapando: el tablero no lo muestra, pero
  // no puede callarlo.
  const abiertosOcultos = mes === TODOS ? 0 : tickets.filter((t) => t.estado === "abierto").length - abiertos.length;

  // La ventana de 24 h de WhatsApp parte el tablero en dos: dentro, el bot
  // todavía puede contestar texto libre; fuera, Meta lo prohíbe y el caso es
  // de una persona.
  const { enVentana, fueraVentana } = useMemo(() => {
    const dentro: Ticket[] = [], fuera: Ticket[] = [];
    for (const t of abiertos) {
      const cierra = t.ventanaCierraEn ? Date.parse(t.ventanaCierraEn) : NaN;
      (Number.isFinite(cierra) && cierra <= now ? fuera : dentro).push(t);
    }
    return { enVentana: dentro, fueraVentana: fuera };
  }, [abiertos, now]);

  const agrupar = (lista: Ticket[]) => {
    const mapa = Object.fromEntries(ETAPAS.map((e) => [e, [] as Ticket[]])) as Record<Etapa, Ticket[]>;
    for (const t of lista) mapa[t.etapa].push(t);
    // Dentro de cada carril, quien espera respuesta va primero.
    for (const e of ETAPAS) mapa[e].sort((a, b) => (b.sinLeer > 0 ? 1 : 0) - (a.sinLeer > 0 ? 1 : 0));
    return mapa;
  };
  const porEtapaEnVentana = useMemo(() => agrupar(enVentana), [enVentana]);
  const porEtapaFuera = useMemo(() => agrupar(fueraVentana), [fueraVentana]);
  const conteo = useMemo(() => Object.fromEntries(ETAPAS.map((e) => [e, porEtapaEnVentana[e].length + porEtapaFuera[e].length])) as Record<Etapa, number>, [porEtapaEnVentana, porEtapaFuera]);

  // En el teléfono se mira una etapa a la vez: arranca en la más poblada.
  const etapaSel: Etapa = etapaMovil ?? (ETAPAS.reduce((mejor, e) => (conteo[e] > conteo[mejor] ? e : mejor), ETAPAS[0]));

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

  const sub = `${abiertos.length} tickets abiertos${mes !== TODOS ? ` en ${etiquetaDeMes(mes, { corta: true })}` : ""}, de izquierda a derecha según avanzan`;

  const acciones: ReactNode = (
    <>
      <SelectorDeMes />
      <AccionesPuestaAlDia onListo={() => void refrescar()} />
      {finalStage && (
        <button onClick={() => setVerFinal(true)} className="btn-quiet h-9 rounded-[6px] px-3 text-[13px]">
          <span className="tnum font-mono">{finalStage.total}</span> llegaron al final
        </button>
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="hidden md:block">
        <PageHeader titulo="Pipeline" sub={sub}>{acciones}</PageHeader>
      </div>
      {abiertosOcultos > 0 && (
        <p className="mx-4 mb-3 text-[12px] text-text2 md:mx-8 md:-mt-2 md:mb-3">
          {abiertosOcultos} abiertos de otros meses no se ven con este filtro; siguen abiertos.{" "}
          <button onClick={() => void verMes(TODOS)} className="font-medium text-signal underline underline-offset-[3px]">Ver todos</button>
        </p>
      )}

      {movil && <BarraEtapas className="mx-4 mb-3" porEtapa={conteo} total={abiertos.length} movil seleccion={etapaSel} onSeleccionar={setEtapaMovil} />}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {movil ? (
          /* Teléfono: la etapa elegida, en sus dos mitades */
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [&>*]:shrink-0">{acciones}</div>
            <div className="flex items-baseline justify-between px-0.5 pb-2">
              <span className="text-[13px] font-semibold">{ETAPA_META[etapaSel].corto} · dentro de 24 h</span>
              <span className="tnum text-[12px] text-text2">{porEtapaEnVentana[etapaSel].length} tickets</span>
            </div>
            <Carril grupo="viva" etapa={etapaSel} tickets={porEtapaEnVentana[etapaSel]} now={now} movil onMover={setMoviendo} className="flex-1" />
            <div className="flex items-baseline justify-between px-0.5 pt-3 pb-2">
              <span className="text-[13px] font-semibold">{ETAPA_META[etapaSel].corto} · fuera de 24 h</span>
              <span className="tnum text-[12px] text-text2">{porEtapaFuera[etapaSel].length} tickets · sólo ustedes</span>
            </div>
            <Carril grupo="cerrada" etapa={etapaSel} tickets={porEtapaFuera[etapaSel]} now={now} movil onMover={setMoviendo} className="h-[132px] shrink-0" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-8 pb-8">
            <Tablero grupo="viva" titulo="Dentro de 24 h" sub="el bot todavía puede contestar" tickets={enVentana} porEtapa={porEtapaEnVentana} now={now} movil={false} onMover={setMoviendo} />
            <Tablero grupo="cerrada" titulo="Fuera de 24 h" sub="sólo contestan ustedes; WhatsApp ya no deja escribir al bot" tickets={fueraVentana} porEtapa={porEtapaFuera} now={now} movil={false} onMover={setMoviendo} />
          </div>
        )}
        {!movil && <ZonaCierre visible={activo !== null} />}
        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activo && <div className="w-60"><Tarjeta ticket={activo} now={now} arrastrando /></div>}
        </DragOverlay>
      </DndContext>

      <AnimatePresence>
        {verFinal && finalStage && <PanelFinal data={finalStage} now={now} onCerrar={() => setVerFinal(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {moviendo && (
          <MoverSheet
            ticket={moviendo}
            onMover={(etapa) => { void moverEtapa(moviendo.id, etapa); setMoviendo(null); }}
            onCerrarTicket={() => { setCerrando(moviendo); setMoviendo(null); }}
            onCancelar={() => setMoviendo(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cerrando && (
          <CerrarSheet
            ticket={cerrando}
            onCerrar={(cierre, nota) => { void cerrar(cerrando.id, cierre, nota); setCerrando(null); }}
            onCancelar={() => setCerrando(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { Ticket } from "../data/types";
import { ETAPA_META } from "../data/types";
import { etiquetaVisita, money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";
import { ChatBubble, Composer } from "./chat";
import { IconBot, IconChevronR, IconUser, IconX } from "./icons";

/**
 * Revisión uno-por-uno estilo baraja: el asesor decide el destino de cada
 * conversación sin salir de Oportunidades.
 *
 *   ← izquierda  = perdida (cerrar)
 *   → derecha    = ganada (cerrar) o dejar "para después" (prioridad)
 *
 * Funciona con drag (móvil y mouse), con los botones de abajo y con las
 * flechas del teclado. Toda decisión pide un segundo toque: un swipe
 * accidental no puede cerrar una venta.
 */

export interface SwipeItem {
  ticketId: number;
  /** Por qué está en la baraja — se pinta arriba de la tarjeta. */
  motivo: string;
  /** Alerta asociada (vista de errores): se resuelve al decidir. */
  alertId?: number;
}

type Decision = "perdida" | "derecha" | null;

const UMBRAL = 110; // px de arrastre para contar como swipe

export function SwipeReview({ titulo, items, onClose }: { titulo: string; items: SwipeItem[]; onClose: () => void }) {
  const { tickets, ticketsSueltos, mensajes, abrirTicket, cerrar, marcarParaDespues, setAtiende, enviarMensaje, alertAction } = useHub();
  const now = useNow();
  const [index, setIndex] = useState(0);
  const [decision, setDecision] = useState<Decision>(null);
  const [saliendo, setSaliendo] = useState<"izq" | "der" | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const item = items[index];
  const ticket: Ticket | undefined = useMemo(
    () => (item ? tickets.find((t) => t.id === item.ticketId) ?? ticketsSueltos[item.ticketId] : undefined),
    [item, tickets, ticketsSueltos],
  );

  // Carga los mensajes de la tarjeta visible (y marca leído, como en el detalle).
  useEffect(() => {
    if (item) void abrirTicket(item.ticketId);
  }, [item, abrirTicket]);

  // Flechas del teclado en desktop. Enter no decide nada: decidir es explícito.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") setDecision("perdida");
      if (e.key === "ArrowRight") setDecision("derecha");
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ejecutar(accion: "perdida" | "ganada" | "despues" | "saltar") {
    if (!item || ocupado) return;
    setOcupado(true);
    try {
      if (accion === "perdida") await cerrar(item.ticketId, "perdido", "Marcada perdida en revisión de Oportunidades");
      if (accion === "ganada") await cerrar(item.ticketId, "ganado", "Cerrada ganada en revisión de Oportunidades");
      if (accion === "despues") await marcarParaDespues(item.ticketId, true);
      if (accion !== "saltar" && item.alertId != null) {
        await alertAction(item.alertId, "resolve").catch(() => undefined);
      }
      // Saltar no es una decisión: se desvanece neutro, sin sello de ganada.
      setSaliendo(accion === "perdida" ? "izq" : accion === "saltar" ? null : "der");
      setDecision(null);
      // Deja que la tarjeta vuele fuera antes de traer la siguiente.
      setTimeout(() => {
        setSaliendo(null);
        setIndex((i) => i + 1);
        setOcupado(false);
      }, 220);
    } catch {
      setOcupado(false);
    }
  }

  const terminado = index >= items.length;

  return (
    <motion.div
      className="fixed inset-0 z-100 flex flex-col"
      style={{ background: "var(--color-scrim)", backdropFilter: "blur(10px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Cabecera */}
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-sm font-black">{titulo}</p>
          <p className="tnum text-[11px] text-muted">
            {terminado ? "Revisión completa" : `${index + 1} de ${items.length} · por orden de importancia`}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar revisión"
          className="glass grid h-9 w-9 place-items-center rounded-full text-muted hover:text-paper"
        >
          <IconX size={16} />
        </button>
      </div>

      {/* Baraja */}
      <div className="relative mx-auto w-full max-w-lg min-h-0 flex-1 px-4 pb-4">
        {terminado || !ticket ? (
          <div className="glass-strong grid h-full place-items-center rounded-3xl text-center">
            <div className="p-8">
              <p className="text-3xl">🏁</p>
              <p className="mt-2 text-sm font-black">{items.length ? "Revisaste todo" : "No hay chats para revisar aquí"}</p>
              <p className="mt-1 text-[11.5px] text-muted">
                {items.length ? "Cada conversación quedó cerrada, priorizada o en su lugar." : "Cuando entren clientes a esta vista, aparecen en la baraja."}
              </p>
              <button onClick={onClose} className="btn-aurora mt-4 rounded-full px-5 py-2 text-xs font-bold">
                Volver a Oportunidades
              </button>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <SwipeCard
              key={item.ticketId}
              ticket={ticket}
              motivo={item.motivo}
              mensajesTicket={mensajes[item.ticketId] ?? []}
              now={now}
              saliendo={saliendo}
              decision={decision}
              ocupado={ocupado}
              onDecidir={setDecision}
              onEjecutar={ejecutar}
              onToggleAtiende={() => void setAtiende(ticket.id, ticket.atiende === "bot" ? "humano" : "bot")}
              onEnviar={(texto) => void enviarMensaje(ticket.id, texto)}
            />
          </AnimatePresence>
        )}
      </div>

      {/* Controles (siempre visibles: en desktop nadie adivina que hay que arrastrar) */}
      {!terminado && ticket && (
        <div className="mx-auto flex w-full max-w-lg items-center justify-center gap-3 px-4 pb-5">
          <button
            disabled={ocupado}
            onClick={() => setDecision("perdida")}
            className="flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-black disabled:opacity-40"
            style={{ background: "color-mix(in srgb, var(--color-red) 14%, transparent)", color: "var(--color-red)", border: "1px solid color-mix(in srgb, var(--color-red) 40%, transparent)" }}
          >
            ✕ Perdida
          </button>
          <button
            disabled={ocupado}
            onClick={() => void ejecutar("saltar")}
            className="glass rounded-full px-4 py-2.5 text-xs font-bold text-muted"
          >
            Saltar
          </button>
          <button
            disabled={ocupado}
            onClick={() => setDecision("derecha")}
            className="flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-black disabled:opacity-40"
            style={{ background: "color-mix(in srgb, var(--color-lime) 14%, transparent)", color: "var(--color-lime)", border: "1px solid color-mix(in srgb, var(--color-lime) 40%, transparent)" }}
          >
            Ganada / Después ✓
          </button>
        </div>
      )}
    </motion.div>
  );
}

function SwipeCard({
  ticket, motivo, mensajesTicket, now, saliendo, decision, ocupado,
  onDecidir, onEjecutar, onToggleAtiende, onEnviar,
}: {
  ticket: Ticket;
  motivo: string;
  mensajesTicket: import("../data/types").Mensaje[];
  now: number;
  saliendo: "izq" | "der" | null;
  decision: Decision;
  ocupado: boolean;
  onDecidir: (d: Decision) => void;
  onEjecutar: (a: "perdida" | "ganada" | "despues" | "saltar") => void;
  onToggleAtiende: () => void;
  onEnviar: (texto: string) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-7, 7]);
  const opIzq = useTransform(x, [-140, -40], [1, 0]);
  const opDer = useTransform(x, [40, 140], [0, 1]);

  const dia = etiquetaVisita(ticket.visitDate ?? undefined, ticket.compromisoCliente ?? undefined, now);
  const vencida = Boolean(ticket.visitDate) && new Date(ticket.visitDate!).getTime() < now - 86_400_000;
  const llanta = ticket.opcionElegida ?? ticket.cotizacion?.items[0]?.descripcion;
  const ultimos = mensajesTicket.slice(-12);

  return (
    <motion.div
      className="glass-strong relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl shadow-pop"
      style={{ x, rotate, touchAction: "pan-y" }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={(_, info) => {
        if (info.offset.x < -UMBRAL) onDecidir("perdida");
        else if (info.offset.x > UMBRAL) onDecidir("derecha");
      }}
      initial={{ scale: 0.94, y: 16, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={
        saliendo === "izq"
          ? { x: -420, rotate: -9, opacity: 0, transition: { duration: 0.22 } }
          : saliendo === "der"
            ? { x: 420, rotate: 9, opacity: 0, transition: { duration: 0.22 } }
            : { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }
      }
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
    >
      {/* Sellos de swipe */}
      <motion.span
        style={{ opacity: opIzq, color: "var(--color-red)", border: "3px solid currentColor" }}
        className="pointer-events-none absolute top-5 right-5 z-20 -rotate-12 rounded-xl px-3 py-1 text-lg font-black tracking-widest uppercase"
      >
        Perdida
      </motion.span>
      <motion.span
        style={{ opacity: opDer, color: "var(--color-lime)", border: "3px solid currentColor" }}
        className="pointer-events-none absolute top-5 left-5 z-20 rotate-12 rounded-xl px-3 py-1 text-lg font-black tracking-widest uppercase"
      >
        Ganada
      </motion.span>

      {/* Ficha del cliente: lo que hay en juego, de un vistazo */}
      <div className="border-b border-paper/[.07] px-4 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => navigate(`ticket/${ticket.id}`)} className="min-w-0 text-left">
            <p className="truncate text-[15px] font-black">{ticket.nombre ?? ticket.telefono}</p>
            <p className="text-[10px] text-faint">{ETAPA_META[ticket.etapa].corto} · {relTime(ticket.ultimaActividad, now)} · abrir completo →</p>
          </button>
          {ticket.cotizacion && (
            <p className="tnum shrink-0 text-right text-[17px] font-black text-lime">{money(ticket.cotizacion.total)}</p>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[10.5px] font-bold text-amber-500">⚡ {motivo}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span
            className="rounded-lg px-2 py-1"
            style={vencida
              ? { background: "color-mix(in srgb, var(--color-red) 12%, transparent)", color: "var(--color-red)" }
              : { background: "color-mix(in srgb, var(--color-lime) 10%, transparent)", color: "var(--color-lime)" }}
          >
            🗓 {vencida ? `${dia ?? "Visita"} — no apareció` : dia ?? "Sin fecha de visita"}
          </span>
          {ticket.medida && <span className="medida-chip text-muted">{ticket.medida}</span>}
          {ticket.localCercano && <span className="rounded-lg bg-paper/[.07] px-2 py-1 text-muted">📍 {ticket.localCercano}</span>}
        </div>
        {llanta && <p className="mt-1.5 truncate text-[10.5px] text-muted">🛞 {llanta}</p>}
      </div>

      {/* Conversación */}
      <div className="chat-bg min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3" ref={(el) => { el?.scrollTo({ top: el.scrollHeight }); }}>
        {ultimos.length === 0
          ? <p className="pt-8 text-center text-[11px] text-faint">Cargando conversación…</p>
          : ultimos.map((m) => <ChatBubble key={m.id} msg={m} />)}
      </div>

      {/* Quién contesta + composer: escribir sin salir de la baraja */}
      <div className="border-t border-paper/[.07]">
        <div className="flex items-center justify-between px-3 pt-2">
          <p className="text-[10px] font-bold text-faint uppercase tracking-wider">Responder</p>
          <button
            onClick={onToggleAtiende}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black"
            style={ticket.atiende === "bot"
              ? { background: "color-mix(in srgb, var(--color-violet) 14%, transparent)", color: "var(--color-violet)" }
              : { background: "color-mix(in srgb, var(--color-lime) 12%, transparent)", color: "var(--color-lime)" }}
            title={ticket.atiende === "bot" ? "El bot responde. Toca para tomar el chat." : "Ustedes responden. Toca para devolvérselo al bot."}
          >
            {ticket.atiende === "bot" ? <><IconBot size={11} /> Bot responde — tomar chat</> : <><IconUser size={11} /> Atienden ustedes — devolver al bot</>}
          </button>
        </div>
        <Composer ticket={ticket} onEnviar={onEnviar} />
      </div>

      {/* Confirmación: un swipe no cierra nada solo */}
      <AnimatePresence>
        {decision && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 grid place-items-center p-6"
            style={{ background: "var(--color-scrim)", backdropFilter: "blur(4px)" }}
            onClick={() => onDecidir(null)}
          >
            <div className="glass-strong w-full max-w-xs rounded-3xl p-4 text-center" onClick={(e) => e.stopPropagation()}>
              {decision === "perdida" ? (
                <>
                  <p className="text-sm font-black" style={{ color: "var(--color-red)" }}>¿Marcar perdida?</p>
                  <p className="mt-1 text-[11px] text-muted">Se cierra el ticket de {ticket.nombre ?? ticket.telefono} y paran los seguimientos.</p>
                  <div className="mt-3 grid gap-2">
                    <button
                      disabled={ocupado}
                      onClick={() => onEjecutar("perdida")}
                      className="rounded-full py-2.5 text-xs font-black text-white disabled:opacity-50"
                      style={{ background: "var(--color-red)" }}
                    >
                      Sí, perdida
                    </button>
                    <button onClick={() => onDecidir(null)} className="glass rounded-full py-2 text-xs font-bold text-muted">Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-black" style={{ color: "var(--color-lime)" }}>¿Qué pasó con este cliente?</p>
                  <div className="mt-3 grid gap-2">
                    <button
                      disabled={ocupado}
                      onClick={() => onEjecutar("ganada")}
                      className="rounded-full py-2.5 text-xs font-black text-white disabled:opacity-50"
                      style={{ background: "var(--color-lime)" }}
                    >
                      🏁 Venta ganada — cerrar ticket
                    </button>
                    <button
                      disabled={ocupado}
                      onClick={() => onEjecutar("despues")}
                      className="rounded-full py-2.5 text-xs font-black disabled:opacity-50"
                      style={{ background: "color-mix(in srgb, var(--color-violet) 16%, transparent)", color: "var(--color-violet)" }}
                    >
                      ⭐ Va bien — dejar para después
                    </button>
                    <button onClick={() => onDecidir(null)} className="glass rounded-full py-2 text-xs font-bold text-muted">Cancelar</button>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-faint">
                    "Para después" la sube a la banda de importantes de Oportunidades <IconChevronR size={9} style={{ display: "inline" }} />
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

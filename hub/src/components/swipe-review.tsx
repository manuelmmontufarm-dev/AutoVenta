import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mensaje, Ticket } from "../data/types";
import { ETAPA_META } from "../data/types";
import { etiquetaVisita, money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";
import { ChatBubble } from "./chat";
import { IconBack, IconBot, IconChevronR, IconSend, IconUser, IconX } from "./icons";

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
 *
 * Responder abre un chat A PANTALLA COMPLETA (ver ChatFullScreen): la tarjeta
 * es para decidir; escribir merece su propia pantalla, como en cualquier app
 * de mensajes.
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
  // Chat a pantalla completa. Vive AQUÍ y no dentro de la tarjeta: la tarjeta
  // lleva transform (drag/rotación) y un `fixed` adentro quedaría anclado a
  // ella en vez de a la pantalla.
  const [escribiendo, setEscribiendo] = useState(false);

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
      if (escribiendo) {
        if (e.key === "Escape") setEscribiendo(false);
        return; // escribiendo, las flechas no deciden nada
      }
      if (e.key === "ArrowLeft") setDecision("perdida");
      if (e.key === "ArrowRight") setDecision("derecha");
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, escribiendo]);

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
      setEscribiendo(false);
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
      // overflow-hidden: la tarjeta sale volando a ±420px y sin el clip ese
      // vuelo agranda el layout viewport del celular (el panel queda zoomeado).
      className="fixed inset-x-0 top-0 z-100 flex flex-col overflow-hidden"
      // 100dvh y no inset-0: en el celular el teclado cambia el alto visible
      // y dvh lo sigue; 100vh clásico deja el composer debajo del teclado.
      style={{ height: "100dvh", background: "var(--color-scrim)", backdropFilter: "blur(10px)" }}
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
              onEscribir={() => setEscribiendo(true)}
            />
          </AnimatePresence>
        )}
      </div>

      {/* Controles (siempre visibles: en desktop nadie adivina que hay que arrastrar) */}
      {!terminado && ticket && (
        <div className="mx-auto flex w-full max-w-lg items-center justify-center gap-3 px-4 pb-5" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
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

      {/* Chat a pantalla completa (fuera de la tarjeta: sin transform arriba) */}
      <AnimatePresence>
        {escribiendo && ticket && (
          <ChatFullScreen
            ticket={ticket}
            mensajesTicket={mensajes[ticket.id] ?? []}
            now={now}
            onCerrar={() => setEscribiendo(false)}
            onEnviar={(texto) => void enviarMensaje(ticket.id, texto)}
            onToggleAtiende={() => void setAtiende(ticket.id, ticket.atiende === "bot" ? "humano" : "bot")}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SwipeCard({
  ticket, motivo, mensajesTicket, now, saliendo, decision, ocupado,
  onDecidir, onEjecutar, onEscribir,
}: {
  ticket: Ticket;
  motivo: string;
  mensajesTicket: Mensaje[];
  now: number;
  saliendo: "izq" | "der" | null;
  decision: Decision;
  ocupado: boolean;
  onDecidir: (d: Decision) => void;
  onEjecutar: (a: "perdida" | "ganada" | "despues" | "saltar") => void;
  onEscribir: () => void;
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

      {/* Conversación (vista previa — para escribir se abre a pantalla completa) */}
      <div className="chat-bg min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3" ref={(el) => { el?.scrollTo({ top: el.scrollHeight }); }}>
        {ultimos.length === 0
          ? <p className="pt-8 text-center text-[11px] text-faint">Cargando conversación…</p>
          : ultimos.map((m) => <ChatBubble key={m.id} msg={m} />)}
      </div>

      {/* Responder: un toque abre el chat a pantalla completa, estilo Tinder.
          Escribir dentro de una tarjeta arrastrable con el teclado encima era
          ilegible; mejor una pantalla dedicada. */}
      <div className="border-t border-paper/[.07] px-3 py-2.5" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
        <button
          onClick={onEscribir}
          className="gp-field flex w-full items-center gap-2 rounded-full px-4 py-2.5 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] text-faint">
            Responder a {ticket.nombre?.split(" ")[0] ?? "este cliente"}…
          </span>
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-black"
            style={ticket.atiende === "bot"
              ? { background: "color-mix(in srgb, var(--color-violet) 14%, transparent)", color: "var(--color-violet)" }
              : { background: "color-mix(in srgb, var(--color-lime) 12%, transparent)", color: "var(--color-lime)" }}
          >
            {ticket.atiende === "bot" ? <><IconBot size={10} /> bot</> : <><IconUser size={10} /> ustedes</>}
          </span>
        </button>
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

/**
 * El chat de la baraja a pantalla completa — la experiencia de escribir.
 *
 * Por qué existe: escribir dentro de la tarjeta era malo de verdad — el
 * teclado tapaba el composer, la tarjeta seguía siendo arrastrable bajo el
 * dedo y quedaban tres franjas de UI compitiendo. Aquí la conversación ocupa
 * TODO el alto visible real (visualViewport: lo que el teclado deja libre,
 * también en iOS donde dvh no se encoge), el input enfoca solo y el scroll se
 * pega abajo cuando el teclado sube o llega mensaje.
 */
function ChatFullScreen({
  ticket, mensajesTicket, now, onCerrar, onEnviar, onToggleAtiende,
}: {
  ticket: Ticket;
  mensajesTicket: Mensaje[];
  now: number;
  onCerrar: () => void;
  onEnviar: (texto: string) => void;
  onToggleAtiende: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [alto, setAlto] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const abajo = (suave = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? "smooth" : "auto" });
  };

  // El alto = lo que el teclado deja libre. En Android (resizes-content) el
  // dvh ya lo hace; en iOS el teclado NO encoge dvh y sin esto el composer
  // queda escondido detrás del teclado.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      setAlto(vv.height);
      requestAnimationFrame(() => abajo());
    };
    sync();
    vv.addEventListener("resize", sync);
    return () => vv.removeEventListener("resize", sync);
  }, []);

  // Mensaje nuevo (del cliente o el enviado) → pegado abajo, como WhatsApp.
  useEffect(() => { abajo(true); }, [mensajesTicket.length]);

  function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    onEnviar(limpio);
    setTexto("");
    inputRef.current?.focus(); // el teclado no se cierra entre mensajes
  }

  return (
    <motion.div
      className="fixed inset-x-0 top-0 z-110 flex flex-col"
      style={{ height: alto ? `${alto}px` : "100dvh", background: "var(--color-ink, #14213d)" }}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
    >
      {/* Cabecera compacta: volver + quién es + cuánto hay en juego */}
      <div className="glass-strong flex items-center gap-2 px-2 py-2">
        <button
          onClick={onCerrar}
          aria-label="Volver a la tarjeta"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:text-paper"
        >
          <IconBack size={18} />
        </button>
        <button onClick={() => navigate(`ticket/${ticket.id}`)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13.5px] font-black">{ticket.nombre ?? ticket.telefono}</p>
          <p className="truncate text-[10px] text-faint">
            {ETAPA_META[ticket.etapa].corto}
            {ticket.cotizacion ? ` · ${money(ticket.cotizacion.total)}` : ""}
            {ticket.medida ? ` · ${ticket.medida}` : ""} · {relTime(ticket.ultimaActividad, now)}
          </p>
        </button>
        <button
          onClick={onToggleAtiende}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-black"
          style={ticket.atiende === "bot"
            ? { background: "color-mix(in srgb, var(--color-violet) 14%, transparent)", color: "var(--color-violet)" }
            : { background: "color-mix(in srgb, var(--color-lime) 12%, transparent)", color: "var(--color-lime)" }}
          title={ticket.atiende === "bot" ? "El bot responde. Toca para tomar el chat." : "Ustedes responden. Toca para devolvérselo al bot."}
        >
          {ticket.atiende === "bot" ? <><IconBot size={11} /> Bot</> : <><IconUser size={11} /> Ustedes</>}
        </button>
      </div>

      {/* Conversación a todo el alto */}
      <div ref={scrollRef} className="chat-bg min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3">
        {mensajesTicket.length === 0
          ? <p className="pt-8 text-center text-[11px] text-faint">Cargando conversación…</p>
          : mensajesTicket.map((m) => <ChatBubble key={m.id} msg={m} />)}
      </div>

      {/* Composer: siempre visible encima del teclado */}
      <div className="glass-strong px-3 pt-2" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
        {ticket.atiende === "bot" && (
          <p className="mb-1.5 text-center text-[9.5px] text-faint">
            El bot sigue atendiendo — al enviar, el chat pasa a ustedes y el bot se pausa
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === "Return") && !e.nativeEvent.isComposing) enviar();
            }}
            enterKeyHint="send"
            placeholder="Escribe como vendedor…"
            className="gp-field min-w-0 flex-1 rounded-full px-4 py-2.5 text-[16px] placeholder:text-faint sm:text-[13.5px]"
          />
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={enviar}
            disabled={!texto.trim()}
            className="btn-aurora grid h-10 w-10 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-35"
            aria-label="Enviar"
          >
            <IconSend size={17} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { SwipeReview, type SwipeItem } from "../components/swipe-review";
import { EmptyState } from "../components/ui";
import type { BotAlert, Ticket } from "../data/types";
import { ETAPA_META } from "../data/types";
import { etiquetaVisita, money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

/**
 * Oportunidades = donde el bot suelta el volante y el asesor lo toma.
 *
 * Tres vistas grandes:
 *  · Cotizados   — ya recibieron cotización: es la caja del negocio. Cuadrícula
 *                  densa para ver muchos a la vez, cada uno con fecha, monto,
 *                  ubicación, medida y llanta.
 *  · Piden asesor — pidieron humano, van a llamar, o preguntaron algo que el
 *                  bot no puede responder.
 *  · Errores     — alertas del bot: conversación repetitiva, fallos, etc.
 *
 * Arriba de todo, siempre: la banda "Para después" — chats que el asesor ya
 * revisó, van bien y NO se pueden perder de vista.
 *
 * Cada vista tiene "Revisar uno por uno": la baraja swipe (ver swipe-review).
 */

type Vista = "cotizados" | "asesor" | "errores";

/** Fecha por la que ordenar. Sin fecha = sin plazo = al final. */
function cuando(t: Ticket): number {
  const v = new Date(t.visitDate ?? t.pickupDate ?? 0).getTime();
  return v || Number.POSITIVE_INFINITY;
}

function visitaVencida(t: Ticket, now: number): boolean {
  return Boolean(t.visitDate) && new Date(t.visitDate!).getTime() < now - 86_400_000;
}

/** Los que prometieron venir y no vinieron primero; luego el plazo más cercano; luego el monto. */
function porUrgencia(now: number) {
  return (a: Ticket, b: Ticket): number =>
    Number(visitaVencida(b, now)) - Number(visitaVencida(a, now)) ||
    cuando(a) - cuando(b) ||
    (b.cotizacion?.total ?? 0) - (a.cotizacion?.total ?? 0);
}

const PRIORIDAD_ALERTA: Record<BotAlert["priority"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function Opportunities() {
  const { tickets, followUps, alerts, marcarParaDespues, alertAction } = useHub();
  const now = useNow();
  const [vista, setVista] = useState<Vista>("cotizados");
  const [revisando, setRevisando] = useState<{ titulo: string; items: SwipeItem[] } | null>(null);

  const datos = useMemo(() => {
    const abiertos = tickets.filter((t) => t.estado === "abierto");
    const despues = abiertos
      .filter((t) => t.paraDespues)
      .sort((a, b) => cuando(a) - cuando(b) || (b.cotizacion?.total ?? 0) - (a.cotizacion?.total ?? 0));
    const pinned = new Set(despues.map((t) => t.id));

    const cotizados = abiertos
      .filter((t) => !pinned.has(t.id) && (t.etapa === "cotizacion_enviada" || t.etapa === "seguimiento_venta"))
      .sort(porUrgencia(now));

    // "Piden asesor": el bot lo marcó (bucket needs_human), el chat ya está en
    // manos humanas, o la ventana se cerró sin respuesta.
    const motivoFU = new Map(
      followUps.filter((f) => f.bucket === "needs_human").map((f) => [f.conversationId, f.importanceReason || f.importanceLabel]),
    );
    const asesor = abiertos
      .filter((t) => !pinned.has(t.id) && (motivoFU.has(t.id) || t.atiende === "humano"))
      .sort((a, b) => new Date(a.ultimaActividad).getTime() - new Date(b.ultimaActividad).getTime());

    const errores = [...alerts].sort(
      (a, b) => PRIORIDAD_ALERTA[a.priority] - PRIORIDAD_ALERTA[b.priority] ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return { abiertos, despues, cotizados, asesor, errores, motivoFU };
  }, [tickets, followUps, alerts, now]);

  function motivoAsesor(t: Ticket): string {
    return datos.motivoFU.get(t.id) ?? t.followUpReason ?? "El chat está en manos del equipo";
  }

  function motivoCotizado(t: Ticket): string {
    if (visitaVencida(t, now)) return "Dijo que venía y no apareció — rescatar hoy";
    if (t.visitDate || t.compromisoCliente) return t.compromisoCliente ? `Dijo: ${t.compromisoCliente}` : "Visita agendada — confirmar y tener las llantas listas";
    return t.followUpReason ?? "Cotización enviada — empujar el cierre";
  }

  function abrirRevision(v: Vista): void {
    if (v === "cotizados") {
      setRevisando({
        titulo: "Cotizados — por cerrar",
        items: datos.cotizados.map((t) => ({ ticketId: t.id, motivo: motivoCotizado(t) })),
      });
    } else if (v === "asesor") {
      setRevisando({
        titulo: "Piden asesor",
        items: datos.asesor.map((t) => ({ ticketId: t.id, motivo: motivoAsesor(t) })),
      });
    } else {
      setRevisando({
        titulo: "Errores del bot",
        items: datos.errores.map((a) => ({ ticketId: a.conversationId, motivo: a.exactReason || a.summary, alertId: a.id })),
      });
    }
  }

  const VISTAS: Array<{ id: Vista; icon: string; titulo: string; sub: string; n: number; alerta?: boolean }> = [
    { id: "cotizados", icon: "💰", titulo: "Cotizados", sub: "cotización enviada en adelante — a cerrar", n: datos.cotizados.length },
    { id: "asesor", icon: "🙋", titulo: "Piden asesor", sub: "pidieron humano, van a llamar o el bot no alcanzó", n: datos.asesor.length },
    { id: "errores", icon: "⚠️", titulo: "Errores", sub: "repeticiones y fallos del bot", n: datos.errores.length, alerta: datos.errores.length > 0 },
  ];

  return (
    <div className="h-full overflow-y-auto px-4 pb-8">
      <div className="mx-auto grid max-w-6xl gap-4">

        {/* ── Selector de vistas: los botones principales ── */}
        <div className="grid grid-cols-3 gap-2">
          {VISTAS.map((v) => {
            const activo = vista === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setVista(v.id)}
                className="glass relative rounded-2xl px-3 py-3 text-left transition-transform hover:-translate-y-0.5"
                style={activo ? { border: "1px solid color-mix(in srgb, var(--color-lime) 45%, transparent)", background: "color-mix(in srgb, var(--color-lime) 6%, transparent)" } : undefined}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-lg">{v.icon}</span>
                  <span
                    className="tnum rounded-full px-2 py-0.5 text-[11px] font-black"
                    style={v.alerta
                      ? { background: "color-mix(in srgb, var(--color-red) 14%, transparent)", color: "var(--color-red)" }
                      : { background: "color-mix(in srgb, var(--color-paper) 8%, transparent)" }}
                  >
                    {v.n}
                  </span>
                </div>
                <p className={`mt-1.5 text-[12.5px] font-black ${activo ? "" : "text-paper/85"}`}>{v.titulo}</p>
                <p className="mt-0.5 hidden text-[9.5px] leading-tight text-faint sm:block">{v.sub}</p>
              </button>
            );
          })}
        </div>

        {/* ── Banda IMPORTANTÍSIMA: dejados "para después" en la revisión ── */}
        {datos.despues.length > 0 && (
          <section
            className="rounded-2xl p-3"
            style={{ background: "color-mix(in srgb, var(--color-violet) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--color-violet) 35%, transparent)" }}
          >
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-xs font-black tracking-wide uppercase" style={{ color: "var(--color-violet)" }}>⭐ Para después — no soltar</h2>
              <span className="tnum rounded-full px-2 text-[10px] font-black" style={{ background: "color-mix(in srgb, var(--color-violet) 16%, transparent)", color: "var(--color-violet)" }}>{datos.despues.length}</span>
              <p className="ml-auto hidden text-[10px] text-faint md:block">revisados en la baraja y dejados en seguimiento — cerrarlos es tu tarea pendiente</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {datos.despues.map((t) => (
                <TicketSquare key={t.id} t={t} now={now} destacado
                  onQuitar={() => void marcarParaDespues(t.id, false)} />
              ))}
            </div>
          </section>
        )}

        {/* ── Cabecera de la vista activa + revisar uno por uno ── */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted">
            {vista === "cotizados" && "Ordenados por urgencia: primero los que prometieron venir y no vinieron."}
            {vista === "asesor" && "Ordenados por quién espera hace más tiempo."}
            {vista === "errores" && "Ordenados por gravedad."}
          </p>
          <button
            onClick={() => abrirRevision(vista)}
            className="btn-aurora shrink-0 rounded-full px-4 py-2 text-[11.5px] font-black"
          >
            🃏 Revisar uno por uno
          </button>
        </div>

        {/* ── Contenido ── */}
        {vista === "cotizados" && (
          datos.cotizados.length === 0
            ? <EmptyState titulo="Nadie con cotización pendiente" detalle="Cuando el bot mande una cotización, el cliente aparece aquí para que el equipo cierre la venta." />
            : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {datos.cotizados.map((t) => <TicketSquare key={t.id} t={t} now={now} />)}
              </div>
        )}

        {vista === "asesor" && (
          datos.asesor.length === 0
            ? <EmptyState titulo="Nadie esperando un asesor" detalle="Aquí caen los clientes que piden hablar con una persona, avisan que van a llamar o preguntan algo que el bot no puede resolver." />
            : <div className="grid gap-2 md:grid-cols-2">
                {datos.asesor.map((t) => (
                  <button key={t.id} onClick={() => navigate(`ticket/${t.id}`)} className="glass grid w-full gap-1.5 rounded-2xl p-3 text-left shadow-soft transition-transform hover:-translate-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-black">{t.nombre ?? t.telefono}</span>
                      <span className="tnum shrink-0 text-[10px] font-bold text-red">espera {relTime(t.ultimaActividad, now).replace("hace ", "")}</span>
                    </div>
                    <p className="line-clamp-2 text-[10.5px] font-bold text-amber-500">🙋 {motivoAsesor(t)}</p>
                    <p className="line-clamp-1 text-[10.5px] text-muted">{t.ultimoMensaje}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] font-bold">
                      <span className="rounded-full bg-paper/[.07] px-2 py-0.5">{ETAPA_META[t.etapa].corto}</span>
                      {t.medida && <span className="medida-chip text-muted">{t.medida}</span>}
                      {t.cotizacion && <span className="tnum text-lime">{money(t.cotizacion.total)}</span>}
                    </div>
                  </button>
                ))}
              </div>
        )}

        {vista === "errores" && (
          datos.errores.length === 0
            ? <EmptyState titulo="Sin errores pendientes" detalle="El bot no ha detectado conversaciones repetitivas ni fallos que requieran intervención." />
            : <div className="grid gap-2 md:grid-cols-2">
                {datos.errores.map((a) => (
                  <div key={a.id} className="glass grid gap-1.5 rounded-2xl p-3 shadow-soft">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => navigate(`ticket/${a.conversationId}`)} className="truncate text-left text-[13px] font-black hover:underline">{a.customer}</button>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase"
                        style={a.priority === "critical" || a.priority === "high"
                          ? { background: "color-mix(in srgb, var(--color-red) 13%, transparent)", color: "var(--color-red)" }
                          : { background: "color-mix(in srgb, var(--color-paper) 8%, transparent)", color: "var(--color-muted)" }}
                      >
                        {a.priority === "critical" ? "crítico" : a.priority === "high" ? "alto" : a.priority === "medium" ? "medio" : "bajo"}
                      </span>
                    </div>
                    <p className="text-[10.5px] font-bold text-amber-500">⚠️ {a.exactReason || a.summary}</p>
                    <p className="line-clamp-2 text-[10.5px] text-muted">{a.suggestedAction}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <button onClick={() => void alertAction(a.id, "take")} className="rounded-md bg-lime/15 px-2 py-1 text-[9.5px] font-bold">Tomar el chat</button>
                      <button onClick={() => void alertAction(a.id, "resolve")} className="rounded-md bg-paper/10 px-2 py-1 text-[9.5px] font-bold">Resuelto</button>
                      <button onClick={() => void alertAction(a.id, "snooze")} className="rounded-md bg-paper/10 px-2 py-1 text-[9.5px] font-bold text-muted">Más tarde</button>
                    </div>
                  </div>
                ))}
              </div>
        )}
      </div>

      <AnimatePresence>
        {revisando && (
          <SwipeReview titulo={revisando.titulo} items={revisando.items} onClose={() => setRevisando(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * El ticket-cuadrado de la cuadrícula: los cinco datos que el asesor necesita
 * para ponerse las pilas — cuándo viene, cuánto es, dónde, qué medida y qué
 * llanta — sin abrir el chat.
 */
function TicketSquare({ t, now, destacado, onQuitar }: { t: Ticket; now: number; destacado?: boolean; onQuitar?: () => void }) {
  const dia = etiquetaVisita(t.visitDate ?? undefined, t.compromisoCliente ?? undefined, now);
  const vencida = visitaVencida(t, now);
  const llanta = t.opcionElegida ?? t.cotizacion?.items[0]?.descripcion;
  return (
    <motion.div
      layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      className="glass relative rounded-2xl shadow-soft transition-transform hover:-translate-y-0.5"
      style={destacado ? { border: "1px solid color-mix(in srgb, var(--color-violet) 40%, transparent)" } : undefined}
    >
      {onQuitar && (
        <button
          onClick={onQuitar}
          title="Quitar de Para después"
          aria-label="Quitar de Para después"
          className="absolute top-1.5 right-1.5 z-10 grid h-5 w-5 place-items-center rounded-full text-[10px] text-faint hover:text-paper"
          style={{ background: "color-mix(in srgb, var(--color-paper) 8%, transparent)" }}
        >
          ✕
        </button>
      )}
      <button onClick={() => navigate(`ticket/${t.id}`)} className="grid w-full gap-1 p-2.5 text-left">
        <p className="truncate pr-4 text-[11.5px] font-black">{t.nombre ?? t.telefono}</p>
        <p
          className="truncate rounded-lg px-1.5 py-1 text-[10.5px] font-black"
          style={vencida
            ? { background: "color-mix(in srgb, var(--color-red) 12%, transparent)", color: "var(--color-red)" }
            : dia
              ? { background: "color-mix(in srgb, var(--color-lime) 10%, transparent)", color: "var(--color-lime)" }
              : { background: "color-mix(in srgb, var(--color-paper) 5%, transparent)", color: "var(--color-faint)" }}
        >
          🗓 {vencida ? `${dia ?? "Visita"} — no vino` : dia ?? "Sin fecha"}
        </p>
        <p className="tnum text-[15px] font-black leading-tight">
          {t.cotizacion ? money(t.cotizacion.total) : <span className="text-[11px] font-bold text-faint">Sin monto</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold text-muted">
          {t.medida && <span className="medida-chip">{t.medida}</span>}
          {t.localCercano && <span className="truncate">📍 {t.localCercano}</span>}
        </div>
        {llanta && <p className="truncate text-[9.5px] text-faint">🛞 {llanta}</p>}
      </button>
    </motion.div>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { IconAlert, IconClock, IconPin, IconPlay, IconSliders, IconTire, IconUser, IconX } from "../components/icons";
import { SwipeReview, type SwipeItem } from "../components/swipe-review";
import { EmptyState, MedidaChip, Segmented } from "../components/ui";
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

/**
 * Cuánto lleva esperando, en español que se pueda leer.
 *
 * `relTime` devuelve dos cosas distintas —una duración ("hace 20 min") y una
 * fecha ("ayer", "Martes", "15 ago")— y quitarle el "hace" a las dos producía
 * "espera ayer" y "espera 15 ago".
 */
function tiempoEsperando(iso: string, ahora: number): string {
  const r = relTime(iso, ahora);
  if (r === "ahora") return "acaba de escribir";
  if (r.startsWith("hace ")) return `espera ${r.slice(5)}`;
  if (r === "ayer") return "espera desde ayer";
  return `espera desde el ${r.toLowerCase()}`;
}

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

    // Errores = SOLO lo que se rompió dentro del chat. La ventana de 24 h por
    // cerrar, los seguimientos pendientes y las visitas sin confirmar entraban
    // aquí y no son errores: son estados normales que ya se ven en Cotizados,
    // Piden asesor y el pipeline. Con ellos dentro el contador marcaba decenas
    // todo el día y el tab dejó de mirarse. La clase la manda el backend
    // (services/alertTaxonomy.ts) para que reporte y panel no se contradigan.
    const porGravedad = (a: BotAlert, b: BotAlert): number =>
      PRIORIDAD_ALERTA[a.priority] - PRIORIDAD_ALERTA[b.priority] ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    const errores = alerts.filter((a) => a.clase === "conversacion").sort(porGravedad);

    // Lo técnico se agrupa por número: diez fallos de envío al mismo cliente son
    // un bug, no diez tareas. El asesor no puede hacer nada con esto — se
    // muestra para que sepa a quién no le está llegando y lo pase al desarrollo.
    const tecnicos = [...alerts.filter((a) => a.clase === "tecnico").sort(porGravedad)]
      .reduce<Array<{ phone: string; etiqueta: string; veces: number }>>((acc, a) => {
        const previa = acc.find((t) => t.phone === a.phone);
        if (previa) previa.veces += 1;
        else acc.push({ phone: a.phone, etiqueta: a.etiquetaTecnica || "Fallo técnico", veces: 1 });
        return acc;
      }, []);

    return { abiertos, despues, cotizados, asesor, errores, tecnicos, motivoFU };
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

  // Las tres vistas son filtros sobre una misma lista, no tres destinos: van en
  // el segmentado del propio sistema. La frase de abajo explica sólo la activa,
  // así una línea reemplaza los tres subtítulos que competían con el contenido.
  const VISTAS: Array<{ id: Vista; titulo: string; pista: string; n: number; alerta?: boolean }> = [
    {
      id: "cotizados", titulo: "Cotizados", n: datos.cotizados.length,
      pista: "Cotización enviada en adelante — a cerrar. Primero los que prometieron venir y no vinieron.",
    },
    {
      id: "asesor", titulo: "Piden asesor", n: datos.asesor.length,
      pista: "Pidieron humano, van a llamar o el bot no alcanzó. Primero quien lleva más tiempo esperando.",
    },
    {
      id: "errores", titulo: "Errores", n: datos.errores.length, alerta: datos.errores.length > 0,
      pista: "Sólo lo que se rompió dentro del chat, por gravedad. Lo técnico va abajo.",
    },
  ];
  const vistaActiva = VISTAS.find((v) => v.id === vista)!;

  return (
    <div className="h-full overflow-y-auto px-4 pb-8">
      <div className="mx-auto grid max-w-6xl gap-4">

        {/* ── Selector de vistas + la única acción primaria ── */}
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented<Vista>
              id="oportunidades"
              valor={vista}
              onChange={setVista}
              opciones={VISTAS.map((v) => ({
                valor: v.id,
                label: v.titulo,
                badge: v.n,
                tono: v.alerta ? "alerta" : "neutral",
              }))}
            />
            <button
              data-tour="revisar-uno"
              onClick={() => abrirRevision(vista)}
              disabled={vistaActiva.n === 0}
              title={vistaActiva.n === 0 ? "No hay nada que revisar en esta vista" : undefined}
              className="btn-aurora inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-black"
              style={vistaActiva.n === 0 ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
            >
              <IconPlay size={13} />
              Revisar uno por uno
            </button>
          </div>
          <p className="text-[12px] text-muted">{vistaActiva.pista}</p>
        </div>

        {/* ── Banda IMPORTANTÍSIMA: dejados "para después" en la revisión ── */}
        {datos.despues.length > 0 && (
          <section
            className="rounded-2xl p-3"
            style={{ background: "color-mix(in srgb, var(--color-violet) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--color-violet) 35%, transparent)" }}
          >
            <div className="mb-2 flex items-center gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-black tracking-wide uppercase" style={{ color: "var(--color-violet)" }}>
                <IconPin size={13} />
                Para después — no soltar
              </h2>
              <span className="tnum rounded-full px-2 text-[11px] font-black" style={{ background: "color-mix(in srgb, var(--color-violet) 16%, transparent)", color: "var(--color-violet)" }}>{datos.despues.length}</span>
              <p className="ml-auto hidden text-[11px] text-muted md:block">revisados en la baraja y dejados en seguimiento — cerrarlos es tu tarea pendiente</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {datos.despues.map((t) => (
                <TicketSquare key={t.id} t={t} now={now} destacado
                  onQuitar={() => void marcarParaDespues(t.id, false)} />
              ))}
            </div>
          </section>
        )}

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
                      <span className="truncate text-[13.5px] font-black">{t.nombre ?? t.telefono}</span>
                      <span className="tnum shrink-0 text-[11px] font-bold" style={{ color: "var(--color-reddark)" }}>
                        {tiempoEsperando(t.ultimaActividad, now)}
                      </span>
                    </div>
                    <p className="flex items-start gap-1.5 text-[11.5px] font-bold" style={{ color: "var(--color-reddark)" }}>
                      <IconUser size={13} className="mt-px shrink-0" />
                      <span className="line-clamp-2">{motivoAsesor(t)}</span>
                    </p>
                    <p className="line-clamp-1 text-[11.5px] text-muted">{t.ultimoMensaje}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className="rounded-full bg-paper/[.07] px-2 py-0.5">{ETAPA_META[t.etapa].corto}</span>
                      {t.medida && <MedidaChip medida={t.medida} size="sm" />}
                      {t.cotizacion && <span className="tnum" style={{ color: "var(--color-lime)" }}>{money(t.cotizacion.total)}</span>}
                    </div>
                  </button>
                ))}
              </div>
        )}

        {vista === "errores" && (
          datos.errores.length === 0
            ? <EmptyState titulo="Ningún chat roto" detalle="El bot no se ha repetido, atascado ni molestado a nadie. La ventana de 24 h cerrándose o un seguimiento pendiente no son errores: eso vive en Cotizados y Piden asesor." />
            : <div className="grid gap-2 md:grid-cols-2">
                {datos.errores.map((a) => (
                  <div key={a.id} className="glass grid gap-1.5 rounded-2xl p-3 shadow-soft">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => navigate(`ticket/${a.conversationId}`)} className="truncate text-left text-[13.5px] font-black hover:underline">{a.customer}</button>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black uppercase"
                        style={a.priority === "critical" || a.priority === "high"
                          ? { background: "color-mix(in srgb, var(--color-red) 13%, transparent)", color: "var(--color-red)" }
                          : { background: "color-mix(in srgb, var(--color-paper) 8%, transparent)", color: "var(--color-muted)" }}
                      >
                        {a.priority === "critical" ? "crítico" : a.priority === "high" ? "alto" : a.priority === "medium" ? "medio" : "bajo"}
                      </span>
                    </div>
                    <p className="flex items-start gap-1.5 text-[11.5px] font-bold" style={{ color: "var(--color-reddark)" }}>
                      <IconAlert size={13} className="mt-px shrink-0" />
                      <span>{a.exactReason || a.summary}</span>
                    </p>
                    <p className="line-clamp-2 text-[11.5px] text-muted">{a.suggestedAction}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <button onClick={() => void alertAction(a.id, "take")} className="rounded-md bg-lime/15 px-2.5 py-1.5 text-[11px] font-bold">Tomar el chat</button>
                      <button onClick={() => void alertAction(a.id, "resolve")} className="rounded-md bg-paper/10 px-2.5 py-1.5 text-[11px] font-bold">Resuelto</button>
                      <button onClick={() => void alertAction(a.id, "snooze")} className="rounded-md bg-paper/10 px-2.5 py-1.5 text-[11px] font-bold text-muted">Más tarde</button>
                    </div>
                  </div>
                ))}
              </div>
        )}

        {/* ── Lo técnico: del desarrollador, no del asesor ──
            Sólo el número. Sin ficha, sin botones y sin nombre a propósito: no
            hay nada que el asesor pueda hacer con esto salvo reportarlo, y
            darle forma de tarea comercial es lo que ensuciaba el tab. */}
        {vista === "errores" && datos.tecnicos.length > 0 && (
          <section className="rounded-2xl p-3" style={{ background: "color-mix(in srgb, var(--color-paper) 4%, transparent)", border: "1px solid var(--color-line)" }}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-black tracking-wide text-muted uppercase">
                <IconSliders size={13} />
                Problemas técnicos
              </h2>
              <span className="tnum rounded-full bg-paper/[.07] px-2 text-[11px] font-black text-muted">{datos.tecnicos.length}</span>
              <p className="ml-auto hidden text-[11px] text-muted md:block">esto lo revisa el desarrollador — sólo los números afectados</p>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {datos.tecnicos.map((t) => (
                <li key={t.phone} className="flex items-baseline gap-2 text-[11.5px]">
                  <span className="font-mono font-bold">{t.phone}</span>
                  <span className="truncate text-[11px] text-muted">{t.etiqueta}</span>
                  {t.veces > 1 && <span className="tnum ml-auto text-[11px] font-bold" style={{ color: "var(--color-reddark)" }}>×{t.veces}</span>}
                </li>
              ))}
            </ul>
          </section>
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
 * El plazo del cliente, con el peso visual que le toca.
 *
 * Antes los tres estados iban en el mismo bloque relleno, así que once tarjetas
 * de "Sin fecha" pesaban lo mismo que la única que había prometido venir y no
 * vino. El orden ya priorizaba por urgencia; la cuadrícula no lo mostraba. Sólo
 * la alarma se pinta: el resto es texto, distinguido por icono y peso.
 */
function Plazo({ t, now }: { t: Ticket; now: number }) {
  const dia = etiquetaVisita(t.visitDate ?? undefined, t.compromisoCliente ?? undefined, now);

  if (visitaVencida(t, now)) {
    return (
      <p
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-black"
        style={{ background: "color-mix(in srgb, var(--color-red) 12%, transparent)", color: "var(--color-reddark)" }}
      >
        <IconAlert size={12} className="shrink-0" />
        <span className="truncate">{dia ?? "Visita"} — no vino</span>
      </p>
    );
  }

  if (dia) {
    return (
      <p className="flex items-center gap-1.5 px-0.5 text-[11.5px] font-bold text-muted">
        <IconClock size={12} className="shrink-0" />
        <span className="truncate">{dia}</span>
      </p>
    );
  }

  return <p className="px-0.5 text-[11.5px] text-muted">Sin fecha</p>;
}

/**
 * El ticket-cuadrado de la cuadrícula: los cinco datos que el asesor necesita
 * para ponerse las pilas — cuándo viene, cuánto es, dónde, qué medida y qué
 * llanta — sin abrir el chat.
 */
function TicketSquare({ t, now, destacado, onQuitar }: { t: Ticket; now: number; destacado?: boolean; onQuitar?: () => void }) {
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
          className="absolute top-1.5 right-1.5 z-10 grid h-6 w-6 place-items-center rounded-full text-muted hover:text-paper"
          style={{ background: "color-mix(in srgb, var(--color-paper) 8%, transparent)" }}
        >
          <IconX size={12} />
        </button>
      )}
      <button onClick={() => navigate(`ticket/${t.id}`)} className="grid w-full gap-1.5 p-3 text-left">
        <p className="truncate pr-4 text-[13px] font-black">{t.nombre ?? t.telefono}</p>
        <Plazo t={t} now={now} />
        <p className="tnum text-[16px] font-black leading-tight">
          {t.cotizacion ? money(t.cotizacion.total) : <span className="text-[11.5px] font-bold text-muted">Sin monto</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted">
          {t.medida && <MedidaChip medida={t.medida} size="sm" />}
          {t.localCercano && <span className="truncate">{t.localCercano}</span>}
        </div>
        {llanta && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <IconTire size={12} className="shrink-0" />
            <span className="truncate">{llanta}</span>
          </p>
        )}
      </button>
    </motion.div>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatBubble, Composer, CotizacionModal, TypingBubble } from "../components/chat";
import { IconBack, IconDoc, IconNote, IconPhone, IconPin, IconRefresh, IconX } from "../components/icons";
import { PipelineStepper } from "../components/stepper";
import { AtiendePill, Avatar, CierreBadge, MedidaChip, Modal, StageBadge } from "../components/ui";
import { CIERRE_META, type Cierre, type Ticket } from "../data/types";
import { money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

export function TicketDetail({ id }: { id: number }) {
  const { tickets, mensajes, typing, abrirTicket, enviarMensaje, setAtiende, cerrar, reabrir, agregarNota } = useHub();
  const ticket = tickets.find((t) => t.id === id);
  const msgs = mensajes[id] ?? [];
  const escribiendo = typing[id];
  const now = useNow();

  const [verCotizacion, setVerCotizacion] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [fichaMovil, setFichaMovil] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void abrirTicket(id);
  }, [id, abrirTicket]);

  useEffect(() => {
    // autoscroll al fondo con cada mensaje / typing
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, escribiendo]);

  // marcar leído cuando llegan mensajes mientras se está viendo
  useEffect(() => {
    if (ticket && ticket.sinLeer > 0) void abrirTicket(id);
  }, [ticket?.sinLeer, id, ticket, abrirTicket]);

  if (!ticket) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">
        Ticket no encontrado —{" "}
        <button className="ml-1 font-bold text-lime" onClick={() => navigate("inbox")}>
          volver al inbox
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Columna principal: header + stepper + chat ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="glass mx-3 flex items-center gap-3 rounded-2xl px-3 py-2.5">
          <button
            onClick={() => navigate("inbox")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-paper/5 hover:text-paper"
            aria-label="Volver"
          >
            <IconBack size={17} />
          </button>
          <Avatar ticket={ticket} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-bold">{ticket.nombre ?? ticket.telefono}</p>
            <p className="tnum flex items-center gap-1.5 text-[11px] text-muted">
              <IconPhone size={10} /> {ticket.telefono} · {relTime(ticket.ultimaActividad, now)}
            </p>
          </div>
          <div className="hidden items-center gap-1.5 sm:flex">
            {ticket.estado === "cerrado" && ticket.cierre ? (
              <CierreBadge cierre={ticket.cierre} />
            ) : (
              <StageBadge etapa={ticket.etapa} />
            )}
            <AtiendePill atiende={ticket.atiende} />
          </div>
          <button
            onClick={() => setFichaMovil(true)}
            className="rounded-full px-2.5 py-1.5 text-[11px] font-bold text-muted hover:bg-paper/5 lg:hidden"
          >
            Ficha
          </button>
        </div>

        <div className="mx-3 mt-2.5">
          <PipelineStepper ticket={ticket} />
        </div>

        <div ref={scrollRef} className="chat-bg mx-3 mt-2.5 min-h-0 flex-1 overflow-y-auto rounded-2xl px-3 py-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {msgs.map((m) => (
              <ChatBubble key={m.id} msg={m} onVerPdf={() => setVerCotizacion(true)} />
            ))}
            <AnimatePresence>{escribiendo && <TypingBubble rol={escribiendo} />}</AnimatePresence>
          </div>
        </div>

        <div className="glass mx-3 my-2.5 rounded-2xl">
          <Composer
            ticket={ticket}
            onEnviar={(texto) => void enviarMensaje(ticket.id, texto)}
            onTomar={() => void setAtiende(ticket.id, "humano")}
          />
        </div>
      </div>

      {/* ── Ficha (desktop) ── */}
      <aside className="hidden w-76 shrink-0 overflow-y-auto py-0.5 pr-3 pl-0.5 lg:block">
        <Ficha
          ticket={ticket}
          onVerCotizacion={() => setVerCotizacion(true)}
          onCerrar={() => setCerrando(true)}
          onReabrir={() => void reabrir(ticket.id)}
          onToggleAtiende={() => void setAtiende(ticket.id, ticket.atiende === "bot" ? "humano" : "bot")}
          onNota={(texto) => void agregarNota(ticket.id, texto)}
        />
      </aside>

      {/* ── Ficha (móvil, sheet) ── */}
      <AnimatePresence>
        {fichaMovil && (
          <Modal onClose={() => setFichaMovil(false)} ancho={400}>
            <div className="p-3">
              <Ficha
                ticket={ticket}
                onVerCotizacion={() => {
                  setFichaMovil(false);
                  setVerCotizacion(true);
                }}
                onCerrar={() => {
                  setFichaMovil(false);
                  setCerrando(true);
                }}
                onReabrir={() => void reabrir(ticket.id)}
                onToggleAtiende={() => void setAtiende(ticket.id, ticket.atiende === "bot" ? "humano" : "bot")}
                onNota={(texto) => void agregarNota(ticket.id, texto)}
              />
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {verCotizacion && ticket.cotizacion && (
          <Modal onClose={() => setVerCotizacion(false)} ancho={520}>
            <CotizacionModal ticket={ticket} />
          </Modal>
        )}
        {cerrando && (
          <CerrarSheet
            ticket={ticket}
            onCerrar={(cierre, nota) => {
              void cerrar(ticket.id, cierre, nota);
              setCerrando(false);
            }}
            onCancelar={() => setCerrando(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Ficha del cliente ── */

function Ficha({
  ticket,
  onVerCotizacion,
  onCerrar,
  onReabrir,
  onToggleAtiende,
  onNota,
}: {
  ticket: Ticket;
  onVerCotizacion: () => void;
  onCerrar: () => void;
  onReabrir: () => void;
  onToggleAtiende: () => void;
  onNota: (texto: string) => void;
}) {
  const { crearDescuento } = useHub();
  const [nota, setNota] = useState("");
  const [verDescuento, setVerDescuento] = useState(false);
  const [montoDescuento, setMontoDescuento] = useState("");
  const [razonDescuento, setRazonDescuento] = useState("Autorizado por asesor");
  const [condicionDescuento, setCondicionDescuento] = useState("");
  const [venceDescuento, setVenceDescuento] = useState("");
  const [estadoDescuento, setEstadoDescuento] = useState<string | null>(null);
  const [guardandoDescuento, setGuardandoDescuento] = useState(false);
  const abierto = ticket.estado === "abierto";
  const ventanaAbierta = Boolean(ticket.ventanaCierraEn && new Date(ticket.ventanaCierraEn) > new Date());
  const recomendacion = ticket.mensajeRecomendadoHumano ?? ticket.planSeguimientos?.[0]?.preview ?? ticket.proximoSeguimiento?.preview;

  const confirmarDescuento = async () => {
    const amount = Number(montoDescuento.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || condicionDescuento.trim().length < 3 || razonDescuento.trim().length < 3) {
      setEstadoDescuento("Completa un monto, una razón y una condición válidos.");
      return;
    }
    setGuardandoDescuento(true); setEstadoDescuento(null);
    try {
      const result = await crearDescuento(ticket.id, {
        amount, reason: razonDescuento.trim(), condition: condicionDescuento.trim(),
        expiresAt: venceDescuento ? new Date(venceDescuento).toISOString() : null,
      });
      setEstadoDescuento(result.sent ? "Oferta aplicada a la cotización y enviada." : (result.warning ?? "Oferta registrada; requiere plantilla."));
      setVerDescuento(false); setMontoDescuento(""); setCondicionDescuento(""); setVenceDescuento("");
    } catch (error) {
      setEstadoDescuento(error instanceof Error ? error.message : "No se pudo crear la oferta.");
    } finally { setGuardandoDescuento(false); }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Lo que busca */}
      <section className="glass rounded-2xl p-4">
        <p className="microlabel mb-2.5">Busca</p>
        {ticket.medida ? (
          <MedidaChip medida={ticket.medida} size="lg" />
        ) : (
          <p className="text-xs text-faint italic">Medida aún no identificada</p>
        )}
        {ticket.vehiculo && <p className="mt-2.5 text-[12.5px] font-semibold text-paper/85">🚗 {ticket.vehiculo}</p>}
        {ticket.esRecurrente && (
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-lime">★ Cliente recurrente</p>
        )}
      </section>

      <section className="glass rounded-2xl p-4">
        <p className="microlabel mb-2.5">Seguimiento comercial</p>
        <p className="text-xs leading-relaxed">{ticket.resumen ?? "Resumen automático pendiente; se actualizará con la próxima interacción."}</p>
        <dl className="mt-3 grid gap-2 text-[11px]">
          <div><dt className="text-faint">Qué busca</dt><dd>{ticket.queBusca ?? ticket.medida ?? "Por identificar"}</dd></div>
          <div><dt className="text-faint">Opciones que comparó</dt><dd>{ticket.opcionesComparadas?.length ? ticket.opcionesComparadas.map(String).join(" · ") : "Sin comparación registrada"}</dd></div>
          <div><dt className="text-faint">Qué eligió</dt><dd>{ticket.opcionElegida ?? "Aún no eligió"}</dd></div>
          <div><dt className="text-faint">Compromiso o fecha</dt><dd>{ticket.compromisoCliente ?? (ticket.visitDate ? new Date(ticket.visitDate).toLocaleString("es-EC") : "Sin compromiso registrado")}</dd></div>
        </dl>
        {ticket.proximoSeguimiento ? <div className="mt-3 rounded-xl bg-paper/[.05] p-3"><p className="text-[11px] font-bold">Próximo: {new Date(ticket.proximoSeguimiento.dueAt).toLocaleString("es-EC")}</p><p className="mt-1 text-xs">{ticket.proximoSeguimiento.preview}</p>{ticket.proximoSeguimiento.templateKey && <p className="mt-1 text-[10px] font-bold text-amber-500">Plantilla: {ticket.proximoSeguimiento.templateKey}</p>}</div> : <p className="mt-3 text-[11px] text-faint">Sin envío automático: revisa el estado de seguridad o cierre.</p>}
        {ticket.planSeguimientos && ticket.planSeguimientos.length > 0 && <div className="mt-3"><p className="microlabel mb-2">Plan hasta cierre de ventana y escalamiento</p><ol className="grid gap-1.5">{ticket.planSeguimientos.map((step, index) => <li key={step.id} className="rounded-lg bg-paper/[.035] px-2.5 py-2 text-[10.5px]"><span className="font-bold">{index + 1}. {step.channel === "advisor" ? "Revisión del asesor" : step.templateKey ? `Plantilla ${step.templateKey}` : "Mensaje WhatsApp"}</span><span className="tnum ml-1 text-faint">· {new Date(step.dueAt).toLocaleString("es-EC")}</span><p className="mt-1 text-muted">{step.preview || step.reason}</p></li>)}</ol></div>}
        <p className="mt-3 text-[11px] font-bold" style={{ color: ticket.ventanaCierraEn && new Date(ticket.ventanaCierraEn) > new Date() ? "var(--color-ok)" : "var(--color-warn)" }}>Ventana de 24 h: {ticket.ventanaCierraEn ? (new Date(ticket.ventanaCierraEn) > new Date() ? `abierta hasta ${new Date(ticket.ventanaCierraEn).toLocaleString("es-EC")}` : "cerrada — requiere plantilla") : "sin mensaje entrante"}</p>
        {!ticket.customerOptIn && <p className="mt-1 text-[10px] text-amber-500">Sin consentimiento registrado para plantillas post-24 h.</p>}
        <div className="mt-3 rounded-xl border border-paper/10 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-faint">Mensaje recomendado para copiar</p><p className="mt-1.5 text-xs leading-relaxed">{recomendacion ?? "No hay un mensaje permitido en este estado."}</p><button disabled={!recomendacion || !ventanaAbierta} onClick={() => recomendacion && void navigator.clipboard.writeText(recomendacion).then(() => setEstadoDescuento("Mensaje copiado."))} className="mt-2 rounded-lg bg-paper/10 px-2.5 py-1.5 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40">{ventanaAbierta ? "Copiar mensaje" : "Ventana cerrada: solo plantilla"}</button></div>
        <div className="mt-3 flex gap-2"><button onClick={onToggleAtiende} className="rounded-lg bg-violet/15 px-3 py-2 text-[10px] font-bold">{ticket.atiende === "bot" ? "Tomar control" : "Devolver al bot"}</button></div>
        <div className="mt-3 border-t border-paper/10 pt-3"><p className="microlabel mb-2">Historial</p>{ticket.historialSeguimientos?.length ? <ul className="grid gap-1">{ticket.historialSeguimientos.map((item) => <li key={item.id} className="text-[10.5px] text-muted">{item.type} · {item.status} · {new Date(item.createdAt).toLocaleString("es-EC")}{item.error ? ` · ${item.error}` : ""}</li>)}</ul> : <p className="text-[10.5px] text-faint">Sin intentos todavía.</p>}</div>
      </section>

      {/* Cotización */}
      {ticket.cotizacion && (
        <section className="glass rounded-2xl p-4">
          <p className="microlabel mb-2.5">Cotización #{ticket.cotizacion.numero}</p>
          <p className="tnum text-[26px] leading-none font-bold tracking-tight">{money(ticket.cotizacion.total)}</p>
          {ticket.cotizacion.discountAmount && <p className="mt-1.5 text-[11px] font-bold text-lime">Descuento autorizado: −{money(ticket.cotizacion.discountAmount)} · {ticket.cotizacion.discountCondition}</p>}
          <p className="mt-1.5 text-[11.5px] text-muted">
            {ticket.cotizacion.items.map((i) => `${i.cantidad}× ${i.descripcion}`).join(" · ")}
          </p>
          <button
            onClick={onVerCotizacion}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-colors hover:bg-paper/10"
            style={{ background: "color-mix(in srgb, var(--color-paper) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--color-paper) 10%, transparent)" }}
          >
            <IconDoc size={13} /> Ver PDF
          </button>
          {abierto && <button onClick={() => setVerDescuento((value) => !value)} className="mt-2 w-full rounded-xl bg-lime/10 py-2 text-xs font-bold text-lime">Ofrecer descuento</button>}
          {verDescuento && <div className="mt-3 grid gap-2 rounded-xl border border-lime/20 bg-lime/[.04] p-3"><label className="text-[10px] font-bold">Monto total del descuento (USD)<input value={montoDescuento} onChange={(e) => setMontoDescuento(e.target.value)} inputMode="decimal" placeholder="Ej. 20.00" className="gp-field mt-1 w-full rounded-lg px-2.5 py-2 text-xs" /></label><label className="text-[10px] font-bold">Razón interna<input value={razonDescuento} onChange={(e) => setRazonDescuento(e.target.value)} placeholder="Ej. Autorizado por gerente" className="gp-field mt-1 w-full rounded-lg px-2.5 py-2 text-xs" /></label><label className="text-[10px] font-bold">Condición que verá el cliente<textarea value={condicionDescuento} onChange={(e) => setCondicionDescuento(e.target.value)} placeholder="si va esta semana, si va el sábado…" className="gp-field mt-1 min-h-16 w-full rounded-lg px-2.5 py-2 text-xs" /></label><label className="text-[10px] font-bold">Vence (opcional)<input type="datetime-local" value={venceDescuento} onChange={(e) => setVenceDescuento(e.target.value)} className="gp-field mt-1 w-full rounded-lg px-2.5 py-2 text-xs" /></label><button disabled={guardandoDescuento} onClick={() => void confirmarDescuento()} className="btn-aurora rounded-xl py-2.5 text-xs font-bold disabled:opacity-50">{guardandoDescuento ? "Confirmando…" : "Confirmar y dejar que el bot la ofrezca"}</button></div>}
          {estadoDescuento && <p className="mt-2 text-[10.5px] text-muted">{estadoDescuento}</p>}
        </section>
      )}

      {/* Local asignado */}
      {ticket.localAsignado && (
        <section className="glass rounded-2xl p-4">
          <p className="microlabel mb-2.5">Local más cercano</p>
          <p className="flex items-start gap-2 text-[12.5px] font-semibold">
            <span className="mt-0.5 shrink-0 text-red">
              <IconPin size={14} />
            </span>
            {ticket.localAsignado.nombre}
          </p>
          <p className="mt-1 ml-6 text-[11.5px] leading-relaxed text-muted">{ticket.localAsignado.direccion}</p>
          <p className="tnum mt-1.5 ml-6 text-[11.5px] font-bold text-lime">
            a {ticket.localAsignado.distanciaKm.toFixed(1).replace(".", ",")} km del cliente
          </p>
        </section>
      )}

      {/* Quién atiende */}
      {abierto && (
        <section className="glass flex items-center justify-between rounded-2xl p-4">
          <div>
            <p className="microlabel">Atiende</p>
            <p className="mt-1 text-[12.5px] font-bold">{ticket.atiende === "bot" ? "🤖 Bot AutoVenta" : "👤 Vendedor"}</p>
          </div>
          <button
            onClick={onToggleAtiende}
            role="switch"
            aria-checked={ticket.atiende === "humano"}
            className="relative h-7 w-13 rounded-full transition-colors"
            style={{ background: ticket.atiende === "humano" ? "var(--color-violet)" : "color-mix(in srgb, var(--color-paper) 12%, transparent)" }}
          >
            <motion.span
              layout
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-soft"
              style={{ left: ticket.atiende === "humano" ? "calc(100% - 26px)" : "2px" }}
            />
          </button>
        </section>
      )}

      {/* Notas internas */}
      <section className="glass rounded-2xl p-4">
        <p className="microlabel mb-2.5 flex items-center gap-1.5">
          <IconNote size={11} /> Notas internas
        </p>
        {ticket.notas.length > 0 && (
          <ul className="mb-2.5 flex flex-col gap-1.5">
            {ticket.notas.map((n, i) => (
              <li
                key={i}
                className="rounded-lg px-2.5 py-2 text-[11.5px] leading-relaxed text-paper/85"
                style={{ background: "color-mix(in srgb, var(--color-sand) 8%, transparent)", borderLeft: "2px solid color-mix(in srgb, var(--color-sand) 50%, transparent)" }}
              >
                {n}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-1.5">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === "Return") && !e.nativeEvent.isComposing && nota.trim()) {
                onNota(nota.trim());
                setNota("");
              }
            }}
            placeholder="Agregar nota…"
            className="gp-field min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-xs placeholder:text-faint"
          />
        </div>
      </section>

      {/* Acciones */}
      {abierto ? (
        <button
          onClick={onCerrar}
          className="btn-aurora flex items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-bold transition-transform hover:-translate-y-0.5"
        >
          Cerrar ticket
        </button>
      ) : (
        <button
          onClick={onReabrir}
          className="flex items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-bold text-paper transition-transform hover:-translate-y-0.5"
          style={{ background: "color-mix(in srgb, var(--color-paper) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-paper) 12%, transparent)" }}
        >
          <IconRefresh size={15} /> Reabrir ticket
        </button>
      )}
    </div>
  );
}

/* ── Sheet de cierre (motivo obligatorio — patrón Zendesk) ── */

export function CerrarSheet({
  ticket,
  onCerrar,
  onCancelar,
}: {
  ticket: Ticket;
  onCerrar: (cierre: Cierre, nota?: string) => void;
  onCancelar: () => void;
}) {
  const [cierre, setCierre] = useState<Cierre | null>(null);
  const [nota, setNota] = useState("");

  return (
    <Modal onClose={onCancelar} ancho={420}>
      <div className="p-6">
        <div className="mb-1 flex items-start justify-between">
          <h3 className="serif text-xl tracking-tight">Cerrar ticket</h3>
          <button onClick={onCancelar} className="text-muted hover:text-paper" aria-label="Cancelar">
            <IconX size={17} />
          </button>
        </div>
        <p className="mb-5 text-xs text-muted">
          {ticket.nombre ?? ticket.telefono}
          {ticket.cotizacion && ` · ${money(ticket.cotizacion.total)}`} — el motivo alimenta las métricas del embudo.
        </p>
        <div className="flex flex-col gap-2">
          {(Object.keys(CIERRE_META) as Cierre[]).map((c) => {
            const meta = CIERRE_META[c];
            const activo = cierre === c;
            return (
              <button
                key={c}
                onClick={() => setCierre(c)}
                className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                style={{
                  background: activo ? `color-mix(in srgb, ${meta.color} 12%, transparent)` : "color-mix(in srgb, var(--color-paper) 4%, transparent)",
                  border: `1px solid ${activo ? `color-mix(in srgb, ${meta.color} 45%, transparent)` : "color-mix(in srgb, var(--color-paper) 7%, transparent)"}`,
                }}
              >
                <span className="text-lg">{meta.emoji}</span>
                <span>
                  <span className="block text-[13px] font-bold" style={{ color: activo ? meta.color : "var(--color-paper)" }}>
                    {meta.nombre}
                  </span>
                  <span className="text-[11px] text-muted">
                    {c === "ganado" ? "Vino y compró 🙌" : c === "perdido" ? "No compró — anota por qué" : "Se enfrió, dejó de contestar"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={cierre === "perdido" ? "¿Por qué se perdió? (ej: precio)" : "Nota opcional…"}
          className="gp-field mt-3 w-full rounded-xl px-3.5 py-2.5 text-xs placeholder:text-faint"
        />
        <button
          disabled={!cierre}
          onClick={() => cierre && onCerrar(cierre, nota.trim() || undefined)}
          className="btn-aurora mt-4 w-full rounded-2xl py-3 text-[13px] font-bold transition-all disabled:opacity-30"
        >
          Confirmar cierre
        </button>
      </div>
    </Modal>
  );
}

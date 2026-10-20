import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ChatBubble, Composer, CotizacionModal, TypingBubble } from "../components/chat";
import { IconBack, IconDoc, IconRefresh, IconX } from "../components/icons";
import { BlockTitle, Campo, CierreBadge, CierreIcon, MedidaChip, Modal, Segmented } from "../components/ui";
import { CIERRE_META, ETAPA_META, type Cierre, type Mensaje, type Ticket } from "../data/types";
import { etiquetaVisita, money, relTime } from "../lib/format";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

/** El nombre de pila del cliente, para el compositor y la firma de sus mensajes. */
function nombreCorto(ticket: Ticket): string {
  return ticket.nombre?.trim().split(/\s+/)[0] ?? "el cliente";
}

export function TicketDetail({ id }: { id: number }) {
  const { tickets, ticketsSueltos, mensajes, typing, abrirTicket, enviarMensaje, setAtiende, cerrar, reabrir, agregarNota } = useHub();
  // El listado corta en 500: un enlace viejo apunta a una conversación que
  // existe pero no vino en el lote. `abrirTicket` la trae de a una.
  const ticket = tickets.find((t) => t.id === id) ?? ticketsSueltos[id];
  const msgs = mensajes[id] ?? [];
  const escribiendo = typing[id];
  const now = useNow();

  const [verCotizacion, setVerCotizacion] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [fichaMovil, setFichaMovil] = useState(false);
  const [verDescuento, setVerDescuento] = useState(false);
  const [cargandoTicket, setCargandoTicket] = useState(!ticket);

  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * EL CHAT SE CALZA SOBRE LO QUE EL TECLADO DEJA LIBRE.
   *
   * En iOS el teclado NO encoge `100dvh`: la página se queda del alto entero y
   * el composer termina debajo del teclado, escribiendo a ciegas. La única
   * medida fiable es `visualViewport`, y hay que escuchar `scroll` además de
   * `resize` porque el pan de Safari con el teclado abierto solo dispara el
   * primero.
   */
  const [marco, setMarco] = useState<{ alto: number; top: number } | null>(null);
  const [movil, setMovil] = useState(() => window.matchMedia("(max-width: 767px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMovil(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => setMarco({ alto: vv.height, top: vv.offsetTop });
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    setCargandoTicket(true);
    void abrirTicket(id).finally(() => setCargandoTicket(false));
  }, [id, abrirTicket]);

  useEffect(() => {
    // autoscroll al fondo con cada mensaje / typing
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, escribiendo]);

  // El teclado sube y el último mensaje tiene que seguir a la vista.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [marco?.alto]);

  // marcar leído cuando llegan mensajes mientras se está viendo
  useEffect(() => {
    if (ticket && ticket.sinLeer > 0) void abrirTicket(id);
  }, [ticket?.sinLeer, id, ticket, abrirTicket]);

  if (!ticket) {
    return (
      <div className="grid h-full place-items-center text-[14px] text-text2">
        {cargandoTicket ? (
          "Abriendo la conversación…"
        ) : (
          <span>
            Ticket no encontrado.{" "}
            <button className="font-semibold text-signal underline underline-offset-[3px]" onClick={() => navigate("inbox")}>
              Volver al Inbox
            </button>
          </span>
        )}
      </div>
    );
  }

  const abierto = ticket.estado === "abierto";
  const nombre = nombreCorto(ticket);
  // Lo visible contra la ventana entera: si falta un buen pedazo, el teclado
  // está arriba. `dvh` no sirve para saberlo en iOS.
  const tecladoAbierto = marco !== null && window.innerHeight - marco.alto - marco.top > 80;

  const abrirDescuento = () => {
    setVerDescuento(true);
    if (movil) setFichaMovil(true);
  };

  const ficha = (
    <Ficha
      ticket={ticket}
      now={now}
      verDescuento={verDescuento}
      onToggleDescuento={() => setVerDescuento((v) => !v)}
      onVerCotizacion={() => {
        setFichaMovil(false);
        setVerCotizacion(true);
      }}
      onReabrir={() => void reabrir(ticket.id)}
      onNota={(texto) => void agregarNota(ticket.id, texto)}
    />
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      // En el teléfono la conversación se comporta como una app de mensajes:
      // ocupa EXACTAMENTE el área visible, por encima de la barra de tabs,
      // para que el composer quede pegado al teclado y no debajo.
      style={movil && marco
        ? { position: "fixed", left: 0, right: 0, top: marco.top, height: marco.alto, zIndex: 30, background: "var(--color-bg)" }
        : undefined}
    >
      {/* ── Cabecera ── */}
      <header className="flex items-center justify-between gap-3 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 md:px-8 md:pt-[30px] md:pb-[22px]">
        <div className="flex min-w-0 items-baseline gap-3.5">
          <button onClick={() => navigate("inbox")} className="hidden text-[13px] text-text2 hover:text-text md:inline">← Inbox</button>
          <button onClick={() => navigate("inbox")} className="grid h-9 w-9 shrink-0 place-items-center self-center rounded-[6px] text-text2 md:hidden" aria-label="Volver al Inbox">
            <IconBack size={20} />
          </button>
          <h1 className="truncate text-[17px] font-semibold tracking-[-0.01em] md:text-[22px]">{ticket.nombre ?? ticket.telefono}</h1>
          {ticket.nombre && <span className="tnum hidden font-mono text-[13px] text-text2 lg:inline">{ticket.telefono}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {abierto && (
            <>
              <button onClick={abrirDescuento} className="btn-quiet hidden h-9 rounded-[6px] px-3.5 text-[13px] md:inline-flex md:items-center">Ofrecer descuento</button>
              <button onClick={() => setCerrando(true)} className="btn-quiet hidden h-9 rounded-[6px] px-3.5 text-[13px] md:inline-flex md:items-center">Cerrar ticket</button>
            </>
          )}
          <button onClick={() => setFichaMovil(true)} className="btn-quiet h-9 rounded-[6px] px-3 text-[13px] lg:hidden">Ficha</button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 px-0 pb-0 md:mx-8 md:mb-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Chat ── */}
        <div className="flex min-h-0 flex-col overflow-hidden border-line bg-surface md:rounded-[10px] md:border">
          <div className="flex h-14 items-center justify-between gap-4 border-b border-line px-4 md:px-5">
            <span className="text-[13px] font-semibold whitespace-nowrap">Quién contesta</span>
            {abierto ? (
              <Segmented
                id="atiende"
                valor={ticket.atiende}
                onChange={(v) => void setAtiende(ticket.id, v)}
                // En 390 px no entran las dos frases: van las dos palabras.
                opciones={[
                  { valor: "bot", label: movil ? "El bot" : "Contesta el bot" },
                  { valor: "humano", label: movil ? "Ustedes" : "Contestan ustedes" },
                ]}
              />
            ) : ticket.cierre ? (
              <span className="flex items-center gap-3">
                <CierreBadge cierre={ticket.cierre} />
                <button onClick={() => void reabrir(ticket.id)} className="btn-quiet flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[12px]">
                  <IconRefresh size={13} /> Reabrir
                </button>
              </span>
            ) : null}
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5 md:py-5"
            // Tocar la conversación baja el teclado, como en WhatsApp.
            onTouchStart={() => {
              const foco = document.activeElement;
              if (foco instanceof HTMLInputElement || foco instanceof HTMLTextAreaElement) foco.blur();
            }}
          >
            <div className="flex flex-col gap-2.5">
              <AvisoMonologo ticket={ticket} mensajes={msgs} />
              {msgs.map((m) => (
                <ChatBubble key={m.id} msg={m} nombreCliente={nombre} onVerPdf={() => setVerCotizacion(true)} />
              ))}
              <AnimatePresence>{escribiendo && <TypingBubble rol={escribiendo} />}</AnimatePresence>
            </div>
          </div>

          <div
            className="border-t border-line"
            // Con el teclado abierto la barra del home queda detrás de él: el
            // safe-area se volvería una franja muerta entre composer y teclado.
            style={{ paddingBottom: movil && !tecladoAbierto ? "max(0px, env(safe-area-inset-bottom))" : undefined }}
          >
            <Composer
              ticket={ticket}
              nombreCliente={nombre}
              onEnviar={(texto) => void enviarMensaje(ticket.id, texto)}
              onTomar={() => void setAtiende(ticket.id, "humano")}
            />
          </div>
        </div>

        {/* ── Ficha (escritorio ancho) ── */}
        <aside className="hidden min-h-0 overflow-y-auto rounded-[10px] border border-line bg-surface lg:block">{ficha}</aside>
      </div>

      {/* ── Ficha (teléfono y tablet, en hoja) ── */}
      <AnimatePresence>
        {fichaMovil && (
          <Modal onClose={() => setFichaMovil(false)} ancho={420}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <span className="text-[15px] font-semibold">Ficha</span>
              <button onClick={() => setFichaMovil(false)} className="grid h-8 w-8 place-items-center text-text2" aria-label="Cerrar"><IconX size={16} /></button>
            </div>
            {ficha}
            {abierto && (
              <div className="flex gap-2 border-t border-line p-4">
                <button onClick={() => { setFichaMovil(false); setCerrando(true); }} className="btn-quiet h-10 flex-1 rounded-[6px] text-[13px]">Cerrar ticket</button>
              </div>
            )}
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

/**
 * Una conversación donde solo se ve al cliente no es lo mismo que una
 * conversación donde nadie contestó, y hasta ahora las dos se veían igual.
 *
 * Este aviso dice cuál de los tres motivos es, con el dato real de cada uno:
 *  · el bot está apagado (no contesta, y eso es una decisión, no una falla);
 *  · la conversación está en manos de un asesor;
 *  · el asesor contesta desde su WhatsApp y Meta no nos manda la copia — el
 *    único de los tres que es un error y hay que arreglar.
 */
function AvisoMonologo({ ticket, mensajes }: { ticket: Ticket; mensajes: Mensaje[] }) {
  const { power, echoHealth } = useHub();
  const delCliente = mensajes.filter((m) => m.rol === "cliente").length;
  const nuestros = mensajes.length - delCliente;
  if (delCliente === 0 || nuestros > 0) return null;

  const ecosRotos = (echoHealth?.descartados ?? 0) > 0;
  const ecosNuncaLlegaron = echoHealth != null && echoHealth.guardados === 0 && !ecosRotos;
  const motivos: string[] = [];
  if (!power.activo) motivos.push("El bot está apagado, así que no contestó ninguno de estos mensajes.");
  if (ticket.atiende === "humano") motivos.push("La conversación está asignada a un asesor: el bot no responde mientras siga así.");
  if (ecosRotos) {
    motivos.push(
      `Llegaron ${echoHealth?.descartados} respuestas de asesor desde WhatsApp y se descartaron (${
        echoHealth?.ultimoDescarteMotivo === "sin_app_secret"
          ? "falta el app secret del canal"
          : "la firma no coincide con el app secret guardado"
      }). Eso sí es un error: revisa Configuración técnica → WhatsApp.`,
    );
  } else if (ecosNuncaLlegaron) {
    motivos.push(
      "Meta nunca nos ha mandado copia de lo que un asesor escribe desde su celular. Si alguien le respondió por WhatsApp, ese mensaje existe para el cliente pero no para el panel: hay que marcar «message_echoes» en Meta (Configuración técnica → WhatsApp lo comprueba).",
    );
  } else if (echoHealth) {
    motivos.push(
      "Las respuestas que un asesor escribe desde WhatsApp sí están entrando al panel, así que aquí de verdad no contestó nadie todavía.",
    );
  }
  const esError = ecosRotos || ecosNuncaLlegaron;

  return (
    <div
      className="mb-1 rounded-[8px] border px-3.5 py-3 text-[13px] leading-relaxed"
      style={{
        borderColor: esError ? "rgba(168,115,31,.45)" : "var(--color-line)",
        background: esError ? "rgba(168,115,31,.07)" : "var(--color-bg)",
      }}
    >
      <p className="font-semibold">Aquí solo hay mensajes del cliente</p>
      {motivos.map((motivo) => (
        <p key={motivo} className="mt-1 text-text2">{motivo}</p>
      ))}
      {motivos.length === 0 && <p className="mt-1 text-text2">Nadie ha respondido todavía en esta conversación.</p>}
    </div>
  );
}

/* ── Ficha del cliente: etiqueta / valor, como una ficha impresa ── */

function Seccion({ titulo, aside, children, ultima = false }: { titulo: string; aside?: React.ReactNode; children: React.ReactNode; ultima?: boolean }) {
  return (
    <section className={`flex flex-col gap-3.5 px-5 pt-5 pb-[18px] ${ultima ? "" : "border-b border-line"}`}>
      <BlockTitle aside={aside}>{titulo}</BlockTitle>
      {children}
    </section>
  );
}

function Campos({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-3">{children}</div>;
}

function Ficha({
  ticket,
  now,
  verDescuento,
  onToggleDescuento,
  onVerCotizacion,
  onReabrir,
  onNota,
}: {
  ticket: Ticket;
  now: number;
  verDescuento: boolean;
  onToggleDescuento: () => void;
  onVerCotizacion: () => void;
  onReabrir: () => void;
  onNota: (texto: string) => void;
}) {
  const { crearDescuento } = useHub();
  const [nota, setNota] = useState("");
  const [promptDescuento, setPromptDescuento] = useState("");
  const [entregaDescuento, setEntregaDescuento] = useState<"now" | "next_message">("next_message");
  const [estadoDescuento, setEstadoDescuento] = useState<string | null>(null);
  const [guardandoDescuento, setGuardandoDescuento] = useState(false);
  const descuentoRef = useRef<HTMLElement>(null);
  const abierto = ticket.estado === "abierto";
  const cot = ticket.cotizacion;

  // Al abrir el editor desde la cabecera, la sección tiene que quedar a la vista.
  useEffect(() => {
    if (verDescuento) descuentoRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [verDescuento]);

  const confirmarDescuento = async () => {
    if (promptDescuento.trim().length < 3) {
      setEstadoDescuento("Escribe el descuento y la condición.");
      return;
    }
    setGuardandoDescuento(true);
    setEstadoDescuento(null);
    try {
      const result = await crearDescuento(ticket.id, promptDescuento.trim(), entregaDescuento);
      setEstadoDescuento(result.sent ? "Descuento notificado al cliente." : (result.warning ?? "Oferta registrada; requiere plantilla."));
      onToggleDescuento();
      setPromptDescuento("");
    } catch (error) {
      setEstadoDescuento(error instanceof Error ? error.message : "No se pudo crear la oferta.");
    } finally {
      setGuardandoDescuento(false);
    }
  };

  const cantidad = cot?.items.reduce((s, i) => s + i.cantidad, 0);
  const visita = etiquetaVisita(ticket.visitDate, ticket.compromisoCliente, now)
    ?? (ticket.visitDate ? new Date(ticket.visitDate).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);
  const espera = abierto && ticket.sinLeer > 0;
  const mono = "tnum font-mono";

  return (
    <div className="flex flex-col">
      <Seccion titulo="Vehículo y medida" aside={ticket.esRecurrente ? "Ya compró antes" : undefined}>
        <Campos>
          <Campo etiqueta="Vehículo">{ticket.vehiculo ?? <span className="text-text2">Por identificar</span>}</Campo>
          <Campo etiqueta="Medida">{ticket.medida ? <MedidaChip medida={ticket.medida} /> : <span className="text-text2">Aún no identificada</span>}</Campo>
          <Campo etiqueta="Cantidad">{cantidad ? <span className={mono}>{cantidad} {cantidad === 1 ? "llanta" : "llantas"}</span> : <span className="text-text2">Sin definir</span>}</Campo>
          <Campo etiqueta="Etapa">{ETAPA_META[ticket.etapa].nombre}</Campo>
        </Campos>
      </Seccion>

      <Seccion titulo="Compromiso">
        <Campos>
          <Campo etiqueta="Visita">{visita ?? <span className="text-text2">Sin fecha todavía</span>}</Campo>
          <Campo etiqueta="Local">
            {ticket.localAsignado ? (
              <span>
                {ticket.localAsignado.nombre}
                <span className="block text-[12px] text-text2">{ticket.localAsignado.direccion} · a {ticket.localAsignado.distanciaKm.toFixed(1).replace(".", ",")} km</span>
              </span>
            ) : (
              <span className="text-text2">Sin asignar</span>
            )}
          </Campo>
          <Campo etiqueta="Última respuesta">
            {espera ? (
              <span className="font-semibold text-signal">Pregunta sin contestar · {relTime(ticket.ultimaActividad, now).replace("hace ", "")}</span>
            ) : (
              <span className="text-text2">{relTime(ticket.ultimaActividad, now)}</span>
            )}
          </Campo>
          {ticket.followUpReason && <Campo etiqueta="Requiere atención">{ticket.followUpReason}</Campo>}
        </Campos>
      </Seccion>

      {(ticket.resumen || ticket.queBusca || ticket.opcionesComparadas?.length || ticket.opcionElegida) && (
        <Seccion titulo="Comparación">
          <Campos>
            <Campo etiqueta="Pidió">{ticket.queBusca ?? ticket.medida ?? <span className="text-text2">Por identificar</span>}</Campo>
            <Campo etiqueta="Comparó">{ticket.opcionesComparadas?.length ? ticket.opcionesComparadas.map(String).join(" · ") : <span className="text-text2">Sin comparación registrada</span>}</Campo>
            <Campo etiqueta="Eligió">{ticket.opcionElegida ?? <span className="text-text2">Aún no eligió</span>}</Campo>
          </Campos>
          {ticket.resumen && <p className="text-[13px] leading-relaxed text-text2">{ticket.resumen}</p>}
        </Seccion>
      )}

      <Seccion titulo={cot ? `Cotización #${cot.numero}` : "Cotización"}>
        {cot ? (
          <>
            <Campos>
              <Campo etiqueta={cot.items.length === 1 ? "Modelo" : "Modelos"}>{cot.items.map((i) => i.descripcion).join(" · ")}</Campo>
              <Campo etiqueta="Unitario"><span className={mono}>{cot.items.map((i) => `${money(i.precioUnit)} × ${i.cantidad}`).join(" · ")}</span></Campo>
              <Campo etiqueta="Subtotal"><span className={mono}>{money(cot.subtotal)}</span></Campo>
              <Campo etiqueta="IVA 15 %"><span className={mono}>{money(cot.iva)}</span></Campo>
              {cot.discountAmount ? <Campo etiqueta="Descuento"><span className={`${mono} text-ok`}>−{money(cot.discountAmount)}</span>{cot.discountCondition && <span className="block text-[12px] text-text2">si {cot.discountCondition}</span>}</Campo> : null}
              <Campo etiqueta="Total"><span className={`${mono} font-bold`}>{money(cot.total)}</span></Campo>
            </Campos>
            <button onClick={onVerCotizacion} className="btn-quiet flex h-9 items-center justify-center gap-2 rounded-[6px] text-[13px]">
              <IconDoc size={14} /> Ver PDF
            </button>
          </>
        ) : (
          <p className="text-[13px] text-text2">Todavía no se le envió una cotización.</p>
        )}
      </Seccion>

      <section ref={descuentoRef} className="flex flex-col gap-3.5 border-b border-line px-5 pt-5 pb-[18px]">
        <BlockTitle aside={abierto ? <button onClick={onToggleDescuento} className="font-medium text-signal">{verDescuento ? "Cancelar" : ticket.descuentoActivo ? "Ajustar" : "Ofrecer"}</button> : undefined}>Descuento</BlockTitle>
        {ticket.descuentoActivo ? (
          <Campos>
            <Campo etiqueta="Autorizado"><span className={`${mono} font-semibold text-ok`}>−{money(ticket.descuentoActivo.amount)}</span> · total {money(ticket.descuentoActivo.finalTotal)}</Campo>
            <Campo etiqueta="Condición">{ticket.descuentoActivo.condition}</Campo>
          </Campos>
        ) : ticket.descuentoPendiente ? (
          <Campos>
            <Campo etiqueta="Listo para la próxima"><span className={mono}>{ticket.descuentoPendiente.kind === "percentage" ? `${ticket.descuentoPendiente.value / 100} %` : money(ticket.descuentoPendiente.value / 100)}</span></Campo>
            <Campo etiqueta="Condición">{ticket.descuentoPendiente.condition}</Campo>
          </Campos>
        ) : (
          !verDescuento && <p className="text-[13px] text-text2">El bot sólo ofrece el monto y la condición que autorices aquí.{!cot && " Si lo autorizás ahora, se aplica a la próxima cotización."}</p>
        )}
        {verDescuento && abierto && (
          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1.5 text-[12px] text-text2">
              Indicación para el bot
              <textarea
                value={promptDescuento}
                onChange={(e) => setPromptDescuento(e.target.value)}
                placeholder="Ej. 5% de descuento si recoge esta semana"
                className="gp-field min-h-20 text-[13px] text-text"
                autoFocus
              />
            </label>
            <Segmented
              id="entrega-descuento"
              valor={entregaDescuento}
              onChange={setEntregaDescuento}
              opciones={[
                { valor: "next_message", label: "En el siguiente mensaje" },
                { valor: "now", label: "Notificar ahora" },
              ]}
            />
            <p className="text-[12px] leading-relaxed text-text2">El bot aplica el ahorro exacto en la cotización. Vale en tienda presentando el número de cotización.</p>
            <button disabled={guardandoDescuento} onClick={() => void confirmarDescuento()} className="btn-signal h-10 rounded-[6px] text-[13px]">
              {guardandoDescuento ? "Confirmando…" : "Confirmar descuento"}
            </button>
          </div>
        )}
        {estadoDescuento && <p className="text-[12px] text-text2">{estadoDescuento}</p>}
      </section>

      <Seccion titulo="Notas internas" ultima>
        {ticket.notas.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {ticket.notas.map((n, i) => (
              <li key={i} className="rounded-[6px] bg-bg px-3 py-2 text-[13px] leading-relaxed">{n}</li>
            ))}
          </ul>
        )}
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === "Return") && !e.nativeEvent.isComposing && nota.trim()) {
              onNota(nota.trim());
              setNota("");
            }
          }}
          placeholder="Agregar nota… (Enter para guardar)"
          className="gp-field text-[13px]"
        />
        {!abierto && (
          <button onClick={onReabrir} className="btn-quiet flex h-10 items-center justify-center gap-2 rounded-[6px] text-[13px]">
            <IconRefresh size={14} /> Reabrir ticket
          </button>
        )}
      </Seccion>
    </div>
  );
}

/* ── Cierre con motivo: el motivo alimenta las métricas del embudo ── */

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
  const explicacion: Record<Cierre, string> = {
    ganado: "Vino y compró",
    perdido: "No compró — anota por qué",
    sin_respuesta: "Se enfrió, dejó de contestar",
  };

  return (
    <Modal onClose={onCancelar} ancho={420}>
      <div className="p-6">
        <div className="mb-1 flex items-start justify-between">
          <h3 className="text-[18px] font-semibold tracking-[-0.01em]">Cerrar ticket</h3>
          <button onClick={onCancelar} className="text-text2 hover:text-text" aria-label="Cancelar">
            <IconX size={17} />
          </button>
        </div>
        <p className="mb-5 text-[13px] text-text2">
          {ticket.nombre ?? ticket.telefono}
          {ticket.cotizacion && ` · ${money(ticket.cotizacion.total)}`}
        </p>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Motivo del cierre">
          {(Object.keys(CIERRE_META) as Cierre[]).map((c) => {
            const meta = CIERRE_META[c];
            const activo = cierre === c;
            return (
              <button
                key={c}
                role="radio"
                aria-checked={activo}
                onClick={() => setCierre(c)}
                className={`flex items-center gap-3 rounded-[8px] border px-4 py-3 text-left transition-colors ${activo ? "border-signal bg-signal-tint" : "border-line bg-surface hover:bg-bg"}`}
              >
                <CierreIcon cierre={c} size={18} />
                <span>
                  <span className={`block text-[14px] ${activo ? "font-semibold" : "font-medium"}`}>{meta.nombre}</span>
                  <span className="text-[12px] text-text2">{explicacion[c]}</span>
                </span>
              </button>
            );
          })}
        </div>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={cierre === "perdido" ? "¿Por qué se perdió? (ej: precio)" : "Nota opcional…"}
          className="gp-field mt-3 text-[13px]"
        />
        <button
          disabled={!cierre}
          onClick={() => cierre && onCerrar(cierre, nota.trim() || undefined)}
          className="btn-signal mt-4 h-11 w-full rounded-[6px] text-[14px]"
        >
          Confirmar cierre
        </button>
      </div>
    </Modal>
  );
}

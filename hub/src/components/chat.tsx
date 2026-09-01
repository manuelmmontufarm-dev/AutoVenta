import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "../data/realSource";
import type { Mensaje, Rol, Ticket } from "../data/types";
import { horaCorta, money } from "../lib/format";
import { IconAlert, IconBot, IconCheck, IconChevronR, IconClock, IconDoc, IconDoubleCheck, IconPin, IconSend, IconUser, IconX } from "./icons";
import { Modal } from "./ui";

/* ── Burbuja ── */

export function ChatBubble({ msg, onVerPdf }: { msg: Mensaje; onVerPdf?: () => void }) {
  const saliente = msg.rol !== "cliente";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={`flex ${saliente ? "justify-end" : "justify-start"}`}
    >
      <div className={`bubble ${saliente ? "bubble-out" : "bubble-in"}`}>
        {msg.rol === "vendedor" && (
          <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold text-lime">
            <IconUser size={10} /> Vendedor
          </p>
        )}
        {msg.tipo === "pdf" || msg.tipo === "imagen" ? (
          <PiezaAdjunta msg={msg} onFallback={onVerPdf} />
        ) : msg.tipo === "ubicacion" ? (
          <MapCard etiqueta={msg.contenido} />
        ) : (
          <p className="m-0 whitespace-pre-wrap">{msg.contenido}</p>
        )}
        {saliente && msg.estado === "failed" && msg.tipo !== "imagen" && (
          <p
            className="mt-1 mb-0 rounded-lg px-2 py-1 text-[10.5px]"
            style={{ background: "color-mix(in srgb, var(--color-red) 12%, transparent)", color: "var(--color-red)" }}
          >
            <b>No le llegó al cliente.</b>
            {motivoDeFallo(msg) ? <span className="block opacity-80">{motivoDeFallo(msg)}</span> : null}
          </p>
        )}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px]" style={{ color: "var(--color-bubble-meta)" }}>
          {horaCorta(msg.hora)}
          {saliente && <EstadoEnvio estado={msg.estado} />}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * El estado REAL del envío, no un adorno.
 *
 * Hasta el 8-ago aquí iba un doble check fijo en todo mensaje saliente: en cola,
 * aceptado por Meta, entregado y FALLIDO se veían exactamente igual. Manuel lo
 * describió perfecto — «en la página sale como si responde pero en vida real
 * no». El backend siempre supo la diferencia (guarda sent/delivered/read/failed
 * con el error de Meta); el panel simplemente no la miraba.
 *
 * La distinción que importa es la primera: *aceptado* (un check) no es
 * *entregado* (dos). Meta acepta un mensaje y lo puede dejar caer después.
 */
function EstadoEnvio({ estado }: { estado?: string }) {
  if (estado === "failed") {
    return <IconAlert size={13} style={{ color: "var(--color-red)" }} aria-label="No se envió" />;
  }
  if (estado === "read") {
    return <IconDoubleCheck size={13} style={{ color: "var(--color-lime)" }} aria-label="Leído" />;
  }
  if (estado === "delivered") {
    return <IconDoubleCheck size={13} style={{ color: "var(--color-check)" }} aria-label="Entregado" />;
  }
  if (estado === "sent") {
    return <IconCheck size={13} style={{ color: "var(--color-check)" }} aria-label="Aceptado por WhatsApp, sin confirmar entrega" />;
  }
  return <IconClock size={12} style={{ color: "var(--color-bubble-meta)" }} aria-label="En cola" />;
}

/** El motivo que devolvió Meta, si lo hay. Llega crudo dentro de metadata. */
function motivoDeFallo(msg: Mensaje): string | null {
  const error = (msg.metadata as { error?: unknown } | undefined)?.error;
  const primero = Array.isArray(error) ? error[0] : error;
  if (!primero || typeof primero !== "object") return null;
  const dato = primero as { title?: string; message?: string; error_data?: { details?: string }; code?: number };
  const texto = dato.error_data?.details ?? dato.message ?? dato.title;
  return texto ? `${texto}${dato.code ? ` (${dato.code})` : ""}` : null;
}

/* ── Pieza visual enviada (cotización, comparativa, opciones) ── */

/**
 * Dibuja en el chat la pieza que se le mandó al cliente — cotización,
 * comparativa u opciones — y deja revisarla sin salir de la conversación.
 *
 * El PNG no se guarda —se sube a Meta y se descarta—, así que el servidor la
 * vuelve a dibujar desde los códigos del mensaje. Eso significa que usa los
 * precios de HOY: sirve para comprobar que la pieza se ve bien, no como copia
 * exacta de lo que recibió el cliente.
 *
 * Antes esto se veía de dos maneras y ninguna servía para revisar: la imagen
 * salía en una miniatura de 260 px sin forma de ampliarla, y el documento era
 * una tarjeta que abría la cotización *actual del ticket*, no la de ese
 * mensaje. Para leer los precios había que abrir la imagen en otra pestaña y
 * perder el hilo del chat. Ahora la pieza se ve dentro de la burbuja, se
 * aplasta a una línea cuando estorba y se amplía encima del chat.
 *
 * El estado del envío sale del mensaje, no de que la imagen cargue: una pieza
 * que falló se vuelve a dibujar igual, y confundir eso sería peor que no
 * mostrarla. Si el servidor no la puede dibujar (o el panel corre en demo, sin
 * sesión), queda la tarjeta de documento de siempre.
 */
/**
 * La pieza se pide CON la autenticación del hub y se muestra como blob.
 *
 * Un `<img src="/api/…">` plano no manda ni el Bearer de la sesión ni la
 * x-admin-key, así que en producción —donde ADMIN_KEY siempre está puesta—
 * cada pieza respondía 401, saltaba el `onError` y el chat mostraba la
 * tarjeta de documento muerta: «no se abren los pdfs» (Manuel, 1-sep). En
 * local sin clave el `<img>` pasaba, por eso no se vio antes de desplegar.
 */
function usePiezaAutenticada(url: string): { src: string | null; falló: boolean } {
  const [src, setSrc] = useState<string | null>(null);
  const [falló, setFalló] = useState(false);
  useEffect(() => {
    let vivo = true;
    let objeto: string | null = null;
    setSrc(null);
    setFalló(false);
    fetch(url, { headers: authHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(`pieza ${r.status}`);
        const blob = await r.blob();
        if (!vivo) return;
        objeto = URL.createObjectURL(blob);
        setSrc(objeto);
      })
      .catch(() => {
        if (vivo) setFalló(true);
      });
    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [url]);
  return { src, falló };
}

function PiezaAdjunta({ msg, onFallback }: { msg: Mensaje; onFallback?: () => void }) {
  const [aplastada, setAplastada] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const fallida = msg.estado === "failed";
  const error = (msg.metadata as { renderError?: string } | undefined)?.renderError;
  const { src, falló } = usePiezaAutenticada(`/api/hub/messages/${msg.id}/pieza.png`);
  const titulo = tituloDePieza(msg);

  if (falló) return <PdfCard titulo={msg.contenido} onVer={onFallback} />;

  return (
    <div className="flex w-full max-w-[260px] flex-col gap-1.5">
      {fallida ? (
        <div
          className="rounded-xl px-3 py-2 text-[11px]"
          style={{ background: "color-mix(in srgb, var(--color-red) 12%, transparent)", color: "var(--color-red)" }}
        >
          <b>No le llegó al cliente.</b>
          {error ? <span className="block opacity-80">{error}</span> : null}
        </div>
      ) : null}

      <button
        onClick={() => setAplastada((v) => !v)}
        aria-expanded={!aplastada}
        className="flex w-full items-center gap-2 rounded-xl p-2 text-left transition-colors"
        style={{ background: "rgba(0,0,0,.22)", border: "1px solid color-mix(in srgb, var(--color-paper) 10%, transparent)" }}
      >
        {/* El icono del doc es papel literal (un PDF es blanco en cualquier tema) */}
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: "#f5f4ee", color: "#262624" }}>
          <IconDoc size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold">{titulo}</span>
          <span className="block text-[10px]" style={{ color: "var(--color-bubble-meta)" }}>
            {aplastada ? "toca para verlo" : "toca para aplastarlo"}
          </span>
        </span>
        <span
          className="shrink-0 transition-transform"
          style={{ transform: aplastada ? "rotate(0deg)" : "rotate(90deg)", color: "var(--color-bubble-meta)" }}
        >
          <IconChevronR size={14} />
        </span>
      </button>

      {!aplastada && (src ? (
        <button
          onClick={() => setAmpliada(true)}
          className="block w-full overflow-hidden rounded-xl transition-transform hover:-translate-y-px"
          aria-label={`Ampliar ${titulo}`}
        >
          <img
            src={src}
            alt={titulo}
            className="block w-full"
            style={{ background: "color-mix(in srgb, var(--color-paper) 4%, transparent)" }}
          />
        </button>
      ) : (
        // Mientras la pieza baja: un lienzo del alto aproximado para que el
        // chat no salte cuando llegue la imagen.
        <div
          className="w-full animate-pulse rounded-xl"
          style={{ height: 150, background: "color-mix(in srgb, var(--color-paper) 6%, transparent)" }}
        />
      ))}

      <p className="m-0 text-[11px] opacity-75">{msg.contenido}</p>

      {/* Al body: la burbuja lleva un transform de framer-motion y un `fixed`
          dentro de ella se posiciona contra la burbuja, no contra la pantalla —
          el visor salía encajado detrás del chat. */}
      {createPortal(
        <AnimatePresence>
        {ampliada && (
          <Modal onClose={() => setAmpliada(false)} ancho={640}>
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="text-[13px] font-bold">{titulo}</p>
                <button onClick={() => setAmpliada(false)} className="text-muted hover:text-paper" aria-label="Cerrar">
                  <IconX size={17} />
                </button>
              </div>
              <img src={src ?? undefined} alt={titulo} className="block w-full rounded-2xl" style={{ background: "#f5f4ee" }} />
              <p className="mt-2 px-1 text-[11px] text-muted">{msg.contenido}</p>
            </div>
          </Modal>
        )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/**
 * Cómo se llama la pieza en el chat.
 *
 * El texto del mensaje es un resumen para el registro («Opciones enviadas: …»)
 * y puede medir tres líneas. En la cabecera va el nombre corto, que es lo que
 * el asesor busca cuando repasa la conversación.
 */
function tituloDePieza(msg: Mensaje): string {
  const meta = msg.metadata as { quoteNumber?: string | number; piece?: string } | undefined;
  if (meta?.quoteNumber) return `Cotización #${meta.quoteNumber}`;
  if (meta?.piece === "comparison") return "Comparativa de opciones";
  if (meta?.piece === "options") return "Opciones enviadas";
  if (meta?.piece === "quote") return "Cotización";
  return msg.contenido;
}

/* ── Mensaje PDF como card de documento ── */

function PdfCard({ titulo, onVer }: { titulo: string; onVer?: () => void }) {
  return (
    <button
      onClick={onVer}
      className="flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition-transform hover:-translate-y-px"
      style={{ background: "rgba(0,0,0,.22)", border: "1px solid color-mix(in srgb, var(--color-paper) 10%, transparent)" }}
    >
      {/* El icono del doc es papel literal (un PDF es blanco en cualquier tema) */}
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "#f5f4ee", color: "#262624" }}>
        <IconDoc size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold">{titulo}</span>
        <span className="text-[10.5px]" style={{ color: "var(--color-bubble-meta)" }}>
          PDF · 1 página · toca para ver
        </span>
      </span>
    </button>
  );
}

/* ── Mensaje de ubicación como mini-mapa ── */

function MapCard({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="w-52 overflow-hidden rounded-xl" style={{ border: "1px solid color-mix(in srgb, var(--color-paper) 10%, transparent)" }}>
      <div className="relative h-24" style={{ background: "#0d1930" }}>
        <svg viewBox="0 0 208 96" className="absolute inset-0 h-full w-full">
          <path d="M-10 70 C 40 60, 60 30, 110 34 S 190 60, 220 48" stroke="rgba(255,255,255,.14)" strokeWidth="7" fill="none" />
          <path d="M30 -10 C 36 30, 20 60, 44 110" stroke="rgba(255,255,255,.1)" strokeWidth="5" fill="none" />
          <path d="M120 -10 L 150 110" stroke="rgba(255,255,255,.08)" strokeWidth="4" fill="none" />
          <path d="M-10 20 L 220 14" stroke="rgba(255,255,255,.06)" strokeWidth="3" fill="none" />
          <circle cx="104" cy="44" r="13" fill="rgba(227,38,46,.25)">
            <animate attributeName="r" values="10;16;10" dur="2.2s" repeatCount="indefinite" />
          </circle>
        </svg>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[85%] text-red">
          <IconPin size={26} />
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: "rgba(0,0,0,.25)", color: "#fff" }}>
        <IconPin size={11} /> {etiqueta.replace("📍 ", "")}
      </div>
    </div>
  );
}

/* ── Typing indicator ── */

export function TypingBubble({ rol }: { rol: Rol }) {
  const saliente = rol !== "cliente";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className={`flex ${saliente ? "justify-end" : "justify-start"}`}
    >
      <div className={`bubble ${saliente ? "bubble-out" : "bubble-in"} flex items-center gap-1.5 py-2.5`}>
        {saliente && <IconBot size={12} style={{ opacity: 0.7 }} />}
        <span className="typing-dots">
          <span />
          <span />
          <span />
        </span>
      </div>
    </motion.div>
  );
}

/* ── Composer ── */

export function Composer({
  ticket,
  onEnviar,
  // Estaba declarado en el tipo pero NUNCA se desestructuraba: quien llamaba lo
  // pasaba, el componente lo ignoraba, y por eso no había forma de tomar el
  // chat desde aquí. Ese era el bug de raíz, no una falta de diseño.
  onTomar,
}: {
  ticket: Ticket;
  onEnviar: (texto: string) => void;
  onTomar?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  // El bot atendiendo NO bloquea el teclado. Antes esta pantalla solo decía «el
  // bot está atendiendo» y para escribir había que abrir la Ficha y mover un
  // interruptor enterrado: tres toques y una pantalla de por medio para
  // contestarle a un cliente que está esperando. Ahora se escribe siempre y el
  // traspaso ocurre al enviar, que es cuando de verdad hace falta.
  const atiendeBot = ticket.atiende === "bot";

  useEffect(() => {
    if (!atiendeBot) ref.current?.focus();
  }, [atiendeBot]);

  function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    // Primero el traspaso, después el mensaje: si se manda antes, el bot puede
    // contestar encima en ese hueco.
    if (atiendeBot) onTomar?.();
    onEnviar(limpio);
    setTexto("");
    ref.current?.focus(); // el teclado no se cierra entre mensajes (WhatsApp)
  }

  if (ticket.estado === "cerrado") {
    return (
      <div className="px-4 py-3 text-center text-xs text-muted">
        Ticket cerrado — reábrelo para volver a escribir
      </div>
    );
  }

  return (
    <div className="px-3 py-2.5">
      {atiendeBot && (
        <p className="mb-1.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-faint">
          <span className="pulse-dot" /> Contesta el bot — al enviar, el chat pasa a ustedes
        </p>
      )}
      <div className="flex items-center gap-2">
      <input
        ref={ref}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "Return") && !e.nativeEvent.isComposing) enviar();
        }}
        enterKeyHint="send"
        placeholder={atiendeBot ? "Escribe para tomar el chat…" : "Escribe como vendedor…"}
        // 16px en el teléfono: por debajo de eso iOS hace zoom al enfocar y la
        // pantalla queda corrida. En escritorio vuelve al tamaño del sistema.
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
  );
}

/* ── Modal de cotización (el "PDF" en Parte 1) ── */

export function CotizacionModal({ ticket }: { ticket: Ticket }) {
  const cot = ticket.cotizacion;
  if (!cot) return null;
  return (
    // El documento es papel literal: no cambia con el tema del hub (como un PDF real)
    <div className="overflow-hidden rounded-3xl" style={{ background: "#f5f4ee", color: "#262624" }}>
      <div className="flex items-center justify-between px-6 py-5 text-white" style={{ background: "#262624" }}>
        <div>
          <p className="serif text-lg tracking-tight">
            Depot<span className="text-red">Tire</span>
          </p>
          <p className="text-[10.5px] tracking-[.14em] uppercase" style={{ color: "rgba(255,255,255,.55)" }}>
            30+ años rodando contigo
          </p>
        </div>
        <div className="text-right">
          <p className="microlabel" style={{ color: "rgba(255,255,255,.5)" }}>Cotización</p>
          <p className="tnum text-xl font-extrabold text-red">#{cot.numero}</p>
        </div>
      </div>
      <div className="px-6 py-5">
        <div className="mb-4 flex justify-between text-[12.5px]">
          <div>
            <p className="font-bold">{ticket.nombre ?? ticket.telefono}</p>
            <p className="opacity-60">{ticket.vehiculo ?? "—"}</p>
          </div>
          <div className="text-right opacity-60">
            <p>{new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p>{ticket.offerExpiresAt ? `Oferta hasta ${new Date(ticket.offerExpiresAt).toLocaleString("es-EC")}` : "Vigencia por confirmar"}</p>
          </div>
        </div>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] tracking-wider uppercase opacity-50">
              <th className="pb-2">Producto</th>
              <th className="pb-2 text-center">Cant.</th>
              <th className="pb-2 text-right">P. unit</th>
              <th className="pb-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {cot.items.map((item, i) => (
              <tr key={i} style={{ borderTop: "1px solid rgba(10,16,32,.1)" }}>
                <td className="py-2.5 font-semibold">{item.descripcion}</td>
                <td className="tnum py-2.5 text-center">{item.cantidad}</td>
                <td className="tnum py-2.5 text-right">{money(item.precioUnit)}</td>
                <td className="tnum py-2.5 text-right font-bold">{money(item.cantidad * item.precioUnit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 ml-auto w-52 text-[13px]" style={{ borderTop: "2px solid #0a1020" }}>
          <div className="flex justify-between pt-2 opacity-70">
            <span>Subtotal</span>
            <span className="tnum">{money(cot.subtotal)}</span>
          </div>
          <div className="flex justify-between pt-1 opacity-70">
            <span>IVA 15%</span>
            <span className="tnum">{money(cot.iva)}</span>
          </div>
          {cot.discountAmount && <div className="flex justify-between pt-1 font-bold text-green-700"><span>Descuento autorizado</span><span className="tnum">−{money(cot.discountAmount)}</span></div>}
          <div className="serif flex justify-between pt-2 text-lg">
            <span>Total</span>
            <span className="tnum text-red">{money(cot.total)}</span>
          </div>
        </div>
        <p className="mt-4 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed opacity-70" style={{ background: "rgba(10,16,32,.05)" }}>
          Incluye instalación, balanceo y válvulas nuevas. Precios con IVA. · Depot Tire · +593 98 280 1766 ·
          Lun–Sáb 8:30–17:30
        </p>
      </div>
    </div>
  );
}

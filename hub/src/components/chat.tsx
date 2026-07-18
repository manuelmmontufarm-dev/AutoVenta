import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Mensaje, Rol, Ticket } from "../data/types";
import { horaCorta, money } from "../lib/format";
import { IconBot, IconDoc, IconDoubleCheck, IconPin, IconSend, IconUser } from "./icons";

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
        {msg.tipo === "pdf" ? (
          <PdfCard titulo={msg.contenido} onVer={onVerPdf} />
        ) : msg.tipo === "ubicacion" ? (
          <MapCard etiqueta={msg.contenido} />
        ) : (
          <p className="m-0 whitespace-pre-wrap">{msg.contenido}</p>
        )}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px]" style={{ color: "var(--color-bubble-meta)" }}>
          {horaCorta(msg.hora)}
          {saliente && <IconDoubleCheck size={13} style={{ color: "var(--color-check)" }} />}
        </span>
      </div>
    </motion.div>
  );
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
  onTomar,
}: {
  ticket: Ticket;
  onEnviar: (texto: string) => void;
  onTomar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const puedeEscribir = ticket.atiende === "humano" && ticket.estado === "abierto";
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (puedeEscribir) ref.current?.focus();
  }, [puedeEscribir]);

  function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    onEnviar(limpio);
    setTexto("");
  }

  if (ticket.estado === "cerrado") {
    return (
      <div className="px-4 py-3 text-center text-xs text-muted">
        Ticket cerrado — reábrelo para volver a escribir
      </div>
    );
  }

  if (!puedeEscribir) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="pulse-dot" /> El bot está atendiendo esta conversación
        </p>
        <button
          onClick={onTomar}
          className="rounded-full px-3.5 py-1.5 text-xs font-bold transition-transform hover:-translate-y-px"
          style={{ background: "var(--color-lime)", color: "#1c1c1a" }}
        >
          Tomar conversación
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <input
        ref={ref}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "Return") && !e.nativeEvent.isComposing) enviar();
        }}
        placeholder="Escribe como vendedor…"
        className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-[13.5px] outline-none placeholder:text-faint"
        style={{ background: "color-mix(in srgb, var(--color-paper) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--color-paper) 9%, transparent)" }}
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
            <p>Válida por 5 días</p>
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

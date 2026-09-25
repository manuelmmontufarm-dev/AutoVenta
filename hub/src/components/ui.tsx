import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { CIERRE_META, ETAPA_META, type Cierre, type Etapa, type Ticket } from "../data/types";
import { iniciales } from "../lib/format";
import { IconBandera, IconClock, IconInbox, IconRefresh, IconX } from "./icons";

/* ── Avatar ──
   Iniciales en un cuadrado de papel. Sin arcoíris: en Taller el color es para
   lo que exige actuar, no para distinguir personas. */

export function Avatar({ ticket, size = 28 }: { ticket: Ticket; size?: number }) {
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-[4px] font-semibold text-text2"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.39)), background: "#ece9e3" }}
      aria-hidden
    >
      {iniciales(ticket.nombre, ticket.telefono)}
      {ticket.esRecurrente && (
        <span
          title="Cliente recurrente"
          className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-text text-white"
          style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46) }}
        >
          <IconRefresh size={Math.max(8, Math.round(size * 0.28))} strokeWidth={2.2} />
        </span>
      )}
    </div>
  );
}

/* ── Etapa y cierre: texto, no cápsula ──
   La etapa se distingue por su nombre y su peso. El color se reserva para el
   cierre, que sí es un resultado. */

export function StageBadge({ etapa, compact = false }: { etapa: Etapa; compact?: boolean }) {
  const meta = ETAPA_META[etapa];
  return (
    <span className="text-[13px] whitespace-nowrap text-text2">
      {compact ? meta.corto : meta.nombre}
    </span>
  );
}

/**
 * El icono de un cierre. Vive aquí y no en CIERRE_META porque `data/types.ts`
 * es un `.ts` sin JSX: el dato guarda el nombre, la forma la pone el sistema
 * de iconos.
 */
export function CierreIcon({ cierre, size = 14 }: { cierre: Cierre; size?: number }) {
  if (cierre === "ganado") return <IconBandera size={size} />;
  if (cierre === "perdido") return <IconX size={size} />;
  return <IconClock size={size} />;
}

const CIERRE_COLOR: Record<Cierre, string> = {
  ganado: "var(--color-ok)",
  perdido: "var(--color-signal)",
  sin_respuesta: "var(--color-text2)",
};

export function CierreBadge({ cierre }: { cierre: Cierre }) {
  const meta = CIERRE_META[cierre];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap" style={{ color: CIERRE_COLOR[cierre] }}>
      <CierreIcon cierre={cierre} size={13} />
      {meta.nombre}
    </span>
  );
}

/** Quién contesta. Texto llano: «Bot» apagado, «Asesor» con peso. */
export function AtiendePill({ atiende }: { atiende: "bot" | "humano" }) {
  const esBot = atiende === "bot";
  return (
    <span className={`text-[13px] whitespace-nowrap ${esBot ? "text-text2" : "font-medium text-text"}`}>
      {esBot ? "Bot" : "Asesor"}
    </span>
  );
}

/* ── La placa de medida ──
   El único gesto propio del producto: `245/40 R18` en la mono, con el rin en
   peso mayor y una línea de pelo debajo. Igual en la lista, la ficha, la
   cotización y la imagen que sale por WhatsApp. */

export function MedidaChip({ medida, size = "md" }: { medida: string; size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? 20 : size === "sm" ? 12 : 13;
  const partes = medida.trim().split(/\s+/);
  const rin = partes.length > 1 ? partes.pop() : null;
  return (
    <span className="medida-chip" style={{ fontSize: px }}>
      {partes.join(" ")}
      {rin && <> <b>{rin}</b></>}
    </span>
  );
}

/* ── Control segmentado ──
   Papel de fondo, la opción activa en blanco con la señal. */

export function Segmented<T extends string>({
  opciones,
  valor,
  onChange,
  id,
}: {
  /** `tono: "neutral"` para contadores que no son alertas (11 cotizados no son 11 alarmas). */
  opciones: { valor: T; label: string; badge?: number; tono?: "alerta" | "neutral" }[];
  valor: T;
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="inline-flex rounded-[6px] border border-line bg-bg p-0.5" role="tablist" aria-label={id}>
      {opciones.map((op) => {
        const activo = op.valor === valor;
        return (
          <button
            key={op.valor}
            role="tab"
            aria-selected={activo}
            onClick={() => onChange(op.valor)}
            className={`flex h-[30px] items-center gap-1.5 rounded-[4px] px-3.5 text-[13px] transition-colors ${
              activo ? "bg-surface font-semibold text-signal shadow-[0_1px_2px_rgba(28,27,25,.08)]" : "font-medium text-text2 hover:text-text"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {op.label}
              {op.badge !== undefined && op.badge > 0 && (
                <span
                  className={`tnum font-mono text-[11px] ${op.tono === "alerta" ? "font-bold text-signal" : "font-medium text-text2"}`}
                >
                  {op.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Estado vacío ──
   Afirma algo verdadero y ofrece una salida. Sin ilustración grande. */

export function EmptyState({ titulo, detalle, accion }: { titulo: string; detalle?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <IconInbox size={22} className="mb-1 text-text3" />
      <p className="text-[15px] font-semibold text-text">{titulo}</p>
      {detalle && <p className="max-w-[38ch] text-[13px] leading-relaxed text-text2">{detalle}</p>}
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}

/* ── Esqueletos: la forma de la fila que va a llegar ── */

export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="grid h-14 items-center gap-5 border-b border-line px-5" style={{ gridTemplateColumns: "minmax(200px,1.4fr) 130px minmax(0,1fr) 88px 130px", opacity: 1 - i * 0.1 }}>
          <div className="skeleton h-3.5 w-3/5" />
          <div className="skeleton h-3.5 w-20" />
          <div className="skeleton h-3 w-4/5" />
          <div className="skeleton ml-auto h-3 w-10" />
          <div className="skeleton h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

/* ── Modal ──
   Scrim de tinta, caja blanca, entra con peso y sale rápido. */

export function Modal({ onClose, children, ancho = 420 }: { onClose: () => void; children: ReactNode; ancho?: number }) {
  return (
    <motion.div
      className="fixed inset-0 z-100 grid place-items-center p-4"
      style={{ background: "var(--color-scrim)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        className="max-h-[86vh] w-full overflow-y-auto rounded-[10px] border border-line bg-surface shadow-pop"
        style={{ maxWidth: ancho }}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 4, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ── Piezas del armazón que comparten las pantallas ── */

/** Cabecera de pantalla: título, una frase, y acciones a la derecha. */
export function PageHeader({ titulo, sub, children }: { titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-5 pt-5 pb-4 md:px-8 md:pt-[30px] md:pb-[22px]">
      <div className="flex min-w-0 items-baseline gap-3.5">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] md:text-[22px]">{titulo}</h1>
        {sub && <span className="hidden text-[13px] text-text2 sm:inline">{sub}</span>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

/** Panel blanco con línea de pelo: el contenedor de casi todo. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[10px] border border-line bg-surface ${className}`}>{children}</div>;
}

/** Título de bloque dentro de un panel: dos o tres palabras, 13 px, peso 600. */
export function BlockTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] font-semibold">{children}</span>
      {aside && <span className="text-[12px] text-text2">{aside}</span>}
    </div>
  );
}

/** Fila etiqueta / valor a dos columnas, como en una ficha impresa. */
export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <span className="text-[13px] text-text2">{etiqueta}</span>
      <span className="min-w-0 text-[13px]">{children}</span>
    </>
  );
}

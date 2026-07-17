import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { CIERRE_META, ETAPA_META, type Cierre, type Etapa, type Ticket } from "../data/types";
import { avatarColor, iniciales } from "../lib/format";
import { IconBot, IconTire, IconUser } from "./icons";

/* ── Avatar ── */

export function Avatar({ ticket, size = 40 }: { ticket: Ticket; size?: number }) {
  const color = avatarColor(ticket.telefono);
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {iniciales(ticket.nombre, ticket.telefono)}
      {ticket.esRecurrente && (
        <span
          title="Cliente recurrente"
          className="absolute -right-0.5 -bottom-0.5 grid place-items-center rounded-full bg-ink text-[9px]"
          style={{ width: size * 0.42, height: size * 0.42, border: "1px solid rgba(255,255,255,.15)" }}
        >
          ★
        </span>
      )}
    </div>
  );
}

/* ── Badges ── */

export function StageBadge({ etapa, compact = false }: { etapa: Etapa; compact?: boolean }) {
  const meta = ETAPA_META[etapa];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {compact ? meta.corto : meta.nombre}
    </span>
  );
}

export function CierreBadge({ cierre }: { cierre: Cierre }) {
  const meta = CIERRE_META[cierre];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
      }}
    >
      {meta.emoji} {meta.nombre}
    </span>
  );
}

export function AtiendePill({ atiende }: { atiende: "bot" | "humano" }) {
  const esBot = atiende === "bot";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
      style={{
        color: esBot ? "#86c79a" : "#cdb989",
        background: esBot ? "rgba(134,199,154,.1)" : "rgba(205,185,137,.1)",
        border: `1px solid ${esBot ? "rgba(134,199,154,.28)" : "rgba(205,185,137,.28)"}`,
      }}
    >
      {esBot ? <IconBot size={11} /> : <IconUser size={11} />}
      {esBot ? "Bot" : "Humano"}
    </span>
  );
}

export function MedidaChip({ medida, size = "md" }: { medida: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "text-lg px-3 py-1.5" : size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`medida-chip inline-block rounded-lg text-paper ${s}`}
      style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)" }}
    >
      {medida}
    </span>
  );
}

/* ── Segmented control (estilo iOS) ── */

export function Segmented<T extends string>({
  opciones,
  valor,
  onChange,
  id,
}: {
  opciones: { valor: T; label: string; badge?: number }[];
  valor: T;
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="glass inline-flex items-center gap-0.5 rounded-xl p-1">
      {opciones.map((op) => {
        const activo = op.valor === valor;
        return (
          <button
            key={op.valor}
            onClick={() => onChange(op.valor)}
            className="relative rounded-lg px-3 py-1.5 text-xs font-bold text-muted transition-colors data-[activo=true]:text-paper"
            data-activo={activo}
          >
            {activo && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg"
                style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.1)" }}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10">
              {op.label}
              {op.badge !== undefined && op.badge > 0 && (
                <span className="tnum ml-1.5 rounded-full bg-red px-1.5 py-px text-[10px] text-white">{op.badge}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Empty state ── */

export function EmptyState({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-3 py-16 text-center"
    >
      <div className="grid h-16 w-16 place-items-center rounded-2xl text-muted" style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
        <IconTire size={34} />
      </div>
      <p className="text-sm font-semibold text-paper">{titulo}</p>
      {detalle && <p className="max-w-60 text-xs leading-relaxed text-muted">{detalle}</p>}
    </motion.div>
  );
}

/* ── Skeleton rows ── */

export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl p-3" style={{ opacity: 1 - i * 0.13 }}>
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="skeleton h-3 w-2/5" />
            <div className="skeleton h-2.5 w-3/5" />
          </div>
          <div className="skeleton h-4 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ── Modal genérico ── */

export function Modal({ onClose, children, ancho = 460 }: { onClose: () => void; children: ReactNode; ancho?: number }) {
  return (
    <motion.div
      className="fixed inset-0 z-100 grid place-items-center p-4"
      style={{ background: "rgba(5,8,16,.6)", backdropFilter: "blur(6px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="glass-strong max-h-[86vh] w-full overflow-y-auto rounded-3xl shadow-pop"
        style={{ maxWidth: ancho }}
        initial={{ scale: 0.92, y: 18, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

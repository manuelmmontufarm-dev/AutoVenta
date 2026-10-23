import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { IconX } from "./icons";
import { navigate } from "../router";
import { useHub, type Toast } from "../store";

/* ── Toasts (notificaciones) ── */

function ToastCard({ toast }: { toast: Toast }) {
  const quitar = useHub((s) => s.quitarToast);

  useEffect(() => {
    const t = setTimeout(() => quitar(toast.id), 5200);
    return () => clearTimeout(t);
  }, [toast.id, quitar]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 90, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="border border-line bg-surface shadow-pop pointer-events-auto flex w-80 items-start gap-3 rounded-[8px] p-3.5 text-left"
    >
      {/* La tarjeta entera abre el ticket; la X solo la cierra (Manuel, 23-oct:
          «que tengan un botón de x»). Dos botones hermanos, no uno anidado. */}
      <button
        type="button"
        onClick={() => {
          if (toast.ticketId) navigate(`ticket/${toast.ticketId}`);
          quitar(toast.id);
        }}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] text-[15px]" style={{ background: "color-mix(in srgb, var(--color-text) 7%, transparent)" }}>
          {toast.icono}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-text">{toast.titulo}</span>
          {toast.cuerpo && <span className="mt-0.5 block truncate text-[13px] text-text2">{toast.cuerpo}</span>}
        </span>
      </button>
      <button
        type="button"
        aria-label="Cerrar notificación"
        onClick={() => quitar(toast.id)}
        className="-mt-1 -mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-text2 hover:bg-bg hover:text-text"
      >
        <IconX className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useHub((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-150 flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ── Confetti (cierre ganado) ── */

const COLORES = (getComputedStyle(document.documentElement).getPropertyValue("--confetti") ||
  "#b4453a,#2f6f4f,#a8731f,#1c1b19,#4a5f80,#8b8780")
  .split(",")
  .map((c) => c.trim());

export function Confetti() {
  const activo = useHub((s) => s.celebrando);
  const piezas = useMemo(
    () =>
      Array.from({ length: 54 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: COLORES[i % COLORES.length],
        dur: 2 + Math.random() * 1.4,
        delay: Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 220,
        spin: 360 + Math.random() * 540,
      })),
    // regenerar posiciones en cada celebración
    [activo],
  );

  if (!activo) return null;
  return (
    <div aria-hidden>
      {piezas.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              left: `${p.left}vw`,
              background: p.color,
              "--dur": `${p.dur}s`,
              "--delay": `${p.delay}s`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

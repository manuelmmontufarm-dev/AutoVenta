import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";
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
    <motion.button
      layout
      initial={{ opacity: 0, x: 90, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onClick={() => {
        if (toast.ticketId) navigate(`ticket/${toast.ticketId}`);
        quitar(toast.id);
      }}
      className="glass-strong pointer-events-auto flex w-80 items-start gap-3 rounded-2xl p-3.5 text-left shadow-pop"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg" style={{ background: "rgba(255,255,255,.07)" }}>
        {toast.icono}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-paper">{toast.titulo}</span>
        {toast.cuerpo && <span className="mt-0.5 block truncate text-xs text-muted">{toast.cuerpo}</span>}
      </span>
    </motion.button>
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

const COLORES = ["#a78bfa", "#7dd3e0", "#e0b3ee", "#8fa885", "#f5f4ee", "#cdb989"];

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

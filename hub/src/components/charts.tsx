import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/* ── Count-up (números que suben al entrar) ── */

export function useCountUp(target: number, durMs = 900): number {
  const [valor, setValor] = useState(0);
  const desde = useRef(0);
  useEffect(() => {
    const inicio = performance.now();
    const origen = desde.current;
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min(1, (t - inicio) / durMs);
      const ease = 1 - Math.pow(1 - p, 3);
      setValor(origen + (target - origen) * ease);
      if (p < 1) raf = requestAnimationFrame(tick);
      else desde.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durMs]);
  return valor;
}

export function StatTile({
  label,
  valor,
  formato = (n) => String(Math.round(n)),
  detalle,
  color = "var(--color-paper)",
  delay = 0,
}: {
  label: string;
  valor: number;
  formato?: (n: number) => string;
  detalle?: string;
  color?: string;
  delay?: number;
}) {
  const animado = useCountUp(valor);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30, delay }}
      className="glass rounded-3xl p-5"
    >
      <p className="microlabel">{label}</p>
      <p className="serif tnum mt-2 text-[34px] leading-none" style={{ color }}>
        {formato(animado)}
      </p>
      {detalle && <p className="mt-2 text-[11.5px] text-muted">{detalle}</p>}
    </motion.div>
  );
}

/* ── Embudo horizontal ── */

export interface FunnelPaso {
  label: string;
  valor: number;
  color: string;
}

export function FunnelChart({ pasos }: { pasos: FunnelPaso[] }) {
  const max = Math.max(1, ...pasos.map((p) => p.valor));
  return (
    <div className="flex flex-col gap-2.5">
      {pasos.map((p, i) => {
        const prev = i > 0 ? pasos[i - 1].valor : null;
        const conv = prev ? Math.round((p.valor / Math.max(1, prev)) * 100) : null;
        return (
          <div key={p.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-right text-[11.5px] font-semibold text-muted">{p.label}</span>
            <div className="relative h-7 flex-1 overflow-hidden rounded-lg" style={{ background: "color-mix(in srgb, var(--color-paper) 4%, transparent)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(p.valor / max) * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 26, delay: i * 0.07 }}
                className="flex h-full min-w-9 items-center rounded-lg pl-2.5"
                style={{
                  background: `linear-gradient(90deg, color-mix(in srgb, ${p.color} 30%, transparent), color-mix(in srgb, ${p.color} 55%, transparent))`,
                  border: `1px solid color-mix(in srgb, ${p.color} 40%, transparent)`,
                }}
              >
                <span className="tnum text-xs font-bold" style={{ color: p.color }}>
                  {p.valor}
                </span>
              </motion.div>
            </div>
            <span className="tnum w-11 shrink-0 text-[10.5px] font-semibold text-faint">
              {conv !== null ? `${conv}%` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Área de conversaciones (14 días) ── */

export function AreaChart({ serie, color = "var(--color-violet)" }: { serie: number[]; color?: string }) {
  const W = 560;
  const H = 130;
  const PAD = 8;
  const max = Math.max(...serie) * 1.15;
  const px = (i: number) => PAD + (i / (serie.length - 1)) * (W - PAD * 2);
  const py = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  // Curva suave (Catmull-Rom → Bézier)
  let d = `M ${px(0)} ${py(serie[0])}`;
  for (let i = 0; i < serie.length - 1; i++) {
    const p0 = serie[Math.max(0, i - 1)];
    const p1 = serie[i];
    const p2 = serie[i + 1];
    const p3 = serie[Math.min(serie.length - 1, i + 2)];
    const c1x = px(i) + (px(i + 1) - px(Math.max(0, i - 1))) / 6;
    const c1y = py(p1) + (py(p2) - py(p0)) / 6;
    const c2x = px(i + 1) - (px(Math.min(serie.length - 1, i + 2)) - px(i)) / 6;
    const c2y = py(p2) - (py(p3) - py(p1)) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${px(i + 1)} ${py(p2)}`;
  }

  const ultimo = serie.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="color-mix(in srgb, var(--color-paper) 5%, transparent)" strokeDasharray="3 5" />
      ))}
      <motion.path
        d={`${d} L ${px(ultimo)} ${H - PAD} L ${px(0)} ${H - PAD} Z`}
        fill="url(#area-fill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.3 }}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
      <motion.circle
        cx={px(ultimo)}
        cy={py(serie[ultimo])}
        r="4.5"
        fill={color}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 400, damping: 18 }}
      />
      <circle cx={px(ultimo)} cy={py(serie[ultimo])} r="9" fill={color} opacity="0.2">
        <animate attributeName="r" values="7;12;7" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

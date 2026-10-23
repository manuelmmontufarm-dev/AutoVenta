import { useId, useState } from "react";

/**
 * Gráficos que se leen solos (DESIGN.md §16): eje Y con valores, eje X con
 * rótulos, la unidad arriba, y el valor exacto al pasar el cursor por un
 * punto. Sin gradientes, sin animación de entrada, sin cifras que suben solas.
 */

export interface Punto {
  x: string;
  y: number;
}

/** Cuántas cifras hacen falta para que el eje Y termine en un número redondo. */
function escala(max: number, pasos: number): number {
  if (max <= 0) return 1;
  const bruto = max / pasos;
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
  const candidato = [1, 2, 2.5, 5, 10].find((k) => k * potencia >= bruto) ?? 10;
  return candidato * potencia;
}

const MONO = "var(--font-mono)";

function Ejes({ L, T, iw, ih, pasos, paso, unidad, fmt }: { L: number; T: number; iw: number; ih: number; pasos: number; paso: number; unidad: string; fmt: (v: number) => string }) {
  const yMax = paso * pasos;
  const y = (v: number) => T + ih - (v / yMax) * ih;
  return (
    <>
      {Array.from({ length: pasos + 1 }, (_, k) => {
        const v = paso * k;
        const yy = y(v);
        return (
          <g key={k}>
            <line x1={L} x2={L + iw} y1={yy} y2={yy} stroke={k === 0 ? "rgba(28,27,25,.35)" : "rgba(28,27,25,.10)"} strokeWidth={1} />
            <text x={L - 8} y={yy + 4} textAnchor="end" fontFamily={MONO} fontSize={11} fill="var(--color-text2)">{fmt(v)}</text>
          </g>
        );
      })}
      <text x={L} y={12} fontFamily={MONO} fontSize={11} fill="var(--color-text2)">{unidad}</text>
    </>
  );
}

function Tooltip({ x, y, texto, L, iw }: { x: number; y: number; texto: string; L: number; iw: number }) {
  const bw = texto.length * 7 + 20;
  const bx = Math.min(Math.max(x - bw / 2, L), L + iw - bw);
  const by = Math.max(y - 40, 2);
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={by + 26} y2={y} stroke="var(--color-text)" strokeWidth={1} />
      <rect x={bx} y={by} width={bw} height={26} rx={4} fill="var(--color-text)" />
      <text x={bx + bw / 2} y={by + 17} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={700} fill="#ffffff">{texto}</text>
    </g>
  );
}

interface BaseProps {
  data: Punto[];
  /** Lo que se cuenta: «conversaciones», «respuestas», «USD». */
  unidad: string;
  fmt?: (v: number) => string;
  ancho?: number;
  alto?: number;
  /** Cada cuántos rótulos del eje X se escribe uno (1 = todos). Por defecto se calcula. */
  cadaX?: number;
  etiqueta?: string;
}

function useGeometria({ data, ancho = 560, alto = 220 }: { data: Punto[]; ancho?: number; alto?: number }) {
  const L = 48, R = 16, T = 22, B = 34;
  const iw = ancho - L - R, ih = alto - T - B;
  const max = Math.max(0, ...data.map((d) => d.y));
  const pasos = 4;
  const paso = escala(max, pasos);
  const yMax = paso * pasos;
  const y = (v: number) => T + ih - (v / yMax) * ih;
  const n = Math.max(1, data.length);
  const slot = iw / n;
  const x = (i: number) => L + slot * i + slot / 2;
  return { L, R, T, B, iw, ih, pasos, paso, y, x, slot, n };
}

export function BarChart({ data, unidad, fmt = (v) => String(v), ancho = 560, alto = 220, cadaX, etiqueta }: BaseProps) {
  const g = useGeometria({ data, ancho, alto });
  const [tip, setTip] = useState<number | null>(null);
  const id = useId();
  if (data.length === 0) return <Vacio alto={alto} />;
  const cada = cadaX ?? (g.n > 8 ? 2 : 1);
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" style={{ overflow: "visible" }} role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setTip(null)}>
      <title id={`${id}-t`}>{etiqueta ?? `${unidad} por ${data.map((d) => d.x).join(", ")}`}</title>
      <Ejes L={g.L} T={g.T} iw={g.iw} ih={g.ih} pasos={g.pasos} paso={g.paso} unidad={unidad} fmt={fmt} />
      {data.map((d, i) => (
        <g key={i} onMouseEnter={() => setTip(i)} onTouchStart={() => setTip(i)}>
          {/* Zona de toque de todo el alto del carril: el dedo no tiene que acertar la barra */}
          <rect x={g.x(i) - g.slot / 2} y={g.T} width={g.slot} height={g.ih} fill="transparent" />
          <rect x={g.x(i) - g.slot * 0.3} y={g.y(d.y)} width={g.slot * 0.6} height={Math.max(0, g.T + g.ih - g.y(d.y))} fill={tip === i ? "var(--color-text)" : "rgba(28,27,25,.72)"} />
          {(i % cada === 0 || i === g.n - 1) && (
            <text x={g.x(i)} y={g.T + g.ih + 18} textAnchor="middle" fontFamily={MONO} fontSize={11} fill="var(--color-text2)">{d.x}</text>
          )}
        </g>
      ))}
      {tip !== null && <Tooltip x={g.x(tip)} y={g.y(data[tip].y)} texto={`${fmt(data[tip].y)} ${unidad} · ${data[tip].x}`} L={g.L} iw={g.iw} />}
    </svg>
  );
}

export function LineChart({ data, unidad, fmt = (v) => String(v), ancho = 560, alto = 220, cadaX, etiqueta }: BaseProps) {
  const g = useGeometria({ data, ancho, alto });
  const [tip, setTip] = useState<number | null>(null);
  const id = useId();
  if (data.length === 0) return <Vacio alto={alto} />;
  const cada = cadaX ?? (g.n > 8 ? 2 : 1);
  const puntos = data.map((d, i) => `${g.x(i)},${g.y(d.y)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" style={{ overflow: "visible" }} role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setTip(null)}>
      <title id={`${id}-t`}>{etiqueta ?? `${unidad} por ${data.map((d) => d.x).join(", ")}`}</title>
      <Ejes L={g.L} T={g.T} iw={g.iw} ih={g.ih} pasos={g.pasos} paso={g.paso} unidad={unidad} fmt={fmt} />
      <polyline points={puntos} fill="none" stroke="var(--color-text)" strokeWidth={1.5} />
      {data.map((d, i) => (
        <g key={i} onMouseEnter={() => setTip(i)} onTouchStart={() => setTip(i)}>
          <rect x={g.x(i) - g.slot / 2} y={g.T} width={g.slot} height={g.ih} fill="transparent" />
          <circle cx={g.x(i)} cy={g.y(d.y)} r={tip === i ? 4 : 2.5} fill={tip === i ? "var(--color-text)" : "#ffffff"} stroke="var(--color-text)" strokeWidth={1.5} />
          {(i % cada === 0 || i === g.n - 1) && (
            <text x={g.x(i)} y={g.T + g.ih + 18} textAnchor="middle" fontFamily={MONO} fontSize={11} fill="var(--color-text2)">{d.x}</text>
          )}
        </g>
      ))}
      {tip !== null && <Tooltip x={g.x(tip)} y={g.y(data[tip].y)} texto={`${fmt(data[tip].y)} ${unidad} · ${data[tip].x}`} L={g.L} iw={g.iw} />}
    </svg>
  );
}

function Vacio({ alto }: { alto: number }) {
  return (
    <div className="grid place-items-center text-[13px] text-text2" style={{ height: alto / 2 }}>
      Sin datos todavía
    </div>
  );
}

/* ── Embudo: una fila por etapa, la barra en tinta, el valor y la conversión ── */

export interface FunnelPaso {
  label: string;
  valor: number;
}

export function FunnelChart({ pasos }: { pasos: FunnelPaso[] }) {
  const max = Math.max(1, ...pasos.map((p) => p.valor));
  return (
    <div className="flex flex-col gap-2.5" role="img" aria-label="Embudo por etapa">
      {pasos.map((p, i) => {
        const prev = i > 0 ? pasos[i - 1].valor : null;
        const conv = prev ? Math.round((p.valor / Math.max(1, prev)) * 100) : null;
        return (
          <div key={p.label} className="grid grid-cols-[112px_minmax(0,1fr)_40px_44px] items-center gap-3 text-[13px]">
            <span className="truncate text-text2">{p.label}</span>
            <div className="h-5 overflow-hidden rounded-[3px] bg-black/[.06]">
              <div className="h-full rounded-[3px]" style={{ width: `${Math.max(p.valor > 0 ? 2 : 0, (p.valor / max) * 100)}%`, background: "rgba(28,27,25,.72)" }} />
            </div>
            <span className="tnum text-right font-mono">{p.valor}</span>
            <span className="tnum text-right font-mono text-[11px] text-text2">{conv !== null ? `${conv} %` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Barras de parte: el total en gris cálido, la parte del bot en rojo de señal ──
   Para «cuántas de las facturas de la tienda son del bot»: la parte vive
   DENTRO del total, así que se dibuja encima de él y no al lado. Opcional: una
   cifra sobre cada barra (las ventas sobre la barra de chats) y una raya verde
   bajo el eje para marcar una condición (semana con anuncios; «no» se escribe,
   sin dato no lleva marca). Colores de la maqueta aprobada del 23-oct. */

const GRIS_TIENDA = "#d9d6cf";
const GRIS_TIENDA_TIP = "#c6c1b7";

export interface PuntoDeParte {
  x: string;
  total: number;
  parte?: number;
  /** Texto sobre la barra (p. ej. «10 v»). */
  encima?: string;
  marca?: "si" | "no" | "sin_dato";
  /** Lo que dice el cartel al pasar el cursor; por defecto «parte de total · x». */
  detalle?: string;
}

export function BarrasDeParte({
  data, unidad, fmt = (v) => String(v), ancho = 560, alto = 220, cadaX, etiqueta,
}: {
  data: PuntoDeParte[];
  unidad: string;
  fmt?: (v: number) => string;
  ancho?: number;
  alto?: number;
  cadaX?: number;
  etiqueta?: string;
}) {
  const [tip, setTip] = useState<number | null>(null);
  const id = useId();
  if (data.length === 0) return <Vacio alto={alto} />;
  const conMarcas = data.some((d) => d.marca === "si" || d.marca === "no");
  const conEncima = data.some((d) => d.encima);
  const L = 48, R = 16;
  const T = conEncima ? 34 : 22;
  const B = conMarcas ? 48 : 34;
  const iw = ancho - L - R, ih = alto - T - B;
  const pasos = 4;
  const paso = escala(Math.max(0, ...data.map((d) => d.total)), pasos);
  const y = (v: number) => T + ih - (v / (paso * pasos)) * ih;
  const n = data.length;
  const slot = iw / n;
  const x = (i: number) => L + slot * i + slot / 2;
  const cada = cadaX ?? (n > 8 ? 2 : 1);
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" style={{ overflow: "visible" }} role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setTip(null)}>
      <title id={`${id}-t`}>{etiqueta ?? `${unidad} por ${data.map((d) => d.x).join(", ")}`}</title>
      <Ejes L={L} T={T} iw={iw} ih={ih} pasos={pasos} paso={paso} unidad={unidad} fmt={fmt} />
      {data.map((d, i) => (
        <g key={i} onMouseEnter={() => setTip(i)} onTouchStart={() => setTip(i)}>
          <rect x={x(i) - slot / 2} y={T} width={slot} height={ih} fill="transparent" />
          <rect x={x(i) - slot * 0.31} y={y(d.total)} width={slot * 0.62} height={Math.max(0, T + ih - y(d.total))} rx={2} fill={tip === i ? GRIS_TIENDA_TIP : GRIS_TIENDA} />
          {(d.parte ?? 0) > 0 && (
            <rect x={x(i) - slot * 0.31} y={y(d.parte ?? 0)} width={slot * 0.62} height={Math.max(0, T + ih - y(d.parte ?? 0))} rx={2} fill={tip === i ? "var(--color-reddark)" : "var(--color-signal)"} />
          )}
          {d.encima && (
            <text x={x(i)} y={y(d.total) - 6} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={500} fill={d.encima === "0" ? "var(--color-text3)" : "var(--color-text)"}>{d.encima}</text>
          )}
          {(i % cada === 0 || i === n - 1) && (
            <text x={x(i)} y={T + ih + 18} textAnchor="middle" fontFamily={MONO} fontSize={11} fill="var(--color-text2)">{d.x}</text>
          )}
          {d.marca === "si" && <line x1={x(i) - slot / 2 + 3} x2={x(i) + slot / 2 - 3} y1={T + ih + 30} y2={T + ih + 30} stroke="var(--color-ok)" strokeWidth={3} />}
          {d.marca === "no" && <text x={x(i)} y={T + ih + 34} textAnchor="middle" fontFamily={MONO} fontSize={9} fill="var(--color-text3)">sin ads</text>}
        </g>
      ))}
      {tip !== null && (
        <Tooltip x={x(tip)} y={y(data[tip].total)} texto={data[tip].detalle ?? `${fmt(data[tip].parte ?? 0)} de ${fmt(data[tip].total)} ${unidad} · ${data[tip].x}`} L={L} iw={iw} />
      )}
    </svg>
  );
}

/* ── Barras pareadas: dos series lado a lado (bot en rojo, tienda en gris) ──
   Para comparar repartos de tamaños muy distintos (26 facturas del bot contra
   174 de la tienda): cada serie en % de su propio total, así se ve si el bot
   factura a otras horas que la tienda. */

export interface PuntoPareado {
  x: string;
  /** Primera serie (el bot). */
  a: number;
  /** Segunda serie (la tienda). */
  b: number;
  detalle?: string;
}

export function BarrasPareadas({
  data, unidad, fmt = (v) => String(v), ancho = 560, alto = 200, etiqueta,
}: {
  data: PuntoPareado[];
  unidad: string;
  fmt?: (v: number) => string;
  ancho?: number;
  alto?: number;
  etiqueta?: string;
}) {
  const [tip, setTip] = useState<number | null>(null);
  const id = useId();
  if (data.length === 0) return <Vacio alto={alto} />;
  const L = 48, R = 16, T = 22, B = 34;
  const iw = ancho - L - R, ih = alto - T - B;
  const pasos = 4;
  const paso = escala(Math.max(0, ...data.flatMap((d) => [d.a, d.b])), pasos);
  const y = (v: number) => T + ih - (v / (paso * pasos)) * ih;
  const slot = iw / data.length;
  const x = (i: number) => L + slot * i + slot / 2;
  const w = slot * 0.3;
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" style={{ overflow: "visible" }} role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setTip(null)}>
      <title id={`${id}-t`}>{etiqueta ?? `${unidad} por ${data.map((d) => d.x).join(", ")}`}</title>
      <Ejes L={L} T={T} iw={iw} ih={ih} pasos={pasos} paso={paso} unidad={unidad} fmt={fmt} />
      {data.map((d, i) => (
        <g key={i} onMouseEnter={() => setTip(i)} onTouchStart={() => setTip(i)}>
          <rect x={x(i) - slot / 2} y={T} width={slot} height={ih} fill="transparent" />
          <rect x={x(i) - w - 1} y={y(d.a)} width={w} height={Math.max(0, T + ih - y(d.a))} rx={2} fill={tip === i ? "var(--color-reddark)" : "var(--color-signal)"} />
          <rect x={x(i) + 1} y={y(d.b)} width={w} height={Math.max(0, T + ih - y(d.b))} rx={2} fill={tip === i ? GRIS_TIENDA_TIP : GRIS_TIENDA} />
          <text x={x(i)} y={T + ih + 18} textAnchor="middle" fontFamily={MONO} fontSize={11} fill="var(--color-text2)">{d.x}</text>
        </g>
      ))}
      {tip !== null && (
        <Tooltip x={x(tip)} y={y(Math.max(data[tip].a, data[tip].b))} texto={data[tip].detalle ?? `${fmt(data[tip].a)} · ${fmt(data[tip].b)} · ${data[tip].x}`} L={L} iw={iw} />
      )}
    </svg>
  );
}

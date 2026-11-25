/**
 * La cinta del tema (Navidad, Año Nuevo, personalizado…) en nodos de satori.
 * Va debajo del encabezado de la cotización y de las opciones, en las dos
 * plantillas. El diseño (textos y colores) lo decide `domain/temaDePieza.ts`;
 * acá solo se dibuja, a la escala de cada plantilla.
 */
import type { DisenoDeTema } from "../domain/temaDePieza.js";
import { el, stripEmoji, text, type SatoriNode } from "./depotDesign.js";

export interface MedidasDeLaCinta {
  /** 1 = la plantilla «día y noche» (728 px); la clásica (1440 px) va a ~2. */
  escala: number;
  /** Tipografías de la plantilla: la del título (gruesa) y la de la bajada. */
  fuenteTitulo: Record<string, unknown>;
  fuenteBajada: Record<string, unknown>;
  /** Margen de arriba y a los lados (la clásica va de borde a borde, sin esquinas). */
  marginTop?: number;
  bordeABorde?: boolean;
}

/** «#a3141c» + 0.35 → «rgba(163,20,28,0.35)». */
function conAlfa(hex: string, alfa: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

function adorno(d: DisenoDeTema, s: (n: number) => number): SatoriNode[] {
  if (d.adorno === "rayas") {
    return [
      el({ position: "absolute", top: 0, right: s(150), width: s(16), height: "100%", backgroundColor: conAlfa(d.acento, 0.16), transform: "skewX(-25deg)" }),
      el({ position: "absolute", top: 0, right: s(176), width: s(7), height: "100%", backgroundColor: conAlfa(d.texto, 0.18), transform: "skewX(-25deg)" }),
    ];
  }
  if (d.adorno === "puntos") {
    // Nieve / confeti: puntos fijos (la pieza tiene que salir igual dos veces).
    const puntos: Array<[number, number, number]> = [
      [58, 18, 5], [64, 66, 3], [70, 30, 4], [76, 76, 3], [81, 14, 5], [86, 50, 3], [91, 24, 4], [95, 70, 3],
      [61, 86, 2], [73, 6, 2], [84, 88, 2], [97, 40, 2],
    ];
    return puntos.map(([x, y, r]) => el({
      position: "absolute", left: `${x}%`, top: `${y}%`, width: s(r * 2), height: s(r * 2), borderRadius: 999,
      backgroundColor: conAlfa(r >= 4 ? d.acento : d.texto, r >= 4 ? 0.55 : 0.4),
    }));
  }
  return [];
}

export function cintaDeTema(d: DisenoDeTema | null, m: MedidasDeLaCinta): SatoriNode | null {
  if (!d) return null;
  const s = (n: number) => Math.round(n * m.escala * 10) / 10;
  const titulo = stripEmoji(d.titulo).toUpperCase();
  const bajada = stripEmoji(d.bajada);
  if (!titulo && !bajada) return null;
  return el({
    position: "relative", overflow: "hidden", alignItems: "center", gap: s(12),
    marginTop: m.marginTop ?? s(14),
    padding: m.bordeABorde ? `${s(14)}px ${s(32)}px` : `${s(12)}px ${s(16)}px ${s(12)}px ${s(14)}px`,
    borderRadius: m.bordeABorde ? 0 : s(12),
    backgroundColor: d.fondo,
    ...(m.bordeABorde ? {} : { border: `${Math.max(1, s(1))}px solid ${d.acento}` }),
  },
    ...adorno(d, s),
    el({ gap: s(3), flexShrink: 0 },
      el({ width: s(9), height: s(24), backgroundColor: d.acento, transform: "skewX(-22deg)" }),
      el({ width: s(4), height: s(24), backgroundColor: d.texto, transform: "skewX(-22deg)" }),
    ),
    el({ flexDirection: "column", gap: s(4), flexShrink: 1 },
      titulo ? text({ ...m.fuenteTitulo, fontSize: s(23), lineHeight: 1, letterSpacing: -0.3, color: d.texto }, titulo) : null,
      bajada ? text({ ...m.fuenteBajada, fontSize: s(12.5), lineHeight: 1.15, color: d.acento }, bajada) : null,
    ),
  );
}

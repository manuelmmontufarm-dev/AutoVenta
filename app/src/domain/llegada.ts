/**
 * CUÁNDO LLEGA LA GENTE: la curva que decide el color de Para cerrar
 * (Manuel, 26-oct: «que entienda las estadísticas… cuántas vienen antes,
 * cuántas después y cuántos días, con un buffer, y que se actualice sola»).
 *
 * Hay dos relojes y los dos se miden igual:
 *  · fecha    — desde el día que el cliente dijo que viene.
 *  · silencio — desde el último mensaje del cliente (para quien no dio día).
 *
 * Cada observación es un cliente: el día en que arranca su reloj y, si compró,
 * el día de la factura de Contífico. Para cada k (días que van pasando):
 *
 *   quedaban(k)  = clientes que llegaron a k días sin haber comprado antes
 *   compraron(k) = de ellos, los que compraron en k o después
 *   P(k)         = (compraron + ½) / (quedaban + 1)
 *
 * El ½ y el 1 suavizan (estimador de Jeffreys): con 0 de 81 no dice «0 %»,
 * dice ~0,6 %. Esa P es la que se le muestra al asesor.
 *
 * El corte de «ya no viene» NO es un umbral de probabilidad: mientras alguien
 * haya llegado así de tarde, hay chance. Es el día siguiente al último en que
 * alguien compró (ignorando lo de más de 30 días, que es otra visita), MÁS un
 * día de margen: la muestra es chica y es más caro dejar de empujar a alguien
 * que todavía viene que empujar un día de más. Medido el 26-oct con la regla
 * del 1 %, el silencio cortaba al día 3 y había una compra al día 4.
 * Con menos de MINIMO_COMPRADORES ventas no hay curva que valga y se usan los
 * cortes por defecto. Nada de esto se guarda: se recalcula con cada factura.
 */
import { diasEntre } from "./estadisticaVentas.js";

export const MARGEN_DIAS = 1;
export const MINIMO_COMPRADORES = 5;
const K_MAX = 30;

export interface Observacion {
  /** "YYYY-MM-DD" (Quito) en que arranca el reloj. */
  inicio: string;
  /** "YYYY-MM-DD" (Quito) de la primera factura con llantas, o null. */
  compra: string | null;
}

export interface PuntoCurva { k: number; quedaban: number; compraron: number; probabilidad: number }

export interface Curva {
  /** Clientes con este reloj. */
  n: number;
  compradores: number;
  /** Compraron antes de que arrancara el reloj (p. ej. antes del día que dijeron). */
  antes: number;
  mismoDia: number;
  despues: number;
  /** De los que compraron después: cuántos a cada día de distancia, {1: 3, 4: 1}. */
  despuesPorDia: Record<number, number>;
  curva: PuntoCurva[];
  /** Día siguiente al último en que alguien compró, sin margen. */
  corteMedido: number;
  /** Desde este día se marca «ya no viene» (corteMedido + margen, o el defecto). */
  corte: number;
  /** false = pocas ventas: se usa el corte por defecto. */
  suficiente: boolean;
}

export const probabilidad = (compraron: number, quedaban: number) =>
  Math.round(((compraron + 0.5) / (quedaban + 1)) * 10_000) / 10_000;

export function medirCurva(obs: readonly Observacion[], hoy: string, corteDefecto: number): Curva {
  const offsets = obs.filter((o) => o.compra).map((o) => diasEntre(o.inicio, o.compra!));
  const despuesPorDia: Record<number, number> = {};
  for (const d of offsets) if (d > 0) despuesPorDia[d] = (despuesPorDia[d] ?? 0) + 1;

  const curva: PuntoCurva[] = [];
  for (let k = 0; k <= K_MAX; k++) {
    let quedaban = 0;
    let compraron = 0;
    for (const o of obs) {
      if (o.compra) {
        const d = diasEntre(o.inicio, o.compra);
        if (d >= k) { quedaban++; compraron++; }
      } else if (diasEntre(o.inicio, hoy) >= k) {
        quedaban++;
      }
    }
    curva.push({ k, quedaban, compraron, probabilidad: probabilidad(compraron, quedaban) });
  }

  const suficiente = offsets.length >= MINIMO_COMPRADORES;
  const ultimoQueLlego = Math.max(0, ...offsets.filter((d) => d <= K_MAX));
  const corteMedido = Math.max(1, ultimoQueLlego + 1);
  return {
    n: obs.length,
    compradores: offsets.length,
    antes: offsets.filter((d) => d < 0).length,
    mismoDia: offsets.filter((d) => d === 0).length,
    despues: offsets.filter((d) => d > 0).length,
    despuesPorDia,
    // Solo lo que sirve para leerla: hasta dos días después del corte.
    curva: curva.slice(0, Math.min(K_MAX, Math.max(corteMedido, corteDefecto) + MARGEN_DIAS + 2) + 1),
    corteMedido,
    corte: suficiente ? corteMedido + MARGEN_DIAS : corteDefecto,
    suficiente,
  };
}

/** P(todavía compra) para alguien que lleva k días en ese reloj; antes de arrancar, la de k = 0. */
export function probabilidadEn(c: Curva, k: number): number {
  const p = c.curva[Math.max(0, Math.min(k, c.curva.length - 1))];
  return p?.probabilidad ?? 0;
}

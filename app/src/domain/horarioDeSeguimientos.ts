import type { StoreHours } from "../services/settings.js";

type Tramo = { open: string; close: string } | null;

/** 0 = domingo … 6 = sábado (como `follow_up_policies.business_hours`). */
const DIA_POR_NUMERO = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;

/**
 * El horario de los seguimientos nunca puede salirse del horario del local.
 *
 * `follow_up_policies.business_hours` nació con el horario de Depot escrito en
 * la migración 001 (lun–sáb 08:30–17:30) y cada cliente nuevo lo heredó: en la
 * prueba del 18-nov Competimotor mandó un seguimiento el sábado 16:30 con el
 * local cerrado desde las 16:00. El horario del local (`settings.store_hours`)
 * es la fuente de verdad de cuándo hay alguien; la política solo puede
 * acortarlo, nunca alargarlo.
 *
 * Con varios locales vale el tramo más amplio entre los que abren ese día
 * (si uno abre, hay a quién mandar al cliente). Día sin local abierto = null.
 */
export function recortarAlHorarioDelLocal(
  politica: Record<number, Tramo>,
  locales: StoreHours,
): Record<number, Tramo> {
  const resultado: Record<number, Tramo> = {};
  for (let dia = 0; dia < 7; dia += 1) {
    const deLaPolitica = politica[dia] ?? null;
    const abiertos = Object.values(locales)
      .map((local) => local.dias[DIA_POR_NUMERO[dia]])
      .filter((t) => t && !t.closed);
    if (!deLaPolitica || abiertos.length === 0) {
      resultado[dia] = null;
      continue;
    }
    const abreLocal = abiertos.map((t) => t.open).sort()[0];
    const cierraLocal = abiertos.map((t) => t.close).sort().at(-1)!;
    const open = deLaPolitica.open > abreLocal ? deLaPolitica.open : abreLocal;
    const close = deLaPolitica.close < cierraLocal ? deLaPolitica.close : cierraLocal;
    resultado[dia] = open < close ? { open, close } : null;
  }
  return resultado;
}

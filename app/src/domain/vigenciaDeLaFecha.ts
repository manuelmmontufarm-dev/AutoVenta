/**
 * ¿SIGUE VIGENTE LA FECHA DE LLEGADA O DE VISITA? (21-nov-2026, conv 469 y su familia.)
 *
 * Regla aprobada por Manuel: mientras el chat tenga una fecha de llegada
 * (`pickup_date`) o de visita (`visit_date`) y no haya pasado ESA FECHA + 1 DÍA,
 *
 *  · la memoria no vence por silencio (`reiniciarSiLaMemoriaVencio`): el cliente
 *    que quedó en venir el martes y escribe el miércoles sigue en la misma compra,
 *    aunque hayan pasado días callados;
 *  · la fecha no se borra al reabrir el chat de una venta ganada
 *    (`reopenConversation`): es justo lo que ese cliente viene a preguntar.
 *
 * «+ 1 día» es hasta el FINAL del día siguiente, en Guayaquil: una visita el
 * martes sigue vigente todo el miércoles, que es el día en que el cliente
 * escribe «ayer no alcancé a ir» o el seguimiento pregunta cómo le fue.
 *
 * Pura: sin base.
 */

const DIA_MS = 86_400_000;
/** Guayaquil es UTC-5 todo el año (sin horario de verano). */
const DESFASE_GUAYAQUIL_MS = 5 * 3_600_000;

function instante(fecha: Date | string | null | undefined): number | null {
  if (fecha == null || fecha === "") return null;
  // 'YYYY-MM-DD' (columna `date` como texto) se lee como ESE día en Guayaquil.
  if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return Date.parse(`${fecha}T12:00:00-05:00`);
  }
  const t = new Date(fecha).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * El final del día siguiente a la fecha, en Guayaquil. Las columnas `date`
 * (`pickup_date`) llegan de postgres.js a medianoche UTC del día —que en
 * Guayaquil es el día ANTERIOR a las 19:00—: con `esColumnaDate` se leen por su
 * día calendario.
 */
export function finDelDiaSiguiente(fecha: Date | string | null | undefined, esColumnaDate = false): Date | null {
  const t = instante(fecha);
  if (t === null) return null;
  let diaLocal: number;
  if (esColumnaDate && fecha instanceof Date) {
    diaLocal = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  } else {
    const local = new Date(t - DESFASE_GUAYAQUIL_MS);
    diaLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  }
  // Medianoche local del día + 2 = fin del día siguiente.
  return new Date(diaLocal + 2 * DIA_MS + DESFASE_GUAYAQUIL_MS);
}

/** ¿La fecha de llegada (`date`) o de visita (`timestamptz`) sigue vigente? */
export function fechaVigente(
  fechas: { pickupDate?: Date | string | null; visitDate?: Date | string | null },
  ahora: Date = new Date(),
): boolean {
  const fines = [
    finDelDiaSiguiente(fechas.pickupDate, true),
    finDelDiaSiguiente(fechas.visitDate),
  ].filter((f): f is Date => f !== null);
  return fines.some((f) => f.getTime() > ahora.getTime());
}

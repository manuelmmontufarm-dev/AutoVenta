const INTENT = /\b(?:voy|ire|iré|vamos|paso|pasare|pasaré|recojo|recogeré|retiro|retiraré|compro|compraré|visito|visitaré|llego|llegaré)\b/i;
const WEEKDAY: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
  jueves: 4, viernes: 5, sabado: 6, sábado: 6,
};

export interface CustomerCommitment {
  text: string;
  visitDate?: Date;
}

function localDateAt(hour: number, dayOffset: number, now: Date): Date {
  const local = new Date(now.getTime() - 5 * 3_600_000);
  return new Date(Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset,
    hour + 5, 0, 0,
  ));
}

/** Extrae únicamente compromisos explícitos de visita/retiro/compra. */
export function extractCustomerCommitment(text: string, now = new Date()): CustomerCommitment | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!INTENT.test(normalized)) return null;
  const compact = text.trim().replace(/\s+/g, " ").slice(0, 180);
  if (/\bhoy\b/.test(normalized)) return { text: compact, visitDate: localDateAt(15, 0, now) };
  if (/\bmanana\b/.test(normalized)) return { text: compact, visitDate: localDateAt(10, 1, now) };
  const day = Object.keys(WEEKDAY).find((name) => normalized.includes(name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  if (day) {
    const localNow = new Date(now.getTime() - 5 * 3_600_000);
    let offset = (WEEKDAY[day] - localNow.getUTCDay() + 7) % 7;
    if (offset === 0 && localNow.getUTCHours() >= 10) offset = 7;
    return { text: compact, visitDate: localDateAt(10, offset, now) };
  }
  if (/\b(?:esta semana|en la semana|este finde|fin de semana)\b/.test(normalized)) {
    return { text: compact };
  }
  return null;
}

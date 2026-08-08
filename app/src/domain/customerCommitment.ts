const INTENT = /\b(?:voy|ire|iré|vamos|paso|pasare|pasaré|recojo|recogeré|retiro|retiraré|compro|compraré|visito|visitaré|llego|llegaré)\b/i;
const WEEKDAY: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
  jueves: 4, viernes: 5, sabado: 6, sábado: 6,
};

/** Compromisos sin fecha exacta: valen como respuesta, no como día del calendario. */
const VAGO = /\b(?:esta semana|en la semana|este finde|el finde|fin de semana|proxima semana|la otra semana|la siguiente semana)\b/;

/**
 * "mañana" es día y también es hora del día. "paso en la mañana" NO es una
 * visita para el día siguiente, y agendarla ahí le movía la tarjeta un día
 * entero. El lookbehind descarta solo ese caso.
 */
const MANANA = /(?<!\bla\s)\bmanana\b/;

export interface CustomerCommitment {
  text: string;
  visitDate?: Date;
}

const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function localDateAt(hour: number, dayOffset: number, now: Date): Date {
  const local = new Date(now.getTime() - 5 * 3_600_000);
  return new Date(Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset,
    hour + 5, 0, 0,
  ));
}

/**
 * ¿El último mensaje nuestro le preguntó al cliente qué día puede venir?
 *
 * Existe porque el bot ahora pregunta la fecha de forma explícita (playbook §
 * "Cierre con día"), y a una pregunta directa el cliente responde "el sábado"
 * o "mañana temprano" — sin ningún verbo de visita. Sin este contexto esa
 * respuesta no se guardaba y la tarjeta quedaba sin día justo en el caso en el
 * que el cliente sí lo dijo.
 */
export function preguntamosElDia(ultimoMensajeNuestro: string | null | undefined): boolean {
  if (!ultimoMensajeNuestro) return false;
  const n = normalizar(ultimoMensajeNuestro);
  return (
    /\b(?:que|cual|cuando)\b[^.?!]{0,40}\b(?:dia|fecha|finde|fin de semana)\b/.test(n) ||
    /\bcuando\b[^.?!]{0,25}\b(?:puede|podria|pudiera|le queda|viene|vendria|pasa|pasaria|visita)\b/.test(n)
  );
}

/**
 * Extrae compromisos de visita/retiro/compra.
 *
 * `respondiendoAlDia` afloja la exigencia del verbo: si acabamos de preguntar
 * el día, "el sábado" ya es un compromiso. Sin esa señal se mantiene estricto,
 * porque un "mañana te cuento" suelto no es una visita.
 */
export function extractCustomerCommitment(
  text: string,
  now = new Date(),
  options: { respondiendoAlDia?: boolean } = {},
): CustomerCommitment | null {
  const normalized = normalizar(text);
  const day = Object.keys(WEEKDAY).find((name) => normalized.includes(normalizar(name)));
  const mencionaFecha = day != null || MANANA.test(normalized) || /\bhoy\b/.test(normalized) || VAGO.test(normalized);
  if (!INTENT.test(normalized) && !(options.respondiendoAlDia && mencionaFecha)) return null;
  const compact = text.trim().replace(/\s+/g, " ").slice(0, 180);
  if (/\bhoy\b/.test(normalized)) return { text: compact, visitDate: localDateAt(15, 0, now) };
  // El día de la semana manda sobre "mañana": "mañana sábado" es el sábado.
  if (day) {
    const localNow = new Date(now.getTime() - 5 * 3_600_000);
    let offset = (WEEKDAY[day] - localNow.getUTCDay() + 7) % 7;
    if (offset === 0 && localNow.getUTCHours() >= 10) offset = 7;
    return { text: compact, visitDate: localDateAt(10, offset, now) };
  }
  if (MANANA.test(normalized)) return { text: compact, visitDate: localDateAt(10, 1, now) };
  if (VAGO.test(normalized)) return { text: compact };
  return null;
}

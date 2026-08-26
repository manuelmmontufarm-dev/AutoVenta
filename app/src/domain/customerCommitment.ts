import { diaEnTexto, fechaDeCalendario, franjaHoraria, normalizarTexto, relativoEnTexto } from "./diasEnEspanol.js";

const INTENT = /\b(?:voy|ire|iré|vamos|paso|pasare|pasaré|recojo|recogeré|retiro|retiraré|compro|compraré|visito|visitaré|llego|llegaré|bisito|voi)\b/i;

/** Compromisos sin fecha exacta: valen como respuesta, no como día del calendario. */
const VAGO = /\b(?:esta semana|en la semana|este finde|el finde|fin de semana|proxima semana|la otra semana|la siguiente semana)\b/;

export interface CustomerCommitment {
  text: string;
  visitDate?: Date;
  /** «de 4 a 5 pm», «en la tarde»: la hora que dijo, para poder devolvérsela. */
  visitTimeLabel?: string;
  /**
   * Qué tan firme es lo que dijo:
   *  · `fecha`      — un día concreto («el juebes», «mañana»).
   *  · `tramo`      — se compromete sin día («esta semana»).
   *  · `solo_hora`  — dio la hora y todavía no el día («de 4 a 5»).
   *
   * `solo_hora` existe porque no todo lo que vale anotar vale lo mismo. El
   * cupón dice «por confirmar su visita» y el asesor lo cobra en caja: emitirlo
   * a quien solo dijo una hora es prometer un descuento por una visita que
   * nadie agendó. Se anota, se avisa al asesor, y el cupón espera al día.
   */
  tipo: "fecha" | "tramo" | "solo_hora";
}

const normalizar = normalizarTexto;

function localDateAt(hour: number, dayOffset: number, now: Date): Date {
  const local = new Date(now.getTime() - 5 * 3_600_000);
  return new Date(Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset,
    hour + 5, 0, 0,
  ));
}

/**
 * La fecha detrás de un día dicho en palabras.
 *
 * Es la mitad que le faltaba al modelo: `agendar_visita` recibe «jueves» o
 * «mañana» —lo que el bot entendió— y aquí se convierte en la fecha real, con
 * las mismas reglas que usa la captura automática. Acepta también una fecha ISO
 * por si el modelo prefiere calcularla él.
 */
export function fechaDelDia(texto: string, now = new Date()): Date | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  const iso = limpio.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const fecha = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 15, 0, 0));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  const calendario = fechaDeCalendario(limpio, now);
  if (calendario) return new Date(Date.UTC(calendario.anio, calendario.mes, calendario.dia, 15, 0, 0));
  const relativo = relativoEnTexto(limpio);
  if (relativo === "hoy") return localDateAt(15, 0, now);
  const dia = diaEnTexto(limpio);
  if (dia) {
    const localNow = new Date(now.getTime() - 5 * 3_600_000);
    let offset = (dia.indice - localNow.getUTCDay() + 7) % 7;
    if (offset === 0 && localNow.getUTCHours() >= 10) offset = 7;
    return localDateAt(10, offset, now);
  }
  if (relativo === "manana") return localDateAt(10, 1, now);
  if (relativo === "pasado_manana") return localDateAt(10, 2, now);
  return null;
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
  if (
    /\b(?:que|cual|cuando)\b[^.?!]{0,40}\b(?:dia|fecha|finde|fin de semana)\b/.test(n) ||
    /\bcuando\b[^.?!]{0,25}\b(?:puede|podria|pudiera|le queda|viene|vendria|pasa|pasaria|visita)\b/.test(n)
  ) return true;
  // Y también cuando nuestro último mensaje HABLA del día sin preguntarlo.
  //
  // Probado en el simulador (26-ago): el bot cerró con «Listo, jueves de 4 a 5
  // pm en Depot Tire Quito Sur» —sin pregunta—, el cliente contestó «X eso el
  // juebes» y esta función dijo que no: la respuesta seca volvió a perderse. La
  // pregunta explícita es la señal más común, no la única. Si en nuestro último
  // mensaje hay un día o una visita sobre la mesa y el cliente contesta
  // nombrando un día, está contestando a eso.
  return diaEnTexto(n) != null;
}

/**
 * Una pregunta no es un compromiso.
 *
 * «¿Abren el sábado?» nombra un día y no promete nada. Mientras la señal era la
 * pregunta explícita del bot esto se cubría solo; ahora que basta con que
 * NOSOTROS hayamos nombrado un día, hace falta el filtro del otro lado.
 */
function esPregunta(texto: string): boolean {
  const n = normalizar(texto).trim();
  return (
    n.includes("?") ||
    /^(?:abren|atienden|tienen|hay|cuanto|cuando|que hora|a que hora|hasta que hora|trabajan|abre|atiende)\b/.test(n)
  );
}

/**
 * Extrae compromisos de visita/retiro/compra.
 *
 * `respondiendoAlDia` afloja la exigencia del verbo: si acabamos de preguntar
 * el día, "el sábado" ya es un compromiso. Sin esa señal se mantiene estricto,
 * porque un "mañana te cuento" suelto no es una visita.
 *
 * El día se reconoce por SONIDO y con tolerancia a faltas (ver
 * `diasEnEspanol`): «X eso el juebes» tiene que valer exactamente igual que
 * «el jueves». El 24-ago no valió, y esa visita nunca existió para el sistema.
 */
export function extractCustomerCommitment(
  text: string,
  now = new Date(),
  options: { respondiendoAlDia?: boolean } = {},
): CustomerCommitment | null {
  const normalized = normalizar(text);
  const dia = diaEnTexto(text);
  const relativo = relativoEnTexto(text);
  const calendario = fechaDeCalendario(text, now);
  const franja = franjaHoraria(text);
  const mencionaFecha = dia != null || relativo != null || calendario != null || VAGO.test(normalized);
  // Una hora sin día («de 4 a 5») también es una respuesta a la pregunta de
  // visita: el cliente está diciendo cuándo puede, aunque le falte el día.
  const respondeAlgo = mencionaFecha || franja != null;
  if (!INTENT.test(normalized) && !(options.respondiendoAlDia && respondeAlgo)) return null;
  // Sin verbo de visita, una pregunta que menciona un día sigue siendo una
  // pregunta: «¿abren el sábado?» no agenda nada.
  if (!INTENT.test(normalized) && esPregunta(text)) return null;

  const compact = text.trim().replace(/\s+/g, " ").slice(0, 180);
  const etiqueta = franja?.etiqueta;
  const conFranja = (porDefecto: number, offset: number): CustomerCommitment => ({
    text: compact,
    visitDate: localDateAt(franja?.hora ?? porDefecto, offset, now),
    ...(etiqueta ? { visitTimeLabel: etiqueta } : {}),
    tipo: "fecha",
  });

  // Una fecha de calendario es lo más explícito que puede decir alguien: manda
  // sobre todo lo demás.
  if (calendario) {
    const base = Date.UTC(calendario.anio, calendario.mes, calendario.dia, (franja?.hora ?? 10) + 5, 0, 0);
    return {
      text: compact,
      visitDate: new Date(base),
      ...(etiqueta ? { visitTimeLabel: etiqueta } : {}),
      tipo: "fecha",
    };
  }
  if (relativo === "hoy") return conFranja(15, 0);
  // El día de la semana manda sobre "mañana": "mañana sábado" es el sábado.
  if (dia) {
    const localNow = new Date(now.getTime() - 5 * 3_600_000);
    let offset = (dia.indice - localNow.getUTCDay() + 7) % 7;
    if (offset === 0 && localNow.getUTCHours() >= 10) offset = 7;
    return conFranja(10, offset);
  }
  if (relativo === "manana") return conFranja(10, 1);
  if (relativo === "pasado_manana") return conFranja(10, 2);
  // Sin día exacto («esta semana», o una hora suelta): vale como compromiso,
  // pero no como fecha de calendario — el bot sigue debiendo preguntar el día.
  if (VAGO.test(normalized) || franja) {
    return {
      text: compact,
      ...(etiqueta ? { visitTimeLabel: etiqueta } : {}),
      tipo: VAGO.test(normalized) ? "tramo" : "solo_hora",
    };
  }
  return null;
}

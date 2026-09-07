import { diaDelMesSuelto, diaEnTexto, fechaDeCalendario, franjaHoraria, normalizarTexto, relativoEnTexto } from "./diasEnEspanol.js";

const INTENT = /\b(?:voy|ire|iré|vamos|paso|pasare|pasaré|recojo|recogeré|retiro|retiraré|compro|compraré|visito|visitaré|llego|llegaré|bisito|voi)\b/i;

/** Compromisos sin fecha exacta: valen como respuesta, no como día del calendario. */
const VAGO = /\b(?:esta semana|en la semana|este finde|el finde|fin de semana|proxima semana|la otra semana|la siguiente semana)\b/;

/**
 * UN RANGO NO ES UNA FECHA. «Paso entre hoy y el lunes» nombra DOS momentos y
 * no elige ninguno; leerlo como fecha concreta agenda un día que el cliente
 * nunca dijo.
 *
 * Medido el 31-ago-2026 (corpus T115, escenario V09): el cliente escribió
 * «paso entre hoy y el lunes» y el bot contestó «Perfecto: lunes 31 de agosto,
 * ya quedó registrado». `relativoEnTexto` encontraba «hoy», `diaEnTexto`
 * encontraba «lunes», y la rama de fecha concreta se quedaba con el segundo.
 *
 * Se comprueba ANTES que todo lo demás y cae en `tramo`, que ya significa
 * exactamente esto: se comprometió, pero el día sigue pendiente — así el
 * candado del cierre vuelve a pedirlo en vez de darlo por resuelto.
 */
const RANGO_DE_DIAS =
  /\b(?:entre|desde)\s+(?:el\s+|este\s+)?[a-z]+\s+(?:y|hasta|a)\s+(?:el\s+|este\s+)?[a-z]+|\b(?:hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+o\s+(?:el\s+)?(?:hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/;

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
/**
 * ¿Este bloque PREGUNTA el día? Estricto, a diferencia de `preguntamosElDia`.
 *
 * El laxo cae a `diaEnTexto(n) != null` a propósito: para leer la respuesta del
 * cliente basta con que nuestro mensaje tuviera un día sobre la mesa. Para
 * decidir si se pintan botones eso es demasiado — probado en el simulador el
 * 27-ago: el bot contestó «sí, para carretera van bien… le aplican la visita
 * que ya agendó» y se llevó tres botones de fecha debajo de una respuesta que
 * no preguntaba nada.
 */
export function preguntaElDia(bloque: string | null | undefined): boolean {
  if (!bloque) return false;
  // Las negritas de WhatsApp parten las palabras: «Dígame *qué día* sí le
  // queda» tiene asteriscos justo en medio de lo que hay que reconocer.
  const n = normalizar(bloque).replace(/[*_]/g, "");
  const interrogativo = /\b(?:que|cual|cuando)\b[^.?!]{0,40}\b(?:dia|fecha|finde|fin de semana)\b/;
  const pideCuando = /\bcuando\b[^.?!]{0,25}\b(?:puede|podria|pudiera|le queda|viene|vendria|pasa|pasaria|visita)\b/;
  if (bloque.includes("?") && (interrogativo.test(n) || pideCuando.test(n))) return true;

  // LA PREGUNTA EN IMPERATIVO, QUE NO LLEVA SIGNOS.
  //
  // Producción, 27-ago (conv 3, 13:15): el bot escribió «Dígame *qué día* sí le
  // queda y se lo registro». Preguntó, pero sin «?», así que este candado dijo
  // que no y el del cierre le pegó la pregunta otra vez — el cliente la vio dos
  // veces seguidas en dos mensajes.
  //
  // Exige el interrogativo «qué/cuál día» PEGADO al verbo, y ahí está la
  // diferencia con el caso contrario: «cuando tenga claro el día que puede
  // pasar, me avisa» dice «el día», no «qué día», y no pregunta nada — es un
  // «avíseme usted cuando sepa», que es exactamente lo que NO cierra una venta.
  return /\b(?:digame|dime|me dice|me dices|aviseme|avisame|cuenteme|cuentame|indiqueme|confirmeme)\b[^.?!]{0,30}\b(?:que|cual)\s+dia\b/.test(n);
}

/**
 * ¿El cliente RECHAZÓ los días propuestos sin proponer otro?
 *
 * Producción, 31-ago (conv 3 c20): a «¿Qué día cree que puede pasar?» el
 * cliente contestó «no puedo esos dias» y el bot respondió «Entendido, aún no
 * queda agendada la visita.» — y nada más. El candado anti-bucle calló la
 * pregunta del día porque el turno anterior ya la había hecho, pero un rechazo
 * ES una respuesta: ahí lo que corresponde es preguntar qué día SÍ puede.
 *
 * Estricto a propósito: si el mensaje nombra un día concreto («no puedo el
 * jueves, mejor el viernes») no es un rechazo en seco y esta función dice que
 * no — la captura normal ya lee ese día.
 */
export function rechazaLosDiasPropuestos(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const n = normalizar(texto);
  if (diaEnTexto(n) != null || relativoEnTexto(n) != null) return false;
  return (
    /\b(?:no\s+(?:puedo|podria|podre|me\s+sirven?|me\s+quedan?|me\s+vienen?)|imposible|ningun[oa]?)\b[^.?!]{0,30}\b(?:dias?|fechas?|semanas?)\b/.test(n)
    || /\b(?:esos|estos)\s+dias?\b[^.?!]{0,15}\bno\b/.test(n)
    || /\bninguno\s+de\s+esos\b/.test(n)
  );
}

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
/**
 * UN DÍA DENTRO DE UNA EXCUSA NO ES UNA VISITA (auditoría 2-6 sep, familia F).
 *
 *  · «no pude visitar porque me tocó trabajar hasta el domingo… con gusto
 *    otro día le visito» quedó como «viene el domingo 6» con alertas de
 *    «mañana viene» y «hoy viene» (conv 11632).
 *  · La autorespuesta de vacaciones «regresaré a mis actividades el 8 de
 *    septiembre» quedó como visita del martes 8 (conv 14014), y el asesor la
 *    dio por cierta.
 *  · «Permítame revisar si mañana puedo» quedó como visita de mañana (15426).
 *
 * Tres filtros ANTES de leer el día: la autorespuesta no agenda nada; el
 * condicional («si mañana puedo», «voy a ver si», «tal vez») tampoco; y las
 * cláusulas negativas o pasadas («no pude… hasta el domingo», «no alcancé el
 * lunes») se quitan del texto para que su día no cuente — «no pude ir el
 * lunes, voy el jueves» sigue agendando el jueves.
 */
const AUTORESPUESTA =
  /\bgracias\s+por\s+(?:comunicart|contactar|escribir)|\b(?:estoy|me\s+encuentro)\s+(?:fuera\s+de\s+la\s+oficina|de\s+vacaciones|en\s+(?:mi\s+)?periodo\s+de\s+vacaciones)|\bregresar[ée]\s+a\s+mis\s+actividades|\bresponder[ée]\s+(?:a\s+la\s+brevedad|en\s+cuanto|lo\s+antes)|\bmensaje\s+autom[aá]tico\b/;
const CONDICIONAL =
  /\bsi\s+(?:hoy|manana|el\s+\w+|puedo|alcanzo|logro|me\s+da|tengo\s+tiempo)\b[^.,;]{0,25}\b(?:puedo|alcanzo|logro|me\s+da|le\s+aviso|veo)\b|\b(?:voy\s+a\s+ver|dejeme\s+ver|permitame\s+(?:revisar|ver)|dejame\s+ver|tengo\s+que\s+ver)\s+si\b|\b(?:tal\s+vez|quizas?|de\s+pronto|de\s+repente|posiblemente|talvez)\b/;
const CLAUSULA_NEGATIVA =
  /\b(?:no\s+(?:pude|he\s+podido|alcance|alcanzo|fui|voy\s+a\s+poder|puedo|podre|logre|tuve|me\s+dio)|se\s+me\s+(?:complico|hizo\s+tarde)|me\s+toco\s+trabajar)\b/;

function sinClausulasNegativas(textoNormalizado: string): string {
  return textoNormalizado
    .split(/[.,;!?]+|\b(?:pero|porque|aunque|entonces)\b/)
    .filter((clausula) => !CLAUSULA_NEGATIVA.test(clausula))
    .join(", ");
}

export function extractCustomerCommitment(
  text: string,
  now = new Date(),
  options: { respondiendoAlDia?: boolean } = {},
): CustomerCommitment | null {
  const bruto = normalizar(text);
  if (AUTORESPUESTA.test(bruto) || CONDICIONAL.test(bruto)) return null;
  // Lo que se lee de aquí en adelante es el texto SIN sus cláusulas negativas.
  text = CLAUSULA_NEGATIVA.test(bruto) ? sinClausulasNegativas(bruto) : text;
  const normalized = normalizar(text);
  const dia = diaEnTexto(text);
  const relativo = relativoEnTexto(text);
  // El día del mes suelto («el 30») SOLO cuando acabamos de preguntar el día.
  // Fuera de esa pregunta, «el 4» es una cantidad o un precio, no una fecha.
  const calendario = fechaDeCalendario(text, now)
    ?? (options.respondiendoAlDia ? diaDelMesSuelto(text, now) : null);
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

  // El rango manda sobre cualquier día suelto que aparezca dentro de él: si el
  // cliente dio DOS momentos, no eligió ninguno (V09 del corpus, 31-ago).
  if (RANGO_DE_DIAS.test(normalized) && !calendario) {
    return {
      text: compact,
      ...(etiqueta ? { visitTimeLabel: etiqueta } : {}),
      tipo: "tramo",
    };
  }
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

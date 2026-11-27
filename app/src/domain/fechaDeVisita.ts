/**
 * EL LECTOR ÚNICO DE LA FECHA DE VISITA (auditoría 19-oct-2026, familia 6 —
 * «fechas de visita mal leídas», 6 chats).
 *
 * Había DOS lectores que escribían la ficha y levantaban la alerta
 * `visita_comprometida`: el pipeline (`index.ts`, sobre el texto del cliente)
 * y la herramienta `agendar_visita` (sobre lo que el MODELO entendió). En
 * 29358 el cliente dijo «…creo para el próximo sábado» un sábado: el pipeline
 * leyó el 24, el modelo mandó «sábado 31 de octubre», se crearon dos alertas
 * con fechas distintas y la ficha se quedó con el 31.
 *
 * Desde ahora las dos puertas (y la fase operativa) leen por aquí:
 *
 *  · `leerVisita` — el texto del cliente → compromiso con fecha, o nada.
 *  · `fechaParaAgendar` — lo que usa `agendar_visita`: la frase del cliente
 *    MANDA sobre el día que pasó el modelo; el día del modelo solo vale cuando
 *    el cliente no nombró ninguno («Sí, perfecto» al día que propuso el bot).
 *
 * Lo que NUNCA es una visita, aunque traiga un día:
 *
 *  · Lo que se leyó de una FOTO. «[El cliente mandó una foto. Se lee: … 6 1/2",
 *    $180…]» agendó el lunes 1 de febrero (27485): «1/2» se leyó como día/mes.
 *    El audio sí cuenta —es lo que el cliente DIJO—, y la leyenda escrita
 *    debajo de la foto también.
 *  · Mandar información: «Mañana le paso el dato completo» (30131) quedó como
 *    visita del martes 20 con aviso «CONFIRMÓ VISITA», porque «paso» es verbo
 *    de visita. «Le paso / le mando / le envío / le comparto» es dar un dato;
 *    «me paso por ahí» (con «me») sí es venir.
 *
 * Y el día de la visita se compara como DÍA en Quito, no como instante: con
 * la visita a las 10:00 (hora de relleno), a las 12:37 del mismo día el
 * seguimiento ya decía «no alcanzó a pasar» (6145).
 */
import { extractCustomerCommitment, fechaDelDia, tieneVerboDeVisita, type CustomerCommitment } from "./customerCommitment.js";
import { diaEnTexto, normalizarTexto, relativoEnTexto } from "./diasEnEspanol.js";
import { politica } from "../negocio/politica.js";

export type NoEsVisita = "texto_de_una_foto" | "envia_informacion" | "pide_otro_dia" | "pregunta";

/**
 * «VIERNES NEGRO» ES UNA PROMOCIÓN, NO UN DÍA (Sprint 4, auditoría Competimotor
 * 26-nov, chat 1790). El bot acababa de preguntar «¿Qué día cree que puede ir?»
 * y el cliente escribió «X viernes  negro  hay más descuento»: una PREGUNTA por
 * el Black Friday. Se leyó «viernes», la ruta directa contestó «Perfecto,
 * registré su visita para viernes 27 de noviembre» y el asesor recibió
 * «CONFIRMÓ VISITA». El nombre de la promoción se quita antes de buscar el día.
 */
const NOMBRE_DE_PROMOCION =
  /\b(?:viernes\s+negro|black\s*friday|blackfriday|viernes\s+de\s+(?:descuentos?|ofertas?|promos?|promociones?)|cyber\s*monday)\b/g;

/**
 * UN DÍA DENTRO DE UNA PREGUNTA NO ES UN COMPROMISO, aunque no lleve «?» (1790).
 * «el viernes hay más descuento», «el sábado atienden», «black friday hay
 * descuento»: preguntan algo del día. Solo cuenta sin verbo de visita: «el
 * viernes voy, ¿hay parqueadero?» sigue siendo la visita del viernes.
 *
 * SOLO CON `politica.seguimientos.preguntaConDiaNoAgenda` (Competimotor). En
 * Depot, de 175 visitas registradas en 30 días (base de producción, 26-nov),
 * esta regla habría borrado 8 y en casi todas el cliente SÍ daba el día:
 * «Lunes 01 diciembre / Hasta que hora atienden», «Él día sábado que tengo
 * libre… asta que hora atienden», «Mañana atienden en cumbaya???». Para todos
 * vale solo el nombre de la promoción (`NOMBRE_DE_PROMOCION`).
 */
const PREGUNTA_DE_PRECIO =
  /\b(?:hay|habra|habria|tienen|tendran|hacen|dan)\s+(?:mas\s+|algun\s+|otro\s+)?(?:descuentos?|promos?|promociones?|ofertas?|rebajas?|precios?\s+especial(?:es)?)\b|\bque\s+(?:descuentos?|promos?|precio)\b|\bcuanto\b/;
const PREGUNTA_SOBRE_EL_DIA =
  /[?¿]|\b(?:atienden|abren|trabajan|atiende|abre|trabaja|estan\s+abiertos)\b/;

/** Cómo se lee un día que viene dentro de una pregunta. */
export interface OpcionesDeLectura {
  /** El bot acababa de preguntar el día o el local (ver `respondeAlDiaDeLaVisita`). */
  respondiendoAlDia?: boolean;
  /**
   * La regla ancha de las preguntas (horario, descuento, «?»). Por defecto la
   * del negocio: `politica.seguimientos.preguntaConDiaNoAgenda` (Competimotor).
   */
  preguntaAncha?: boolean;
}

/**
 * ¿El texto pregunta por un día o por la promoción, sin decir que viene?
 *
 * Se mira la ORACIÓN que nombra el día, no el mensaje entero: el audio de 1273
 * «yo creo que para el día miércoles. … ¿qué viene? ¿Llantas, alineación…?»
 * da el día en una oración y pregunta otra cosa en la siguiente: esa visita
 * vale (simulador, 26-nov).
 */
function esPreguntaSobreElDia(texto: string, opciones: OpcionesDeLectura = {}): boolean {
  const conRenglones = normalizarTexto(texto);
  const n = conRenglones.replace(/\s+/g, " ");
  const promo = NOMBRE_DE_PROMOCION.test(n);
  NOMBRE_DE_PROMOCION.lastIndex = 0;
  if (tieneVerboDeVisita(n.replace(NOMBRE_DE_PROMOCION, " "))) return false;
  if (promo) return true;
  // Lo de acá abajo es la regla ancha: solo con la política (ver arriba).
  if (!(opciones.preguntaAncha ?? Boolean(politica.seguimientos?.preguntaConDiaNoAgenda))) return false;
  // Los renglones se cortan ANTES de juntar los espacios: «Lunes 01 diciembre\n
  // Hasta que hora atienden» son dos oraciones, y la del día no pregunta nada.
  const oraciones = conRenglones.split(/\n+|(?<=[.!?])\s+|(?=¿)/)
    .map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean);
  const conDia = oraciones.filter((o) => diaEnTexto(o) != null || relativoEnTexto(o) != null);
  // Contestando «¿Qué día puede pasar?», «el sábado atienden?» ES el sábado: solo
  // una pregunta de precio o descuento («el viernes hay más descuento») le quita el día.
  const pregunta = (o: string) =>
    PREGUNTA_DE_PRECIO.test(o) || (!opciones.respondiendoAlDia && PREGUNTA_SOBRE_EL_DIA.test(o));
  return conDia.length > 0 && conDia.every(pregunta);
}

/** El texto sin el nombre de la promoción («viernes negro», «black friday»). */
function sinNombreDePromocion(texto: string): string {
  return texto.replace(/\s+/g, " ").replace(
    /\b(?:viernes\s+negro|black\s*friday|blackfriday|viernes\s+de\s+(?:descuentos?|ofertas?|promos?|promociones?)|cyber\s*monday)\b/gi,
    " ",
  ).replace(/\s+/g, " ").trim();
}

/**
 * «Quiero cambiar el día», «agendar otro día», «no voy a poder ir»: pedir un
 * cambio sin nombrar el día nuevo (19-nov-2026, botones del recordatorio de
 * visita). Solo cuenta si NO trae un día: «no puedo el sábado, mejor el lunes»
 * sí es una visita, al lunes.
 */
const PIDE_OTRO_DIA = /\b(?:cambiar|cambio|mover|reagendar|reprogramar|agendar\s+otro|otro)\s+(?:de\s+)?(?:el\s+|la\s+)?(?:dia|fecha)\b|\bno\s+(?:voy\s+a\s+poder|puedo|pude|alcanzo|alcance)\s+(?:ir|pasar|llegar)\b/;

const FOTO = /\[El cliente mandó una foto[^\]]*\]/g;
const AUDIO = /\[El cliente mandó un audio\. Dice: ([^\]]*)\]/g;

/** Lo que el cliente dijo o escribió: sin lo leído de una foto, con lo dicho en un audio. */
export function loQueDijoElCliente(texto: string): string {
  return (texto ?? "").replace(FOTO, " ").replace(AUDIO, " $1 ").replace(/\s+/g, " ").trim();
}

const ENVIA_INFORMACION =
  /\b(?:le|les|te)\s+(?:paso|pasare|mando|mandare|envio|enviare|comparto|compartire|hago\s+llegar|escribo|escribire)\b/g;

/** ¿Por qué este texto no puede ser un compromiso de visita, aunque nombre un día? */
export function porQueNoEsVisita(texto: string | null | undefined, opciones: OpcionesDeLectura = {}): NoEsVisita | null {
  const crudo = texto ?? "";
  const dicho = loQueDijoElCliente(crudo);
  if (crudo.includes("[El cliente mandó una foto") && !dicho) return "texto_de_una_foto";
  const n = normalizarTexto(dicho);
  // «Mañana le mando la medida y el sábado voy» sí trae una visita: cuenta
  // el verbo que queda FUERA del «le paso».
  const sinElEnvio = n.replace(ENVIA_INFORMACION, " ");
  if (sinElEnvio !== n && !tieneVerboDeVisita(sinElEnvio)) return "envia_informacion";
  // Sprint 4 (1790): una pregunta sobre el día o la promoción no agenda nada,
  // ni por el pipeline ni por `agendar_visita` con el día que pase el modelo.
  if (esPreguntaSobreElDia(dicho, opciones)) return "pregunta";
  return null;
}

/** El texto del cliente → compromiso de visita (con fecha si la dio), o null. */
export function leerVisita(
  texto: string,
  ahora = new Date(),
  opciones: OpcionesDeLectura = {},
): CustomerCommitment | null {
  if (porQueNoEsVisita(texto, opciones)) return null;
  // «el viernes negro paso» trae verbo de visita pero el «viernes» es de la
  // promoción: el día se busca en el texto sin su nombre.
  const dicho = sinNombreDePromocion(loQueDijoElCliente(texto));
  if (!dicho) return null;
  return extractCustomerCommitment(dicho, ahora, { respondiendoAlDia: opciones.respondiendoAlDia });
}

/**
 * La fecha que registra `agendar_visita`. `texto` es lo que se guarda como
 * `customer_commitment`: la frase del cliente, junto a la fecha leída.
 */
export function fechaParaAgendar(input: {
  dia: string;
  textoDelCliente: string;
  ahora?: Date;
  /** El bot acababa de preguntar el día o el local (ver `respondeAlDiaDeLaVisita`). */
  respondiendoAlDia?: boolean;
  /** Ver `OpcionesDeLectura.preguntaAncha` (por defecto, la del negocio). */
  preguntaAncha?: boolean;
}): { fecha: Date | null; texto: string; franja?: string; noEsVisita?: NoEsVisita } {
  const ahora = input.ahora ?? new Date();
  const frase = input.textoDelCliente.trim().replace(/\s+/g, " ").slice(0, 180);
  const lectura: OpcionesDeLectura = { respondiendoAlDia: input.respondiendoAlDia ?? false, preguntaAncha: input.preguntaAncha };
  const motivo = porQueNoEsVisita(input.textoDelCliente, lectura);
  if (motivo) return { fecha: null, texto: frase, noEsVisita: motivo };
  // La misma señal que el pipeline: sin la pregunta del día, «las 4» no es el día 4.
  const delCliente = leerVisita(input.textoDelCliente, ahora, lectura);
  if (delCliente?.visitDate) {
    return { fecha: delCliente.visitDate, texto: delCliente.text, franja: delCliente.visitTimeLabel };
  }
  // «LA PRÓXIMA SEMANA» NO ES UN DÍA (Sprint 4, chat 1011, y en el simulador 2
  // de 3): el cliente dio un tramo sin día y el modelo pasó «jueves» (hoy); se
  // registraba «su visita para jueves 26 de noviembre». Si lo que dijo el
  // cliente es un tramo, el día del modelo no vale: la herramienta no agenda.
  // Un rango CON días («el miércoles o jueves te visito», Depot 50312) no entra:
  // ahí el modelo elige uno de los que dijo el cliente, igual que antes.
  if (delCliente?.tipo === "tramo" && !delCliente.visitTimeLabel
    && diaEnTexto(normalizarTexto(loQueDijoElCliente(input.textoDelCliente))) == null) {
    return { fecha: null, texto: delCliente.text };
  }
  if (PIDE_OTRO_DIA.test(normalizarTexto(loQueDijoElCliente(input.textoDelCliente)))) {
    return { fecha: null, texto: frase, noEsVisita: "pide_otro_dia" };
  }
  return { fecha: fechaDelDia(input.dia, ahora), texto: frase || input.dia.trim() };
}

/** «2026-10-17»: el día calendario en Quito (UTC-5 todo el año). */
export function diaEnQuito(fecha: Date): string {
  return new Date(fecha.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** ¿Hoy, en Quito, es el día de la visita? */
export function esElDiaDeLaVisita(visita: Date, ahora: Date): boolean {
  return diaEnQuito(visita) === diaEnQuito(ahora);
}

/** ¿El día de la visita ya terminó? Recién al día siguiente se dice «no alcanzó a pasar». */
export function yaPasoElDiaDeLaVisita(visita: Date, ahora: Date): boolean {
  return diaEnQuito(visita) < diaEnQuito(ahora);
}

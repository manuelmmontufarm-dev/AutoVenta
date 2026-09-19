/**
 * «YO LE AVISO» NO ES UN NO, PERO TAMPOCO ES «ESCRÍBAME EN TRES HORAS».
 *
 * Auditoría 13–18 sep, familia 3 (28 chats). El arreglo del 6-sep calló los
 * seguimientos tras un rechazo («Callate», «no gracias», «ya compré»). Las que
 * siguieron saliendo son las despedidas SUAVES, que no cierran la venta:
 *
 *   conv 20471  «yo le contacto»            → recordatorio a las horas
 *   conv 20663  «yo le aviso»               → «¿qué día puede pasar?»
 *   conv 12539  «estaré en contacto»        → seguimiento igual
 *   conv 19879  «ya le paso» (la medida)    → dos recordatorios calcados
 *   conv 20589  «le avisaré»                → la pregunta del día 4 veces
 *
 * El cliente tomó el turno: dijo que ÉL escribe. El seguimiento automático
 * dentro de la ventana de 24 h no sale; la conversación sigue abierta y el
 * asesor la ve. No es una lista de despedidas: es una sola forma —primera
 * persona + verbo de avisar/escribir/pasar— con o sin «cualquier cosa».
 *
 * Puro. `true` solo si el mensaje ENTERO es la postergación: «le aviso el
 * lunes a qué hora paso» trae un día y eso es una visita, no un «después».
 */
const normalizar = (t: string) =>
  (t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const YO_ESCRIBO =
  /\b(?:yo\s+)?(?:le|les|te|los)\s+(?:aviso|avisare|avisamos|contacto|contactare|escribo|escribire|llamo|llamare|confirmo|confirmare|comento|comentare|digo|dire)\b|\b(?:yo\s+)?(?:me|nos)\s+(?:comunico|comunicare|comunicamos|contacto|pongo\s+en\s+contacto)\b|\bestar[ée]\s+en\s+contacto\b|\bestamos\s+en\s+contacto\b|\bya\s+(?:le|les|te)\s+(?:paso|mando|envio|aviso|escribo)\b|\bcuando\s+pueda\s+(?:le|les|te)\s+(?:envio|mando|paso|aviso|escribo)\b|\b(?:luego|despues|mas\s+tarde|mas\s+adelante|en\s+un\s+rato)\s+(?:le|les|te)\s+(?:aviso|escribo|confirmo|paso|mando)\b|\bcualquier\s+(?:cosa|novedad)\s+(?:le|les|te)\s+(?:aviso|escribo)\b/;

const TRAE_UN_DIA =
  /\b(?:hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|fin\s+de\s+semana|finde|\d{1,2}\s+de\s+[a-z]+)\b/;

export function elClienteDijoQueAvisa(mensajeDelCliente: string | null | undefined): boolean {
  const n = normalizar(mensajeDelCliente ?? "");
  if (!n || n.length > 140 || /\?/.test(n)) return false;
  if (!YO_ESCRIBO.test(n)) return false;
  return !TRAE_UN_DIA.test(n);
}

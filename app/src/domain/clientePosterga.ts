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

/**
 * «CUANDO LO TENGA ME AVISA» (chat 27914, 16-oct). Lo contrario de «yo le
 * aviso»: el cliente pide que le avisemos NOSOTROS cuando llegue la llanta que
 * quería. Tampoco es «escríbame en tres horas»: el seguimiento automático le
 * volvía a ofrecer la equivalente que acababa de rechazar. Lo que corresponde
 * es que el asesor lo vea, no un recordatorio.
 */
const AVISEME_CUANDO =
  /\b(?:cuando|apenas|si)\s+(?:lo|la|los|las|le)?\s*(?:tenga|tengan|llegue|lleguen|ingrese|ingresen|haya|consiga|consigan)\b[^?]{0,40}\b(?:me|nos)\s+(?:avisa|avisan|avise|avisen|escribe|escriben|escriba|comunica|comunican|llama|llaman)\b|\b(?:aviseme|avisame|me\s+avisa|me\s+avisan|me\s+avise|me\s+avisen)\b[^?]{0,20}\b(?:cuando|apenas|si)\s+(?:lo|la|los|las|le)?\s*(?:tenga|tengan|llegue|lleguen|ingrese|ingresen|haya)\b/;

export function pideQueLeAvisen(mensajeDelCliente: string | null | undefined): boolean {
  const n = normalizar(mensajeDelCliente ?? "");
  if (!n || n.length > 200 || /\?/.test(n)) return false;
  return AVISEME_CUANDO.test(n);
}

/**
 * «AHÍ YO LE ESCRIBO… CUANDO REÚNA LOS BILLETES» (Sprint 4, auditoría
 * Competimotor 26-nov, familia F-05 A). El cliente PIDIÓ TIEMPO: él avisa, por
 * ahora no puede o junta la plata. Es un hecho de la conversación, no un
 * «escríbame en tres horas»:
 *
 *   1273  audio «Ahí yo le escribo mi pana, porque cuando ya… reúno los
 *         billetes yo ahí le escribo…» → al otro día dos «quedo pendiente de su
 *         mensaje cuando pueda retomarlo» (el audio pasa de los 140 caracteres
 *         de `elClienteDijoQueAvisa` y llega envuelto en «[El cliente mandó un
 *         audio. Dice: …]»).
 *   1011  «la próxima semana voy por qué me quedé ahora sin fondos» → esa
 *         tarde «¿Qué día de la próxima semana…?».
 *   538   «Yo le aviso por a ora estoy ocupado».
 *   1247  «Por ahora no gracias» al asesor → el bot retomó «¿Le puedo ayudar
 *         con alguna otra consulta?».
 *
 * Más amplio que `elClienteDijoQueAvisa` (que sigue igual para Depot): lee lo
 * DICHO en un audio, acepta audios largos y suma la falta de plata y el «por
 * ahora». Una pregunta o un pedido concreto sigue siendo venta viva.
 */
const AUDIO_DEL_CLIENTE = /\[El cliente mandó un audio\. Dice: ([^\]]*)\]/g;
const SIN_PLATA =
  /\b(?:sin\s+(?:fondos|plata|dinero|presupuesto|billete)|no\s+tengo\s+(?:la\s+)?(?:plata|dinero|presupuesto)|(?:reuno|reunir|reuna|junto|juntar|junte|consigo|consiga)\s+(?:los\s+billetes|la\s+plata|el\s+dinero|la\s+platita|el\s+presupuesto)|cuando\s+(?:cobre|me\s+paguen|tenga\s+(?:la\s+plata|el\s+dinero|los\s+billetes|presupuesto)))\b/;
const POR_AHORA =
  /\bpor\s+(?:ahora|a\s*h?ora|el\s+momento)\s*,?\s*(?:no\b|estoy\s+(?:ocupad|complicad|sin\b)|ando\s+(?:ocupad|complicad)|no\s+puedo)/;

export function pidioTiempo(mensajeDelCliente: string | null | undefined): boolean {
  const crudo = mensajeDelCliente ?? "";
  const dicho = crudo.replace(AUDIO_DEL_CLIENTE, " $1 ");
  const n = normalizar(dicho);
  if (!n || n.length > 400) return false;
  // Pregunta o pedido concreto: la venta sigue («le aviso, ¿abren el sábado?»).
  if (/\?/.test(n) || /\b\d{3}\s*[/ ]\s*\d{2}\b/.test(n)) return false;
  // Solo el PEDIDO: «para ver si están al mismo precio» (1273) no pide nada.
  if (/\b(?:cotice\w*|cotizame|cotizeme|cuanto\s+(?:cuesta|vale|es|sale|seria)|(?:me\s+)?(?:da|pasa|dice)\s+(?:el\s+)?precio)\b/.test(n)) return false;
  return YO_ESCRIBO.test(n) || SIN_PLATA.test(n) || POR_AHORA.test(n);
}

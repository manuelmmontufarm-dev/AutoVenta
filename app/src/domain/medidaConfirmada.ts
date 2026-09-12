/**
 * ¿La medida de trabajo la dio el CLIENTE, o la dedujo el bot?
 *
 * `tire_size` se escribe por tres puertas: lo que el cliente escribió (o lo
 * que se leyó de su foto, que entra como texto), un link que resumió una
 * medida, y `buscar_llanta` cuando el modelo busca una medida. Esa tercera
 * puerta es la que no distingue «el cliente dijo 225/70R16» de «el bot dedujo
 * 225/70R16 de un Suzuki SZ 2016» — y sobre esa deducción se firmó una
 * cotización (producción, 1-sep-2026, conv 13862).
 *
 * La regla es determinística y no necesita columna nueva: la medida está
 * confirmada si aparece, tal cual, en algún mensaje del cliente. Sirve para lo
 * escrito, para la foto («[El cliente mandó una foto. Se lee: 225/70R16…]») y
 * para el cliente que vuelve y cuya medida quedó en una visita anterior.
 */
import { medidasEnTexto, medidasPermitidas } from "./medidaPedida.js";
import { extractFlotationSizes, flotacionIncompleta, medidaIncompleta } from "./tireSize.js";

const pelar = (texto: string) => texto.toLowerCase().replace(/[\s\-/x×r]/g, "");

export function medidaConfirmadaPorCliente(
  tireSize: string | null | undefined,
  textosDelCliente: readonly (string | null | undefined)[],
): boolean {
  if (!tireSize) return false;
  const objetivo = new Set(medidasEnTexto(tireSize));
  const crudo = pelar(tireSize);
  for (const texto of textosDelCliente) {
    if (!texto) continue;
    if (objetivo.size && medidasEnTexto(texto).some((m) => objetivo.has(m))) return true;
    // Formatos que el extractor no lee (205R16C, medidas con errores de
    // tipeo): se compara pelado, sin espacios ni separadores.
    if (crudo.length >= 6 && pelar(texto).includes(crudo)) return true;
  }
  return false;
}

/**
 * CONTRA QUÉ MEDIDA SE SELLA LA TARJETA — o null si no hay contra qué.
 *
 * No es lo mismo que `medidasPermitidas`. Aquélla contesta «¿se le puede
 * cotizar esto sin sorprenderlo?» y por eso incluye la medida de trabajo, que
 * es como queda registrado que el cliente aceptó una equivalencia. El sello de
 * la pieza contesta otra cosa: «¿ESTA es la medida que él pidió?», y ahí la
 * medida de trabajo no sirve, porque `tire_size` también se llena con lo que
 * el bot DEDUJO de su vehículo o de su aro.
 *
 * Conv 18821, 10-sep-2026: el cliente pidió 32x10.50R15 en M/T, la ficha quedó
 * con 215/75R15 deducida, y la lámina salió marcando esa medida como «MEDIDA
 * EXACTA». Sobre esa lámina se firmó la cotización de $726.83 y el cliente
 * tuvo que contestar «Pero en la medida que le envié». Conv 18504: una Toyota
 * Hilux con 205/55R16 deducida, la misma marca verde.
 *
 * Cuando no se sabe, se devuelve null y la tarjeta no se marca: el poster ya
 * sabe quedarse callado (`medidaExacta: null`). Callar es la única respuesta
 * honesta mientras el cliente no haya dicho su medida.
 */
export function medidaParaElSello(
  textosDelCliente: readonly (string | null | undefined)[],
  tireSize?: string | null,
): string | null {
  const textos = textosDelCliente.filter((t): t is string => Boolean(t));
  const escritas = medidasPermitidas(textos);
  if (escritas.length) return escritas[0];
  // Formatos que el extractor no parsea pero el cliente sí escribió
  // («205R16C»): el comparador pelado de abajo sí los ve.
  if (tireSize && medidaConfirmadaPorCliente(tireSize, textos)) return tireSize;
  return null;
}

/**
 * EL ARO QUE EL CLIENTE ESCRIBIÓ (conv 3, 7-sep-2026). «Necesito rin 14» no
 * es una medida, pero sí es SU dato: las opciones que se le muestran son de
 * ese aro y cada una lleva su medida en la lámina. Si elige una, se cotiza
 * con la medida de esa opción — la regla del 1-sep (conv 13862) era para la
 * medida deducida por el VEHÍCULO, que el cliente nunca vio ni eligió.
 * Devuelve el último aro que escribió, o null.
 */
export function aroDadoPorElCliente(textosDelCliente: readonly (string | null | undefined)[]): number | null {
  let aro: number | null = null;
  for (const texto of textosDelCliente) {
    const leido = aroEnTexto(texto);
    if (leido !== null) aro = leido;
  }
  return aro;
}

const normalizarAro = (t: string | null | undefined) =>
  (t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * EL ARO COMO LO ESCRIBE LA GENTE (conv 3, 8-sep-2026): «Una llanta ron 15»
 * no era aro para el código —solo leía rin/aro/ring— y el turno terminó
 * pidiendo la medida completa con la guía, mientras la propia guía decía
 * «usted ya nos dijo aro 15». Entran los errores de tipeo y las formas
 * cortas: ron, rim, ring, arillo, «aro de 15», «r15», «R 15», «15 pulgadas».
 * Una medida completa en el texto gana: eso no es «solo aro».
 *
 * Y «completa» incluye las de PULGADAS y las que están a medias, que es por
 * donde se coló el error más caro de la semana del 8 al 11-sep. El texto
 * «32x10.50 Rin 15» traía una medida entera, pero el descarte de arriba solo
 * miraba la forma métrica: para este detector era «el cliente dio el aro 15»,
 * y con eso arrancó la ruta que muestra opciones del aro y después las cotiza
 * (conv 18821, KENDA KR29 215/75R15 por $726.83). Lo mismo con «MT 30.5 r15»
 * (conv 18677) y con «65 R 17» (conv 17668), donde lo que había era media
 * medida y lo que hacía falta era preguntar la otra mitad.
 *
 * Quién decide qué es una medida es `tireSize.ts`, con sus rangos y sus
 * múltiplos de 5. Aquí solo se le pregunta.
 */
export function aroEnTexto(texto: string | null | undefined): number | null {
  const n = normalizarAro(texto);
  if (/\b\d{3}\s*[\/x-]\s*\d{2}(?!\d)/.test(n)) return null;
  if (extractFlotationSizes(n).length || flotacionIncompleta(n) || medidaIncompleta(n)) return null;
  const m =
    n.match(/\b(?:rin(?:es)?|ron|rim(?:s)?|ring|aro(?:s)?|arillo(?:s)?|llanta(?:s)?\s+de)\s*(?:de\s+|del\s+|numero\s+|n[°º]?\s*)?(1[2-9]|2[0-4])\b/)
    ?? n.match(/\br\s?(1[2-9]|2[0-4])\b/)
    ?? n.match(/\b(1[2-9]|2[0-4])\s*(?:pulgadas|pulg\.?|")/);
  return m ? Number(m[1]) : null;
}

/**
 * El número seco como respuesta a «¿qué aro?» / «¿qué rin?»: «15» no es
 * cantidad ni menú si lo último que dijimos preguntaba el aro o la medida.
 */
export function aroRespondido(texto: string | null | undefined, ultimoMensajeNuestro: string | null | undefined): number | null {
  const directo = aroEnTexto(texto);
  if (directo !== null) return directo;
  const n = normalizarAro(texto).trim();
  const m = n.match(/^(?:el\s+|aro\s+|rin\s+)?(1[2-9]|2[0-4])\s*$/);
  if (!m) return null;
  const bot = normalizarAro(ultimoMensajeNuestro);
  const pregunto = /\?/.test(bot) && /\b(?:aro|rin|medida)\b/.test(bot) && !/prioriza|costo|premium|cuantas|cantidad/.test(bot);
  return pregunto ? Number(m[1]) : null;
}

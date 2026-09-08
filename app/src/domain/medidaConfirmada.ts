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
import { medidasEnTexto } from "./medidaPedida.js";

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
 */
export function aroEnTexto(texto: string | null | undefined): number | null {
  const n = normalizarAro(texto);
  if (/\b\d{3}\s*[\/x-]\s*\d{2}(?!\d)/.test(n)) return null;
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

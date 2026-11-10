/**
 * «ESTÁ MUY LEJOS», «NO PUEDO IR»: el cliente dice que no puede venir aunque no
 * nombre ninguna ciudad. Fuente única del hecho (auditoría 9-nov, familia 7):
 * la leen `dondeEstaElCliente` (para no pegarle «¿A cuál local…?») y
 * `sinSeguimiento` (para no escribirle más).
 *
 *   38924 · «Está muy lejos le agradezco»
 *   39597 · «aya chuta esta lejos donde estoy yo bueno muchas gracias x su tiempo»
 *           «esq soy de bolivar esta muy aledado muchas gracias»
 *   18535 · «Muy dificel ir a Quito»
 *
 * LO QUE NO CUENTA (revisión ronda 1 del sprint 5), porque es un cliente que
 * sigue comprando:
 *  · la negación, leída sobre la frase entera: «no me queda lejos», «no está tan
 *    lejos» (un lookbehind no alcanza: la búsqueda puede empezar en «queda»);
 *  · un LOCAL del perfil nombrado: «Cumbayá me queda lejos», «Quito Sur me queda
 *    lejos, mejor Cumbayá» es la respuesta a «¿A cuál local le queda mejor?»;
 *  · «no puedo ir/pasar» con un TIEMPO: «no puedo pasar esos días», «esta semana
 *    es complicado pasar», «no puedo pasar hoy» — rechaza los días, no la visita
 *    (conv 3 c20, 31-ago: la respuesta es «¿Qué día sí le vendría bien?»).
 *
 * Solo el patrón: si el MISMO mensaje sigue vendiendo («está lejos de mi casa
 * pero voy el sábado») lo decide quien llama con `mantieneLaVenta`.
 */
import { negocio, sinTildes } from "../negocio/index.js";
import { rechazaLosDiasPropuestos } from "./customerCommitment.js";

const normalizar = (t: string): string =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const INTENSIDAD = "(?:muy|demasiado|bastante|tan|re|lejisimos)";
const LEJOS = "(?:lejos|lejisimos|alejad[oa]s?|aledad[oa]s?)";
const VERBO = "(?:esta|estamos|estoy|queda|quedan|me\\s+queda|nos\\s+queda|es|son|sale|me\\s+sale)";

/** «está (muy) lejos», «me queda lejos», «es demasiado lejos», «está muy alejado/aledado». */
const ESTA_LEJOS = new RegExp(`\\b${VERBO}\\s+(?:${INTENSIDAD}\\s+)?${LEJOS}\\b`);
/** Lo que exigía `sinSeguimiento` antes del sprint: con «muy / demasiado / bastante / tan». */
const ESTA_MUY_LEJOS = new RegExp(`\\b${VERBO}\\s+${INTENSIDAD}\\s+${LEJOS}\\b`);
/** La negación de la frase de distancia, con lo que vaya entre el «no» y el verbo («no me», «no nos»). */
const NO_ESTA_LEJOS = new RegExp(`\\bno\\s+(?:(?:me|nos|le|les|te|lo|la)\\s+)?${VERBO}\\s+(?:${INTENSIDAD}\\s+|tampoco\\s+)?${LEJOS}\\b|\\bni\\s+tan\\s+lejos\\b`);

/** «no puedo ir», «no me es posible ir», «imposible ir», «(muy) difícil ir». */
const NO_PUEDE_IR =
  /\b(?:no\s+(?:puedo|podemos|podria|podriamos|alcanzo|alcanzamos)|no\s+(?:me|nos)\s+es\s+posible|imposible|dif[ií]cil|dificel|complicado)\s+(?:ir|venir|pasar|llegar|subir|viajar|acercarme|acercarnos|movilizarme)\b/;

/** Un tiempo concreto: el «no puedo» es de ese día o esa semana, no de la visita. */
const TIEMPO =
  /\b(?:hoy|manana|ahorita|ahora|este\s+rato|por\s+ahora|por\s+el\s+momento|todavia|aun|esos\s+dias|estos\s+dias|esta\s+semana|esa\s+semana|la\s+semana|entre\s+semana|fin\s+de\s+semana|finde|el\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|los\s+(?:lunes|martes|miercoles|jueves|viernes|sabados|domingos)|en\s+la\s+(?:manana|tarde|noche)|a\s+esa\s+hora|ese\s+dia|este\s+dia)\b/;

/** Los locales del perfil, como se escriben: con Depot, «cumbaya» y «quito sur». */
const LOCALES = negocio.locales
  .map((l) => sinTildes(l.nombreCorto ?? "").toLowerCase().trim())
  .filter((n) => n && !n.startsWith("[pendiente]"))
  .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
const NOMBRA_UN_LOCAL = LOCALES.length ? new RegExp(`\\b(?:${LOCALES.join("|")})\\b`) : null;

function lejosSinMatices(n: string, patron: RegExp): boolean {
  if (!patron.test(n)) return false;
  if (NO_ESTA_LEJOS.test(n)) return false;
  if (NOMBRA_UN_LOCAL?.test(n)) return false;
  return true;
}

/** Dice que está lejos (cualquier intensidad), sin negarlo ni nombrar un local del perfil. */
export function diceQueEstaLejos(texto: string | null | undefined): boolean {
  return lejosSinMatices(normalizar(texto ?? ""), ESTA_LEJOS);
}

/** Lo mismo con «muy / demasiado / bastante / tan»: lo que pide `sinSeguimiento` para callar. */
export function diceQueEstaMuyLejos(texto: string | null | undefined): boolean {
  return lejosSinMatices(normalizar(texto ?? ""), ESTA_MUY_LEJOS);
}

/** Dice que no puede ir, y no es un rechazo de días («no puedo pasar esos días», «hoy no puedo»). */
export function diceQueNoPuedeIr(texto: string | null | undefined): boolean {
  const n = normalizar(texto ?? "");
  if (!NO_PUEDE_IR.test(n)) return false;
  if (TIEMPO.test(n) || rechazaLosDiasPropuestos(texto)) return false;
  if (NOMBRA_UN_LOCAL?.test(n)) return false;
  return true;
}

/**
 * El texto sin las cláusulas que dicen que un lugar «queda lejos» (y no lo
 * niegan): lo que queda es lo que el cliente SÍ elige. «Quito Sur me queda
 * lejos, mejor Cumbayá» → « mejor Cumbayá»; «Cumbayá me queda lejos» → «».
 * Lo leen los dos lectores del local: `storeSelection` (lo que nombra) y
 * `localPorLaZonaDicha` (la zona que dice). Revisión ronda 1 del sprint 5.
 */
export function sinLoQueQuedaLejos(texto: string | null | undefined): string {
  return partirEnClausulas(texto).filter((c) => !quedaLejos(c)).join(" , ");
}

/** Las cláusulas que dicen que un lugar «queda lejos» (sin negarlo): las lee `localLejano.ts`. */
export function clausulasQueQuedanLejos(texto: string | null | undefined): string[] {
  return partirEnClausulas(texto).filter(quedaLejos);
}

const partirEnClausulas = (texto: string | null | undefined): string[] =>
  (texto ?? "").split(/[,.;!?\n]+|\b(?:pero|mejor|y)\b/i);

function quedaLejos(clausula: string): boolean {
  const n = normalizar(clausula);
  if (!/\blejos\b/.test(n)) return false;
  return !/\bno\s+(?:(?:me|nos|le|les|te)\s+)?(?:queda|quedan|es|esta|sale)\b/.test(n);
}

/**
 * EL LOCAL QUE «LE QUEDA LEJOS» NO SE LE PROPONE EN ESTE TURNO (replay final del
 * 10-nov, 39845 r3).
 *
 *   CLIENTE «Cumbayá me queda lejos» (a la pregunta del local)
 *   BOT     «📍 *Depot Tire Cumbayá*: …» + «¿Qué día cree que puede pasar por
 *           *Depot Tire Cumbayá*?» con botones.
 *
 * La ficha ya no guardaba Cumbayá (`sinLoQueQuedaLejos`), pero el texto proponía
 * justo ese local. Esto es la mitad pura.
 *
 * QUÉ SE TOCA, Y NADA MÁS (revisión ronda 4 del sprint 5): la línea del MAPA de
 * ese local y la oración que PROPONE LA VISITA ahí (la pregunta del día o del
 * local, «puede pasar por…», «le esperamos en…»). Nunca una oración que nombre
 * dos locales («*Cumbayá* y *Quito Sur*»), ni una que dé dirección u horario, ni
 * la que reconoce lo dicho («…le queda lejos»). Sin otro local en el perfil, no
 * se toca nada. El local lejano se lee con SU nombre (`comoLoNombran`), no con
 * el patrón suelto que elige entre dos («quito», «el sur»): «Quito me queda
 * lejos» es un cliente de fuera, no uno que descarta Quito Sur.
 */
import { negocio, sinTildes } from "../negocio/index.js";
import { clausulasQueQuedanLejos } from "./clienteLejos.js";
import { preguntaElDia } from "./customerCommitment.js";
import { preguntaElLocal } from "./storeSelection.js";

type Local = (typeof negocio.locales)[number];

const normalizar = (t: string): string => sinTildes(t).toLowerCase();
const escapar = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const confirmados = (): Local[] => negocio.locales.filter((l) => !String(l.nombre).startsWith("[PENDIENTE]"));

/** Los locales del perfil que el cliente dijo que le quedan lejos en este mensaje (por su nombre). */
export function localesQueLeQuedanLejos(textoDelCliente: string | null | undefined): Local[] {
  const clausulas = clausulasQueQuedanLejos(textoDelCliente).map(normalizar);
  if (!clausulas.length) return [];
  return confirmados().filter((local) => clausulas.some((c) => local.comoLoNombran.test(c) || nombra(c, local)));
}

/** Un patrón del nombre que no distingue tildes y no corta en la «á» final (`\b` sí cortaba). */
function patronDelNombre(nombre: string): RegExp {
  const conTildes = escapar(sinTildes(nombre))
    .replace(/a/gi, "[aáÁA]").replace(/e/gi, "[eéÉE]").replace(/i/gi, "[iíÍI]")
    .replace(/o/gi, "[oóÓO]").replace(/u/gi, "[uúüÚÜU]").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${conTildes}(?![\\p{L}\\p{N}])`, "giu");
}

function nombra(texto: string, local: Local): boolean {
  return patronDelNombre(local.nombre).test(texto) || patronDelNombre(local.nombreCorto).test(texto);
}

/** El nombre del local (completo y corto, con o sin tildes) cambiado por el del otro. */
function cambiarNombre(oracion: string, de: Local, a: Local): string {
  return oracion.replace(patronDelNombre(de.nombre), a.nombre).replace(patronDelNombre(de.nombreCorto), a.nombreCorto);
}

/** «puede pasar por», «le esperamos en», «acérquese a»…: proponer la visita sin preguntar el día. */
const PROPONE_LA_VISITA =
  /\b(?:puede|podr[ií]a|pueden)\s+(?:pasar|ir|acercarse|venir)\b|\ble\s+esper(?:o|amos)\b|\blos?\s+esperamos\b|\bac[eé]rquese\b|\bpase\s+por\b|\bpasar\s+por\b/i;
/** Dirección u horario: lo que dice dónde queda o cuándo abre ESE local, que no se puede mover a otro. */
const DIRECCION_U_HORARIO =
  /\b(?:est[aá]\s+en|queda\s+en|ubicad[oa]|direcci[oó]n|av\.?|avenida|calle|esquina|abre|cierra|horario|atiende|atendemos)\b|\d{1,2}[:h]\d{2}/i;

const proponeLaVisita = (oracion: string): boolean =>
  preguntaElDia(oracion) || preguntaElLocal(oracion) || PROPONE_LA_VISITA.test(oracion);

/**
 * El texto que sale sin proponer los locales lejanos: el mapa pasa al del otro
 * local (o se quita si ya está), y la oración que propone la visita se dirige
 * al otro local o, con más de dos, pregunta cuál le queda mejor.
 */
export function sinElLocalLejano(texto: string, lejanos: readonly Local[]): { texto: string; cambiado: boolean } {
  const otros = confirmados().filter((l) => !lejanos.includes(l));
  if (!lejanos.length || !otros.length) return { texto, cambiado: false };
  const unico = otros.length === 1 ? otros[0] : null;
  const preguntaDeCual = `¿A cuál local le queda mejor ir, ${listaDeLocales(otros, "o")}? 📍`;
  let resultado = texto;
  for (const lejano of lejanos) {
    const lineas = resultado.split("\n");
    resultado = lineas.map((linea) => {
      // El mapa: la línea «📍 *Depot Tire Cumbayá*: url», si es SOLO de ese local.
      if (/📍/.test(linea) && /https?:\/\//.test(linea)) {
        if (!nombra(linea, lejano) || otros.some((o) => nombra(linea, o))) return linea;
        const yaEsta = unico?.mapsUrl && resultado.includes(unico.mapsUrl);
        return unico?.mapsUrl && !yaEsta ? `📍 *${unico.nombre}*: ${unico.mapsUrl}` : "";
      }
      // Las oraciones que proponen la visita ahí.
      return linea.split(/(?<=[.!?])(?=\s)/).map((oracion) => {
        if (!nombra(oracion, lejano)) return oracion;
        if (otros.some((o) => nombra(oracion, o))) return oracion;
        if (/\blejos\b/.test(normalizar(oracion)) || DIRECCION_U_HORARIO.test(oracion)) return oracion;
        if (!proponeLaVisita(oracion)) return oracion;
        if (unico) return cambiarNombre(oracion, lejano, unico);
        const inicio = oracion.match(/^\s*/)?.[0] ?? "";
        return /\?/.test(oracion) ? `${inicio}${preguntaDeCual}` : oracion;
      }).join("");
    }).join("\n");
  }
  if (resultado === texto) return { texto, cambiado: false };
  resultado = resultado
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:\n\s*---[ \t]*)+\n\s*---[ \t]*(?=\n|$)/g, "\n---")
    .replace(/^\s*---\s*\n|\n\s*---\s*$/g, "")
    .trim();
  return { texto: resultado, cambiado: true };
}

/** «*A*», «*A* y *B*», «*A*, *B* y *C*». */
function listaDeLocales(locales: readonly Local[], conjuncion: "y" | "o"): string {
  const nombres = locales.map((l) => `*${l.nombreCorto}*`);
  return nombres.length <= 1 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} ${conjuncion} ${nombres[nombres.length - 1]}`;
}

/** El hecho para el Guardián: qué local le queda lejos y cuál ofrecerle. */
export function hechoDelLocalLejano(lejanos: readonly Local[]): string | null {
  if (!lejanos.length) return null;
  const otros = confirmados().filter((l) => !lejanos.includes(l));
  if (!otros.length) return null;
  return `EL CLIENTE DIJO QUE LE QUEDA LEJOS: ${listaDeLocales(lejanos, "y")}. `
    + `PROHIBIDO proponerle ese local, su mapa o la visita ahí en este turno; si corresponde la visita, ofrécele ${listaDeLocales(otros, "o")}.`;
}

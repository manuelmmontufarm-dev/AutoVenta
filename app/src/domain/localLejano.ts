/**
 * EL LOCAL QUE «LE QUEDA LEJOS» NO SE LE PROPONE EN ESTE TURNO (replay final del
 * 10-nov, 39845 r3).
 *
 *   CLIENTE «Cumbayá me queda lejos» (a la pregunta del local)
 *   BOT     «📍 *Depot Tire Cumbayá*: …» + «¿Qué día cree que puede pasar por
 *           *Depot Tire Cumbayá*?» con botones.
 *
 * La ficha ya no guardaba Cumbayá (`sinLoQueQuedaLejos`), pero el texto proponía
 * justo ese local. Esto es la mitad pura: qué locales nombró el cliente como
 * lejos, y el texto que sale sin el mapa ni la visita a ese local — con el otro
 * local si son dos, o con la pregunta de cuál le queda mejor si son más.
 * Una oración que habla de «lejos» («Entiendo que Cumbayá le queda lejos») es
 * el bot reconociendo lo dicho y no se toca.
 */
import { negocio, sinTildes } from "../negocio/index.js";
import { clausulasQueQuedanLejos } from "./clienteLejos.js";

type Local = (typeof negocio.locales)[number];

const normalizar = (t: string): string => sinTildes(t).toLowerCase();
const escapar = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const confirmados = (): Local[] => negocio.locales.filter((l) => !String(l.nombre).startsWith("[PENDIENTE]"));

/** Los locales del perfil que el cliente dijo que le quedan lejos en este mensaje. */
export function localesQueLeQuedanLejos(textoDelCliente: string | null | undefined): Local[] {
  const clausulas = clausulasQueQuedanLejos(textoDelCliente).map(normalizar);
  if (!clausulas.length) return [];
  return confirmados().filter((local) =>
    clausulas.some((c) => local.comoLoNombran.test(c) || Boolean(local.comoLoNombranAlElegir?.test(c))));
}

/** El texto con el nombre del local (completo y corto, con o sin tildes) cambiado por otro. */
function cambiarNombre(oracion: string, de: Local, a: Local): string {
  return oracion
    .replace(new RegExp(escapar(de.nombre), "gi"), a.nombre)
    .replace(new RegExp(escapar(sinTildes(de.nombre)), "gi"), a.nombre)
    .replace(new RegExp(`\\b${escapar(de.nombreCorto)}\\b`, "gi"), a.nombreCorto)
    .replace(new RegExp(`\\b${escapar(sinTildes(de.nombreCorto))}\\b`, "gi"), a.nombreCorto);
}

const nombra = (texto: string, local: Local): boolean => {
  const n = normalizar(texto);
  return n.includes(normalizar(local.nombre)) || new RegExp(`\\b${escapar(normalizar(local.nombreCorto))}\\b`).test(n);
};

/**
 * El texto que sale sin proponer los locales lejanos: el mapa se cambia por el
 * del otro local (o se quita si ya está), y la oración que lo propone se dirige
 * al otro local o, con más de dos, pregunta cuál le queda mejor.
 */
export function sinElLocalLejano(texto: string, lejanos: readonly Local[]): { texto: string; cambiado: boolean } {
  if (!lejanos.length) return { texto, cambiado: false };
  const otros = confirmados().filter((l) => !lejanos.includes(l));
  const unico = otros.length === 1 ? otros[0] : null;
  const preguntaDeCual = `¿A cuál local le queda mejor ir, ${otros.map((l) => `*${l.nombreCorto}*`).join(" o ")}? 📍`;
  let resultado = texto;
  for (const lejano of lejanos) {
    // El mapa: la línea «📍 *Depot Tire Cumbayá*: url».
    resultado = resultado.split("\n").map((linea) => {
      if (!/📍/.test(linea) || !/https?:\/\//.test(linea) || !nombra(linea, lejano)) return linea;
      const yaEsta = unico && resultado.includes(unico.mapsUrl ?? "\u0000");
      return unico && !yaEsta && unico.mapsUrl ? `📍 *${unico.nombre}*: ${unico.mapsUrl}` : "";
    }).join("\n");
    // Las oraciones que lo proponen (no las que hablan de «lejos»), línea por línea.
    resultado = resultado.split("\n").map((linea) => {
      if (/📍/.test(linea) && /https?:\/\//.test(linea)) return linea;
      return linea.split(/(?<=[.!?])(?=\s)/).map((oracion) => {
        if (!nombra(oracion, lejano) || /\blejos\b/.test(normalizar(oracion))) return oracion;
        if (unico) return cambiarNombre(oracion, lejano, unico);
        const inicio = oracion.match(/^\s*/)?.[0] ?? "";
        return /\?/.test(oracion) ? `${inicio}${preguntaDeCual}` : oracion;
      }).join("");
    }).join("\n");
  }
  resultado = resultado
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:\n\s*---\s*)+\n\s*---\s*(?=\n|$)/g, "\n---")
    .replace(/^\s*---\s*\n|\n\s*---\s*$/g, "")
    .trim();
  return { texto: resultado, cambiado: resultado !== texto.trim() };
}

/** El hecho para el Guardián: qué local le queda lejos y cuál ofrecerle. */
export function hechoDelLocalLejano(lejanos: readonly Local[]): string | null {
  if (!lejanos.length) return null;
  const otros = confirmados().filter((l) => !lejanos.includes(l));
  return `EL CLIENTE DIJO QUE LE QUEDA LEJOS: ${lejanos.map((l) => `*${l.nombreCorto}*`).join(", ")}. `
    + "PROHIBIDO proponerle ese local, su mapa o la visita ahí en este turno"
    + (otros.length ? `; si corresponde la visita, ofrécele ${otros.map((l) => `*${l.nombreCorto}*`).join(" o ")}.` : ".");
}

/**
 * Reemplaza la oferta de un local inventado por la pregunta canónica.
 *
 * Corre al final de la cadena, junto al aviso de stock y las preguntas de más,
 * y por el mismo motivo: quien escribe la última versión del texto es el Ángel
 * Guardián, así que un candado puesto antes no protege de lo que él redacte.
 *
 * No borra el mensaje ni la oración: sustituye la PREGUNTA por
 * `PREGUNTA_DE_LOCAL`, que nombra los dos locales que existen de verdad. El
 * cliente sigue recibiendo una pregunta contestable —que es lo que mueve la
 * venta— solo que sobre locales reales. Ver `domain/localesInventados.ts`.
 */
import { business } from "../config.js";
import { localesInventados, ofreceElegirLocal } from "../domain/localesInventados.js";
import { PREGUNTA_DE_LOCAL } from "../domain/storeSelection.js";

export interface TextoConLocalesReales {
  texto: string;
  /** Los nombres inventados que se quitaron, para alertar al asesor. */
  inventados: string[];
}

/** La oración interrogativa completa, de «¿» a «?». */
const PREGUNTA = /¿[^?¿]*\?/g;

export function conLocalesReales(texto: string): TextoConLocalesReales {
  const nombres = business.stores.map((s) => s.name);
  const inventados = localesInventados(texto, nombres);
  if (!inventados.length) return { texto, inventados: [] };

  let cambiado = false;
  const nuevo = texto.replace(PREGUNTA, (oracion) => {
    if (!ofreceElegirLocal(oracion) || !localesInventados(oracion, nombres).length) return oracion;
    cambiado = true;
    return PREGUNTA_DE_LOCAL;
  });
  // El nombre inventado estaba fuera de una pregunta (por ejemplo negándolo):
  // eso es correcto y no se toca.
  return cambiado ? { texto: nuevo, inventados } : { texto, inventados: [] };
}

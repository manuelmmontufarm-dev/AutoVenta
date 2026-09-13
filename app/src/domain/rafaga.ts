/**
 * UNA RESPUESTA COMPLETA AL FRENTE DE LA RÁFAGA ES SU PROPIO TURNO.
 *
 * El agrupador espera 12 segundos y junta lo que el cliente escribe seguido.
 * Está bien para «en rin 20» + «si», que es una sola idea partida. Pero las
 * rutas directas leen un mensaje de una sola intención, y el 12-sep (conv 3)
 * dos ráfagas perdieron la mitad:
 *
 *   17:26 «205/55R16» + «Estoy en Guayaquil» → opciones, y la ciudad ignorada.
 *   17:32 «1» + «Si se realiza el pago con tarjeta cuanto sube el valor» → el
 *         «1» ya no era una respuesta del menú, no se cotizó y volvió la lámina.
 *
 * Cuando el PRIMER mensaje es por sí solo una respuesta completa —el número o
 * el escalón del menú, o una medida sola— y lo que sigue habla de otra cosa,
 * se atienden en dos turnos, en orden. Si lo que sigue la completa (cantidad,
 * tipo, otra medida o aro), sigue junta como siempre: «205/55R16» + «4
 * llantas» es un solo pedido.
 */
import { extractExplicitQuantity, respuestaDePreferencia } from "./salesIntent.js";
import { extractFlotationSizes, extractTireSizes } from "./tireSize.js";
import { aroEnTexto } from "./medidaConfirmada.js";

const TIPO = /\b(?:a\/?t|h\/?t|r\/?t|m\/?t|todo\s+terreno|all\s+terrain|mud|lodo|carretera|turismo)\b/i;

function esSoloMedida(texto: string): boolean {
  const medidas = extractTireSizes(texto).length + extractFlotationSizes(texto).length;
  if (medidas !== 1) return false;
  const sinNumeros = texto.split(/\s+/).filter((p) => p && !/\d/.test(p));
  return sinNumeros.length <= 2;
}

function completaLoAnterior(texto: string): boolean {
  return extractExplicitQuantity(texto) !== null
    || TIPO.test(texto)
    || extractTireSizes(texto).length > 0
    || extractFlotationSizes(texto).length > 0
    || aroEnTexto(texto) !== null;
}

/** Índices de los mensajes de la ráfaga, agrupados por turno y en orden. */
export function gruposDeLaRafaga(textos: readonly string[]): number[][] {
  const todos = textos.map((_, i) => i);
  if (textos.length < 2) return [todos];
  const primero = textos[0].trim();
  const resto = textos.slice(1).join("\n");
  const completo = respuestaDePreferencia(primero) !== null || esSoloMedida(primero);
  if (!completo || completaLoAnterior(resto)) return [todos];
  return [[0], todos.slice(1)];
}

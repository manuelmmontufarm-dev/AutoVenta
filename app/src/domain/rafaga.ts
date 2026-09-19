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
import { esAcuseSimple } from "./ofertaAceptada.js";
import { marcaElegidaASecas } from "./consultaConRespaldo.js";

const TIPO = /\b(?:a\/?t|h\/?t|r\/?t|m\/?t|todo\s+terreno|all\s+terrain|mud|lodo|carretera|turismo)\b/i;

function esSoloMedida(texto: string): boolean {
  const medidas = extractTireSizes(texto).length + extractFlotationSizes(texto).length;
  if (medidas !== 1) return false;
  const sinNumeros = texto.split(/\s+/).filter((p) => p && !/\d/.test(p));
  return sinNumeros.length <= 2;
}

/**
 * LO QUE ACOMPAÑA NO ES OTRO TURNO (auditoría 13–18 sep, familia 4).
 *
 * La regla de arriba partía cualquier ráfaga cuyo resto no fuera cantidad, tipo
 * o medida, y una cortesía no es ninguna de las tres:
 *
 *   conv 3, 18-sep 00:20  «2» + «por favor» → el «2» cotizó; «por favor», solo,
 *     fue otro turno al que se le ordenó cotizar: «Su cotización sigue vigente»
 *     y la pregunta del local DOS veces, con sus botones.
 *   conv 3735, 13-sep 11:52  «255 70 R 16 AT» + «Gracias» → la lámina, y en el
 *     mismo minuto el «Gracias» suelto se leyó como aceptación y salió una
 *     cotización que nadie eligió.
 *
 * Un acuse pegado a una respuesta completa la acompaña: se atienden juntos.
 */
function soloAcompana(texto: string): boolean {
  return texto.split("\n").every((linea) => !linea.trim() || esAcuseSimple(linea));
}

/**
 * LA MARCA COMPLETA LA MEDIDA (conv 19457, 14-sep, y el simulador el 19-sep):
 * «Y en 215 70 r16» + «En Kenda» es UN pedido —esa medida, en esa marca—. Partido
 * en dos, el primer turno mostraba la única Kenda y el segundo leía «En Kenda»
 * como «elijo la Kenda»: salía una cotización de 4 que nadie había pedido.
 */
function nombraSoloUnaMarca(texto: string): boolean {
  return texto.split("\n").every((linea) => !linea.trim() || marcaElegidaASecas(linea.replace(/^\s*en\s+/i, "")) !== null);
}

function completaLoAnterior(texto: string): boolean {
  return soloAcompana(texto)
    || nombraSoloUnaMarca(texto)
    || extractExplicitQuantity(texto) !== null
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

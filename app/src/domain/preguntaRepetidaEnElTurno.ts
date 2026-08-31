/**
 * DOS VECES LA MISMA PREGUNTA, EN EL MISMO TURNO.
 *
 * Simulador, 31-ago-2026 20:38, repitiendo la ráfaga de la conv 3: el turno
 * terminó con dos mensajes seguidos preguntando lo mismo con otras palabras.
 *
 *   «¿A cuál local le queda mejor?»
 *   «¿Depot Tire Cumbayá o Depot Tire Quito Sur?»
 *
 * Ninguno de los candados que ya existen lo podía ver, y por tres razones
 * distintas — que es justo lo que lo volvía invisible:
 *
 *  · `sin_calco_reciente` compara contra mensajes YA ENVIADOS y exige texto
 *    idéntico; estas dos son del mismo turno y no se parecen byte a byte.
 *  · el detector de idea repetida de `applyOutboundGuard` pide 8 palabras
 *    mínimo, y una pregunta corta nunca las tiene — además corre antes del
 *    Ángel Guardián.
 *  · `insistirConLoQueFalta` sí mira si el turno ya pregunta, pero él no las
 *    escribió: las dos las escribió el modelo, y `conPreguntaEnSuPropioMensaje`
 *    las separó en dos mensajes, que es lo que las vuelve evidentes.
 *
 * Se queda la ÚLTIMA de cada clase, no la primera, y eso NO es un detalle: el
 * turno tiene que TERMINAR preguntando (regla de la casa, Manuel 27-ago) y los
 * botones se pintan sobre el ÚLTIMO bloque (`botonesDelUltimoBloque`). Quedarse
 * con la primera dejaría el turno cerrando con un bloque de datos y sin
 * botones — cambiaríamos una pregunta repetida por una venta más lenta.
 *
 * Solo se descartan bloques que son SOLO una pregunta: uno que además lleve
 * precio o número de cotización no se calla nunca — perder un dato es peor que
 * repetir una pregunta. Si por eso sobrevive un duplicado, queda en el log.
 */
import { preguntaElDia } from "./customerCommitment.js";
import { esSoloPregunta } from "./preguntaSola.js";
import { preguntaElLocal } from "./storeSelection.js";

/** El mismo separador que parte el turno en mensajes (`splitBlocks`). */
const SEPARADOR = /\n\s*-{3,}\s*\n/;

/** Las dos preguntas de cierre que el turno puede duplicar. */
type ClaseDePregunta = "local" | "dia";

function claseDe(bloque: string): ClaseDePregunta | null {
  if (preguntaElLocal(bloque)) return "local";
  if (preguntaElDia(bloque)) return "dia";
  return null;
}

export interface TurnoSinRepetir {
  texto: string;
  /** Los bloques que se descartaron, para el log y la alerta. */
  quitadas: string[];
}

export function sinPreguntaRepetidaEnElTurno(texto: string): TurnoSinRepetir {
  const bloques = texto.split(SEPARADOR).map((b) => b.trim()).filter(Boolean);
  if (bloques.length < 2) return { texto, quitadas: [] };

  // La ÚLTIMA de cada clase es la que se queda: es la que cierra el turno y la
  // que lleva los botones. Se recorre al revés y se descartan las anteriores.
  const clases = bloques.map(claseDe);
  const ultimaDeCadaClase = new Map<ClaseDePregunta, number>();
  clases.forEach((clase, i) => {
    if (clase) ultimaDeCadaClase.set(clase, i);
  });

  const vivos: string[] = [];
  const quitadas: string[] = [];
  bloques.forEach((bloque, i) => {
    const clase = clases[i];
    const esDuplicadoAnterior = clase != null && ultimaDeCadaClase.get(clase) !== i;
    if (esDuplicadoAnterior && esSoloPregunta(bloque)) {
      quitadas.push(bloque);
      return;
    }
    vivos.push(bloque);
  });

  return quitadas.length ? { texto: vivos.join("\n---\n"), quitadas } : { texto, quitadas: [] };
}

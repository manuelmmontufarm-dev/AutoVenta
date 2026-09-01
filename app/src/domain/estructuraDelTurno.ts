/**
 * La forma fija de un turno del bot.
 *
 * Manuel, 1-sep-2026, viendo dos chats reales: en uno el bot le repitió la
 * misma recomendación (modelo, precio y beneficios) en cuatro burbujas
 * seguidas; en el otro le mandó los mapas tres veces en veinte segundos. El
 * problema no era una regla que faltaba sino que el turno no tenía forma:
 * cada burbuja podía decir cualquier cosa, y el modelo llenaba las cuatro.
 *
 * La forma que pidió, en este orden:
 *
 *  1. La pieza (opciones o cotización), si aplica. Esa la manda la
 *     herramienta como imagen, no pasa por aquí.
 *  2. UN mensaje de respuesta, solo si hace falta.
 *  3. Los links, en su propio mensaje.
 *  4. La pregunta, al final y sola.
 *
 * «Un bloque por producto» lo descartó porque se lee robótico; lo que sí cabe
 * es que una misma idea no salga dos veces en el mismo turno con otras
 * palabras. Aquí las frases que repiten una idea ya dicha se quitan, y se
 * conserva la PRIMERA: la primera contesta, las siguientes suelen ser el
 * modelo insistiendo. Se compara frase por frase, no párrafo por párrafo.
 *
 * Puro, sin base: se prueba con texto y se corre al final de la cadena, en la
 * única puerta que parte el turno en mensajes (`splitBlocks`).
 */
import { esSoloPregunta } from "./preguntaSola.js";

/**
 * El mismo separador que `splitBlocks`, y también al inicio o al final del
 * texto: con la forma fija del turno el modelo a veces abre con «---» (el
 * hueco de la pieza que no mandó), y ese guion no puede llegar al cliente.
 */
const SEPARADOR = /(?:^|\n)\s*-{3,}\s*(?:\n|$)/;
const TIENE_LINK = /https?:\/\/\S+/i;

/**
 * Cuándo dos frases dicen lo mismo: la más corta está casi entera (80 %) en la
 * otra, y las dos tienen sustancia (6 palabras o más). Se mira la frase y no el
 * párrafo porque el eco real viene así: «Incluye instalación, alineación,
 * balanceo…» dentro de un párrafo largo, y tres burbujas después «Con la
 * compra incluye instalación, alineación, balanceo…» sola. Comparadas como
 * párrafos comparten poco; comparadas como frases, una contiene a la otra.
 */
const UMBRAL_MISMA_IDEA = 0.8;
const PALABRAS_MINIMAS = 6;

const palabrasDe = (t: string): Set<string> => new Set(
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3),
);

export function esMismaIdea(a: string, b: string): boolean {
  const pa = palabrasDe(a);
  const pb = palabrasDe(b);
  if (pa.size < PALABRAS_MINIMAS || pb.size < PALABRAS_MINIMAS) return false;
  let comunes = 0;
  for (const w of pa) if (pb.has(w)) comunes += 1;
  return comunes / Math.min(pa.size, pb.size) >= UMBRAL_MISMA_IDEA;
}

/** Las frases de una línea: cortadas en «. », «! », «? ». */
const frasesDe = (linea: string): string[] =>
  linea.split(/(?<=[.!?])\s+/).map((f) => f.trim()).filter(Boolean);

/**
 * Quita de un párrafo las frases que repiten una idea ya dicha (`dichas`) y
 * anota las nuevas. Devuelve el párrafo que queda, o "" si no quedó nada.
 */
function sinFrasesRepetidas(parrafo: string, dichas: string[]): { texto: string; quitadas: string[] } {
  const quitadas: string[] = [];
  const lineas = parrafo.split("\n").map((linea) => {
    const frases = frasesDe(linea).filter((frase) => {
      if (dichas.some((dicha) => esMismaIdea(dicha, frase))) {
        quitadas.push(frase);
        return false;
      }
      dichas.push(frase);
      return true;
    });
    return frases.join(" ");
  });
  return { texto: lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim(), quitadas };
}

export interface TurnoEstructurado {
  texto: string;
  /** true si el orden o la cantidad de mensajes cambió: para el log. */
  reordenado: boolean;
  /** Frases que repetían una idea ya dicha en el mismo turno (quitadas). */
  repetidosQuitados: string[];
}

/**
 * Reordena el turno a [respuesta] [links] [pregunta].
 *
 * - Las líneas con un link se sacan del párrafo donde estén y van todas juntas
 *   en un mensaje propio. Un link pegado a un párrafo se pierde en el texto;
 *   solo se ve cuando ocupa su burbuja.
 * - La pregunta final (el último bloque que sea SOLO una pregunta) va al final,
 *   aunque algún paso anterior le haya pegado los mapas detrás.
 * - Todo lo demás es la respuesta, y va en un solo mensaje.
 *
 * Un turno sin separadores ni links sale como entró.
 */
export function estructurarTurno(texto: string): TurnoEstructurado {
  const bloques = (texto ?? "").split(SEPARADOR).map((b) => b.trim()).filter(Boolean);
  if (!bloques.length) return { texto, reordenado: false, repetidosQuitados: [] };

  const links: string[] = [];
  const parrafos: string[] = [];
  const dichas: string[] = [];
  let pregunta: string | null = null;
  const repetidosQuitados: string[] = [];

  // La pregunta de cierre es el último bloque sin link que sea solo pregunta.
  const indicePregunta = (() => {
    for (let i = bloques.length - 1; i >= 0; i -= 1) {
      if (TIENE_LINK.test(bloques[i])) continue;
      return esSoloPregunta(bloques[i]) ? i : -1;
    }
    return -1;
  })();

  bloques.forEach((bloque, i) => {
    if (i === indicePregunta) {
      pregunta = bloque;
      return;
    }
    const prosa: string[] = [];
    for (const linea of bloque.split("\n")) {
      if (TIENE_LINK.test(linea)) {
        const limpia = linea.trim();
        if (!links.includes(limpia)) links.push(limpia);
      } else {
        prosa.push(linea);
      }
    }
    const parrafo = prosa.join("\n").trim();
    if (!parrafo) return;
    const limpio = sinFrasesRepetidas(parrafo, dichas);
    repetidosQuitados.push(...limpio.quitadas);
    if (limpio.texto) parrafos.push(limpio.texto);
  });

  const mensajes = [
    parrafos.join("\n\n"),
    links.join("\n"),
    pregunta ?? "",
  ].filter(Boolean);
  const resultado = mensajes.join("\n---\n");
  const original = bloques.join("\n---\n");
  return {
    texto: resultado,
    reordenado: resultado !== original,
    repetidosQuitados,
  };
}

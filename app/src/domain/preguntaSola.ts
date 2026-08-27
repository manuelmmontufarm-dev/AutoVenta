/**
 * La pregunta con la que cierra el turno va SOLA, en su propio mensaje.
 *
 * Manuel, 27-ago-2026, viendo su chat: «trata que las preguntas vayan en su
 * propio mensaje». Y tiene una razón que se ve en la misma captura: la pregunta
 * pegada al final de un párrafo con el precio, el modelo y el local se lee como
 * parte del relato y no como algo que hay que contestar. Sola, ocupa una burbuja
 * entera y es lo último que queda en pantalla.
 *
 * Además le sirve a los botones: `botonesParaBloque` mira el ÚLTIMO bloque, así
 * que separar la pregunta deja el mensaje con botones limpio, sin el párrafo
 * anterior metido en el cuerpo.
 *
 * SOLO parte la pregunta FINAL. Una pregunta a mitad de un párrafo suele ser
 * retórica («¿le sirve para carretera? sí, y además…») y separarla rompería el
 * hilo de la frase.
 *
 * Puro y sin base, como el resto de los candados del final.
 */

/** El mismo separador que parte el turno en mensajes (`splitBlocks`). */
const SEPARADOR = /\n\s*-{3,}\s*\n/;

/**
 * Cuánto texto se admite DETRÁS del «?» sin dejar de ser «la pregunta final».
 *
 * No es cero: la pregunta de cierre es «¿Le queda alguna otra duda? Ahí le
 * esperamos 🤝», y esa coletilla es parte del mismo mensaje —exigir que el
 * bloque terminara en «?» dejaba justo a esa sin separar (simulador, 27-ago)—.
 * Pero tampoco es libre: si detrás del signo hay un párrafo entero, la pregunta
 * no era el cierre y separarla partiría una idea por la mitad.
 */
const COLETILLA_MAXIMA = 60;

export interface TurnoConPreguntaSola {
  texto: string;
  /** true si hubo que separar algo: para el log, no para el cliente. */
  separada: boolean;
}

/**
 * Separa la pregunta final del último bloque en un bloque propio.
 *
 * `maxBloques` es el tope de `splitBlocks`: si separar dejara el turno por
 * encima, se suelta el bloque MÁS VIEJO para hacerle sitio — el mismo criterio
 * que `insistirConLoQueFalta`, y por el mismo motivo: la pregunta es lo único
 * que no puede perderse, porque es lo que mueve la venta.
 */
export function conPreguntaEnSuPropioMensaje(texto: string, maxBloques = 4): TurnoConPreguntaSola {
  const bloques = texto.split(SEPARADOR).map((b) => b.trim()).filter(Boolean);
  if (!bloques.length) return { texto, separada: false };

  const ultimo = bloques[bloques.length - 1];
  // Desde el ÚLTIMO «¿» hasta el final del bloque. Es más general que buscar un
  // bloque que termine en «?» y cubre la coletilla que va detrás del signo.
  const abre = ultimo.lastIndexOf("¿");
  if (abre < 0) return { texto, separada: false };
  const cierra = ultimo.indexOf("?", abre);
  if (cierra < 0) return { texto, separada: false };
  // Un párrafo detrás del signo significa que la pregunta no era el cierre.
  if (ultimo.length - cierra - 1 > COLETILLA_MAXIMA) return { texto, separada: false };

  const pregunta = ultimo.slice(abre).trim();
  const resto = ultimo.slice(0, abre).trim();
  // El bloque YA empieza con la pregunta: no hay nada que separar. Cubre además
  // la pregunta retórica que el bot se contesta sola («¿le sirve? sí, y…»).
  if (!resto) return { texto, separada: false };

  const nuevos = [...bloques.slice(0, -1), resto, pregunta];
  const conSitio = nuevos.length > maxBloques
    ? nuevos.slice(nuevos.length - maxBloques)
    : nuevos;
  return { texto: conSitio.join("\n---\n"), separada: true };
}

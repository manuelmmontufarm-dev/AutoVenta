/**
 * ¿UN PASO SOLO QUITÓ O REORDENÓ, O METIÓ TEXTO NUEVO?
 *
 * Después de separar la pregunta del turno en su propio mensaje, la cadena
 * de salida solo puede quitar o reordenar. Estaba escrito en un comentario y
 * en una prueba del orden, y no alcanzó: el 12-sep (conv 3, 17:16) el paso del
 * beneficio de redes, que corría ahí, pegó un mensaje DETRÁS de «¿A cuál local
 * le queda mejor ir?». La pregunta dejó de ser lo último y los botones de
 * Cumbayá y Quito Sur, que solo se pintan sobre el último mensaje, dejaron de
 * salir. Manuel lo vio como botones que aparecían «de la nada».
 *
 * La regla se comprueba con las palabras: cada mensaje que sale tiene que
 * poder leerse, en orden, dentro de lo que entró. Partir un párrafo, quitar
 * una frase o mover un bloque la cumplen; agregar un mensaje no.
 */

const SEPARADOR = /\n\s*-{3,}\s*\n/g;

const palabras = (texto: string): string[] =>
  texto.replace(SEPARADOR, "\n").split(/\s+/).filter(Boolean);

export function soloQuitaOReordena(antes: string, despues: string): boolean {
  const fuente = palabras(antes);
  for (const bloque of despues.split(SEPARADOR)) {
    const buscadas = palabras(bloque);
    let i = 0;
    for (const palabra of fuente) {
      if (i < buscadas.length && palabra === buscadas[i]) i += 1;
    }
    if (i < buscadas.length) return false;
  }
  return true;
}

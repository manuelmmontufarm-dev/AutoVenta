/**
 * El bloque calcado de hace un momento no se manda dos veces.
 *
 * Producción, 31-ago-2026 (conv 3 c20): el turno de la cotización mandó el
 * bloque de locales con sus links a las 17:23:35 y el turno siguiente —que
 * respondía «donde estan ubicados»— mandó EL MISMO bloque, byte a byte, a las
 * 17:23:42. El chequeo de duplicados de `applyOutboundGuard` no lo vio porque
 * corre ANTES del Ángel Guardián, y fue el guardián quien reescribió el
 * borrador dejándolo idéntico al mensaje anterior (review 2716: detectó la
 * repetición en su hallazgo… y su corrección la reprodujo textual).
 *
 * Regla de la casa: lo que tiene que ser cierto sí o sí corre al FINAL,
 * después de quien reescribe. Esta es la mitad pura; la ventana de tiempo y la
 * consulta viven en el paso `sin_calco_reciente` de `prepararSalida`.
 *
 * Compara BLOQUE por bloque (separador '---'), no el texto entero: el turno
 * duplicado del 31-ago eran dos mensajes (los mapas y la pregunta del local) y
 * los dos habían salido segundos antes.
 */

const normalizar = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

const SEPARADOR = /\n\s*-{3,}\s*\n/;

export interface ResultadoCalco {
  /** El texto sin los bloques calcados, o null si TODO era calco. */
  texto: string | null;
  /** Los bloques que se quitaron, para el log y la alerta. */
  calcados: string[];
}

/**
 * `salientesRecientes` viene DEL MÁS NUEVO AL MÁS VIEJO. Importa por las
 * preguntas: un bloque que pregunta solo cuenta como calco si duplica los DOS
 * salientes más recientes. La repregunta de cierre que `insistirCierre` agrega
 * a propósito («¿Qué día cree que puede pasar?») puede repetirse legítimamente
 * unos turnos después —su propio candado ya garantiza que nunca duplica el
 * mensaje inmediato anterior—, y comerla aquí re-crearía el error del 27-ago
 * (conv 3 c15: el turno terminó sin preguntar nada). El calco real del 31-ago
 * duplicaba justamente los dos mensajes inmediatos anteriores.
 */
// Basta con que el bloque PREGUNTE algo, en cualquier parte: las preguntas de
// cierre suelen seguir con «Le aviso al asesor. 📅» después del signo.
const CONTIENE_PREGUNTA = /[¿?]/;
const SALIENTES_PARA_PREGUNTAS = 2;

export function sinBloquesCalcados(
  texto: string,
  salientesRecientes: readonly string[],
): ResultadoCalco {
  const aBloques = (s: string) => s.split(SEPARADOR).map(normalizar).filter(Boolean);
  const recientes = new Set(salientesRecientes.flatMap(aBloques));
  const inmediatos = new Set(
    salientesRecientes.slice(0, SALIENTES_PARA_PREGUNTAS).flatMap(aBloques),
  );
  if (!recientes.size) return { texto, calcados: [] };

  const esCalco = (b: string) =>
    CONTIENE_PREGUNTA.test(b) ? inmediatos.has(normalizar(b)) : recientes.has(normalizar(b));

  const bloques = texto.split(SEPARADOR).map((b) => b.trim()).filter(Boolean);
  const calcados = bloques.filter(esCalco);
  if (!calcados.length) return { texto, calcados: [] };

  const vivos = bloques.filter((b) => !esCalco(b));
  return { texto: vivos.length ? vivos.join("\n---\n") : null, calcados };
}

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

/**
 * `preguntasVigentes`: cuántos de los salientes (desde el más nuevo) salieron
 * DESPUÉS de la última pieza `options` o `quote`. Una pregunta de antes de una
 * lámina o cotización nueva cambió de referente: «¿Le cotizo la 1, la 2 o la
 * 3?» sobre el menú nuevo no es la misma pregunta que sobre el viejo
 * (auditoría 9-nov, 39971: el candado la quitó y salió la lista sin pregunta).
 * Sin el dato, todos cuentan. Solo afecta a los bloques que preguntan.
 */
export function sinBloquesCalcados(
  texto: string,
  salientesRecientes: readonly string[],
  preguntasVigentes: number = salientesRecientes.length,
): ResultadoCalco {
  const aBloques = (s: string) => s.split(SEPARADOR).map(normalizar).filter(Boolean);
  const recientes = new Set(salientesRecientes.flatMap(aBloques));
  const inmediatos = new Set(
    salientesRecientes.slice(0, Math.min(SALIENTES_PARA_PREGUNTAS, preguntasVigentes)).flatMap(aBloques),
  );
  if (!recientes.size) return { texto, calcados: [] };

  const esCalco = (b: string) =>
    CONTIENE_PREGUNTA.test(b) ? inmediatos.has(normalizar(b)) : recientes.has(normalizar(b));

  // LA LISTA REESCRITA TAMBIÉN ES CALCO (replay final del 10-nov, 39971 r1): el
  // Guardián volvió a mandar la lista de opciones que salió hace segundos, en
  // negrita y sin el rótulo «(−60 % en la 2.ª llanta)», pegada a un saludo. Las
  // líneas de lista («1 · …») se comparan sin asteriscos ni paréntesis contra
  // las líneas de lo que ya salió; si se van todas, se va también la línea que
  // las anunciaba («…le dejo las opciones que vimos:»).
  const lineasRecientes = new Set(salientesRecientes.flatMap((m) => m.split("\n")).map(lineaComparable).filter(Boolean));
  const sinListaCalcada = (b: string): string => {
    const lineas = b.split("\n");
    const deLista = lineas.filter((l) => ES_LINEA_DE_LISTA.test(l));
    if (!deLista.length || !deLista.every((l) => lineasRecientes.has(lineaComparable(l)))) return b;
    return lineas
      .filter((l) => !ES_LINEA_DE_LISTA.test(l) && !/[:：]\s*$/.test(l))
      .join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };

  const bloques = texto.split(SEPARADOR).map((b) => b.trim()).filter(Boolean);
  const calcados: string[] = [];
  const vivos: string[] = [];
  for (const b of bloques) {
    if (esCalco(b)) { calcados.push(b); continue; }
    const recortado = CONTIENE_PREGUNTA.test(b) ? b : sinListaCalcada(b);
    if (recortado !== b) calcados.push(b);
    if (recortado) vivos.push(recortado);
  }
  if (!calcados.length) return { texto, calcados: [] };

  // SI NO QUEDA NINGUNA PREGUNTA, QUEDA LA DEL MENÚ: es la pregunta del turno
  // mientras el menú siga abierto (39971 r1: salió la lista sin pregunta; en el
  // simulador, un «La más económica es…» también quedaba sin ella). Solo la del
  // menú («¿Le cotizo la 1…?», «¿Cuál le cotizo…?»); la del local o la del día
  // repetidas siguen yéndose (39561).
  const sinPregunta = vivos.every((v) => !CONTIENE_PREGUNTA.test(v));
  const delMenu = calcados.filter((b) => PREGUNTA_DEL_MENU.test(b) && !ES_LINEA_DE_LISTA.test(b)).pop();
  if (sinPregunta && delMenu && !vivos.includes(delMenu)) {
    vivos.push(delMenu);
    calcados.splice(calcados.indexOf(delMenu), 1);
  }
  return { texto: vivos.length ? vivos.join("\n---\n") : null, calcados };
}

const ES_LINEA_DE_LISTA = /^\s*\*?\d+\s*[·.)-]\s*\S/;
const PREGUNTA_DEL_MENU = /¿\s*(?:le\s+cotizo\s+la\s+\d|cu[aá]l\s+le\s+cotizo)/i;
/** Una línea para comparar: sin negritas, sin lo que va entre paréntesis, sin espacios de más. */
function lineaComparable(linea: string): string {
  return normalizar(linea.replace(/\*/g, "").replace(/\s*\([^)]*\)/g, ""));
}

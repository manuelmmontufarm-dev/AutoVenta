/**
 * «LA DOS», «OPCIÓN TRES», «EL UNO»: LA POSICIÓN DEL MENÚ ESCRITA CON LETRAS.
 *
 * Capacitación de Competimotor, 20-nov-2026 (Carlos, asesor): el bot mandó la
 * lámina con 3 opciones, preguntó «¿Le cotizo la 1, la 2 o la 3?», el cliente
 * contestó «uno» y el bot le volvió a hacer la misma pregunta.
 *
 * La familia: TODOS los lectores de «cuál eligió» (`posicionElegida`,
 * `respuestaDePreferencia`, `esRespuestaDelMenuDePreferencia`,
 * `eligePosicionDelMenu`, `soloAcuseOCantidad`, el candado de
 * `generar_cotizacion`, los seguimientos) se escribieron para el DÍGITO. Con
 * letras pasaba lo peor: «la dos» no elegía en ninguno, y `soloAcuseOCantidad`
 * lo leía como CANTIDAD («la» y «dos» son palabras de cantidad) — así el
 * Guardián marcaba «menú sin elegir» y repreguntaba.
 *
 * El arreglo no agrega un lector más: traduce la palabra al dígito ANTES de
 * que lean, y los de siempre deciden igual que con «la 2».
 *
 * LA TRAMPA: «dos» y «uno» también son cantidades. Por eso:
 *  - Con artículo u «opción» delante («la dos», «el tres», «opción uno»,
 *    «número dos») es una posición: nadie pide «la dos» llantas. Queda fuera
 *    lo que sigue con una cosa contada o una fecha («el dos de diciembre»).
 *  - La palabra PELADA («dos», «uno porfa») solo se traduce si el que llama
 *    sabe que el menú está abierto (`menuAbierto`): es exactamente lo que se
 *    hace con el «2» pelado, que solo elige si lo último fue el menú.
 *  - Con verbo y sin artículo («quiero dos», «mejor dos», «mejor solo uno»,
 *    «solo dos») NO se toca: eso es cuántas, y lo sigue leyendo
 *    `extractExplicitQuantity` como siempre.
 *  - «una» no se traduce: «la una» es una hora y «una» suele ser una llanta.
 */

const DIGITO: Record<string, string> = { uno: "1", dos: "2", tres: "3" };

/**
 * La palabra en posición de menú, dentro de cualquier frase. No toca lo que
 * sigue con una cosa contada («la dos llantas»), una fecha («el dos de
 * diciembre») ni el plural («las dos» pide ver ambas: `\bla\b` no calza «las»).
 */
const POSICION_EN_LETRAS =
  /\b((?:la|el|opci[oó]n|n[uú]mero|nro|num)(?:\s+(?:opci[oó]n|n[uú]mero))?)\s+(uno|dos|tres)\b(?!\s+(?:llantas?|unidades?|juegos?|pares?|de|del|y\s+media)\b)/gi;

/** Lo que no cambia el sentido de una respuesta seca. Se quita para ver el núcleo. */
const CORTESIA =
  /\b(?:por\s+favor|porfa(?:vor)?|porfis|xfa|pls|plis|muchas\s+gracias|gracias|hola|buen[oa]s?(?:\s+(?:dias|tardes|noches))?|ok|okey|oki|dale|listo|si|perfecto|bueno|ya|amig[oa]|senor(?:it)?a?|veci|jefe|entonces)\b/g;

/**
 * Verbos de elección: solo se quitan cuando hay artículo («quiero la dos»). Sin
 * artículo («quiero dos») el verbo es justamente lo que dice que es cantidad.
 */
const VERBO_DE_ELECCION =
  /\b(?:quiero|quisiera|prefiero|dame|deme|me\s+quedo\s+con|me\s+llevo|mejor|solo|nomas|cotic\w*|cotiz\w*|mande\w*|manda\w*|envie\w*|voy\s+con|vamos\s+con|elijo|escojo|seria|que\s+sea|esa\s+es|creo\s+que)\b/g;

const normalizar = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface OpcionesDeLectura {
  /**
   * Lo último que dijimos (o lo que el cliente citó) fue la pregunta de elegir.
   * Solo así la palabra pelada («dos») se lee como la posición.
   */
  menuAbierto?: boolean;
}

/**
 * El texto con la posición escrita en dígitos, listo para los lectores de
 * siempre. Si el mensaje entero es la elección («la dos porfa», «quiero la
 * opción tres», «Uno 👍» con el menú abierto) devuelve la forma seca «la N»,
 * que es la que todos entienden. Si trae más cosas («la dos con tarjeta
 * cuánto sale»), solo cambia la palabra por el número y deja el resto. Si no
 * hay posición, devuelve el texto tal cual.
 */
export function opcionEnDigitos(texto: string, opciones: OpcionesDeLectura = {}): string {
  if (!texto) return texto;
  const enDigitos = texto.replace(POSICION_EN_LETRAS, (_m, articulo: string, palabra: string) =>
    `${articulo} ${DIGITO[palabra.toLowerCase()]}`);

  // ¿El mensaje entero (las líneas de la ráfaga incluidas) es la elección?
  // Solo si se tradujo una palabra: el dígito escrito por el cliente sigue
  // exactamente como estaba, con sus lectores de siempre.
  const base = normalizar(enDigitos)
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(CORTESIA, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (enDigitos !== texto) {
    const seca = base.replace(VERBO_DE_ELECCION, " ").replace(/\s+/g, " ").trim()
      .match(/^(la|el)?\s*(?:(?:opcion|numero|nro|num)\s+)?([123])$/);
    // Se conserva el artículo que escribió: «el tres» puede ser el día 3, y
    // los lectores de fecha lo tienen que seguir viendo como «el 3».
    if (seca) return `${seca[1] ?? "la"} ${seca[2]}`;
    return enDigitos;
  }

  // La palabra pelada, solo con el menú abierto («dos», «Uno porfa»).
  if (opciones.menuAbierto) {
    const pelada = base.match(/^(uno|dos|tres)$/);
    if (pelada) return DIGITO[pelada[1]];
  }
  return enDigitos;
}

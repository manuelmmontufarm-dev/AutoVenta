/**
 * Las preguntas que le cuestan un turno a la venta y no cambian la respuesta.
 *
 * Joaquín, 26-ago-2026: «que no pregunte cuántas llantas quiere sino que solo
 * cotice 4 de una — nos ahorramos un mensaje; si responden "no, yo quiero 8, 2,
 * 3", ahí se vuelve a mandar con el número que dicen». Y la del nombre venía de
 * antes (caso Eulalia, 19-ago): tres turnos y 1 h 48 min entre el «¿se la
 * cotizo?» y la cotización, porque el modelo se inventó «¿a nombre de quién?».
 *
 * ESTO ES UN CANDADO Y NO UNA LÍNEA DE PROMPT, y la razón está medida. Con la
 * regla puesta en la rúbrica del Ángel Guardián, se le dieron tres borradores
 * con la pregunta prohibida (simulador, 26-ago):
 *
 *   · «¿Cuántas llantas necesita?» → la marcó en ALTA… y su corrección terminó
 *     con «¿Cuántas llantas desea llevar?». Denunció la falta y la repitió.
 *   · «¿A nombre de quién…?»       → la dejó intacta.
 *   · «¿Se la cotizo por 4?»       → la clasificó como otra cosa.
 *
 * El vendedor sí obedece —en las conversaciones completas del simulador cotiza
 * 4 de una, sin preguntar—, pero el guardián reescribe DESPUÉS de todos los
 * candados deterministas y es la última mano que toca el texto. Así que esto
 * corre al final de la cadena, junto al aviso de stock y los números de
 * cotización.
 *
 * Puro y sin base para poder probarlo sin levantar nada.
 */

/**
 * Una oración interrogativa completa, de «¿» a «?».
 *
 * Se recorta la ORACIÓN y no el mensaje: el bot suele decir algo útil antes
 * («la Falken es muy buena opción») y tirar el mensaje entero por una pregunta
 * de más sería peor que la pregunta.
 */
const PREGUNTAS = [
  // «¿Cuántas llantas necesita?», «¿cuántas unidades va a llevar?»
  /¿[^?¿]*\bcu[áa]nt[ao]s?\b[^?¿]*\b(?:llantas?|unidades?|neum[áa]ticos?)\b[^?¿]*\?/gi,
  // «¿Se la cotizo por 4?» — pedir permiso para la cantidad es pedir la
  // cantidad. Ojo: «¿se la cotizo?» a secas NO entra: esa es la pregunta
  // legítima con la que se ofrece una equivalente.
  /¿[^?¿]*\bcotizo\b[^?¿]*\b(?:por|de)\s+\d+[^?¿]*\?/gi,
  // «¿A nombre de quién?», «¿la dejo como cliente final?»
  /¿[^?¿]*\ba nombre de qui[ée]n\b[^?¿]*\?/gi,
  /¿[^?¿]*\bcliente final\b[^?¿]*\?/gi,
];

/**
 * La pregunta con la que NOSOTROS cerramos la recomendación.
 *
 * Vive acá, y no en la plantilla, por dos razones que van juntas. Una: el
 * candado tiene que poder reconocerla para no borrarla, y un candado que
 * importa de `services/` sería la flecha al revés (services → domain, nunca
 * domain → services). Dos: si el texto y la exención viven en archivos
 * distintos, alguien cambia uno y el otro se queda viejo — que es exactamente
 * lo que pasó el 27-ago, cuando la plantilla decía «¿Se la cotizo por 4?» y el
 * candado se la comía sin que nadie los relacionara.
 *
 * Dice «4 llantas» y no «4» a secas por pedido de Manuel (27-ago): un número
 * suelto se lee como precio o como cuotas, y el cliente vuelve a preguntar.
 */
export const CIERRE_COTIZAR = "¿Le cotizo el juego de 4 llantas?";

/**
 * Las preguntas que escribe la casa y el candado no puede tocar.
 *
 * La exención es por coincidencia EXACTA, no por parecido: «¿Se la cotizo por
 * 6?» escrita por el modelo sigue siendo la pregunta que gasta un turno y se
 * sigue yendo. Lo que se exenta es un texto que ya pasó por revisión humana,
 * no una familia de frases.
 */
export const FRASES_NUESTRAS: readonly string[] = [CIERRE_COTIZAR];

export interface TextoDepurado {
  texto: string;
  /** Las preguntas que se quitaron, tal cual estaban. Sirven para el aviso. */
  quitadas: string[];
}

/**
 * Quita del mensaje las preguntas prohibidas y deja la frase legible.
 *
 * Si al sacarlas un bloque queda vacío, el bloque desaparece: un mensaje que
 * solo era una pregunta de más no tiene nada que decir.
 */

/**
 * EL CONECTOR QUE SE QUEDÓ SIN SU PREGUNTA.
 *
 * Simulador, 27-ago-2026, reproduciendo la conv 11901. El borrador decía:
 *
 *   «Perfecto, para Santo Domingo un asesor le confirma si se puede despachar,
 *    costo y tiempo de entrega.
 *    Para avanzar, ¿le cotizo la Kenda KR15 por 4 llantas o prefiere KR33A?»
 *
 * El candado se llevó la pregunta —correcto— y le mandó al cliente el resto tal
 * cual: **«… tiempo de entrega. Para avanzar,»**. Una frase que se corta a la
 * mitad se lee como un bot roto, que es peor que la pregunta de más que este
 * módulo existe para quitar.
 *
 * Se limpia lo que queda del renglón cuando ya no tiene verbo propio: un
 * arranque de frase corto que termina en coma o en dos puntos y nada más.
 */
const CONECTOR_SUELTO =
  /(?:^|(?<=[.!?¡¿\n]))\s*(?:y\s+)?(?:para\s+avanzar|para\s+seguir|para\s+continuar|entonces|as[ií]\s+que|dicho\s+esto|ahora\s+bien|de\s+una|ah[ií]\s+mismo|entonces\s+bien|con\s+eso)\s*[,:;]?\s*(?=\n|$)/gi;

/** Y el residuo más tonto de todos: un renglón que es solo puntuación. */
const RENGLON_SIN_LETRAS = /^[\s,.:;¿?¡!\-–—]*$/;

function limpiarConectoresHuerfanos(texto: string): string {
  return texto
    .split("\n")
    .map((linea) => linea.replace(CONECTOR_SUELTO, "").trimEnd())
    .map((linea) => (RENGLON_SIN_LETRAS.test(linea) ? "" : linea))
    // Una coma o un «y» colgando al final de un renglón que sí tiene texto:
    // «… tiempo de entrega. Para avanzar,» ya cayó arriba, pero «… se la dejo y»
    // no, y se lee igual de roto.
    .map((linea) => linea.replace(/[\s]*(?:,|;|:|\by\b|\bo\b|\bpero\b)\s*$/i, ""))
    .join("\n");
}

export function sinPreguntasProhibidas(texto: string): TextoDepurado {
  const quitadas: string[] = [];
  let salida = texto;
  for (const patron of PREGUNTAS) {
    salida = salida.replace(patron, (encontrada) => {
      if (FRASES_NUESTRAS.includes(encontrada.trim())) return encontrada;
      quitadas.push(encontrada.trim());
      return "";
    });
  }
  if (!quitadas.length) return { texto, quitadas: [] };
  salida = limpiarConectoresHuerfanos(salida);
  salida = salida
    .split("\n")
    .map((linea) => linea.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, "").replace(/^[ \t]+(?=\S)/, ""))
    .filter((linea, i, todas) => linea.trim() !== "" || (i > 0 && todas[i - 1].trim() !== ""))
    .join("\n");
  // Bloques (los '---' del agente) que se quedaron sin contenido.
  salida = salida
    .split(/\n\s*-{3,}\s*\n/)
    .map((bloque) => bloque.trim())
    .filter(Boolean)
    .join("\n---\n");
  return { texto: salida.trim(), quitadas };
}

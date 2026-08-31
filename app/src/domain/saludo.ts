/**
 * Lo primero que el negocio le dice a un cliente empieza con un saludo.
 *
 * El prompt ya lo pide en la sección «El mensaje de entrada», pero un prompt es
 * una intención, no una garantía: basta que el modelo arranque directo con la
 * pregunta por el aro para que el cliente reciba, como primera frase de una
 * llantera con 30 años, un interrogatorio. Esto lo vuelve determinista — se
 * revisa el texto que ya se va a enviar y solo se toca si de verdad falta.
 *
 * Va aquí y no en wa/client.ts porque es puro (sin base ni red) y así se prueba
 * sin levantar nada, mismo criterio que opcionesCandados y aros.
 */

/**
 * Formas en que de verdad saluda la gente en Ecuador al abrir un chat. Se mira
 * solo el arranque del texto: un «buenas» en mitad de una frase no es un saludo.
 * Se permiten emojis y signos de apertura antes de la palabra («¡Hola», «👋 Hola»).
 */
const SALUDO_AL_ARRANQUE =
  /^[\s¡!¿?"'*_~`]*(?:\p{Extended_Pictographic}[\s¡!]*)*(?:hola|buenas|buen(?:os)? d[íi]as|buenas tardes|buenas noches|qu[ée] tal|saludos|mucho gusto|bienvenid[oa])/iu;

/** ¿El texto ya abre con un saludo? Si sí, no se le agrega otro. */
export function yaSaluda(texto: string): boolean {
  return SALUDO_AL_ARRANQUE.test(texto ?? "");
}

/**
 * Primer nombre, para tutear con nombre sin soltarle el apellido completo.
 * Descarta lo que claramente no es un nombre: los pushnames de WhatsApp vienen
 * con cualquier cosa (usuarios, teléfonos, emojis, «angelbarreiro1986»).
 */
export function nombreSaludable(nombre: string | null | undefined): string | null {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  if (primero.length < 2 || primero.length > 20) return null;
  // Solo letras (con tildes y ñ): nada de dígitos, arrobas ni emojis.
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(primero)) return null;
  return primero[0].toUpperCase() + primero.slice(1);
}

/**
 * El texto listo para enviar, con saludo si le faltaba.
 *
 * Se antepone en su propia línea en vez de pegarlo a la frase: así no rompe el
 * ritmo de lo que el modelo escribió ni le mete una coma donde no iba.
 */
export function conSaludo(texto: string, nombre: string | null | undefined): string {
  const limpio = (texto ?? "").trim();
  if (!limpio) return limpio;
  if (yaSaluda(limpio)) return limpio;
  const quien = nombreSaludable(nombre);
  return `${quien ? `¡Hola, ${quien}! 👋` : "¡Hola! 👋"}\n${limpio}`;
}

/**
 * La frase por la que se reconoce que el negocio ya se presentó. Si aparece en
 * el texto, no se vuelve a anteponer nada.
 */
export const FIRMA_DE_PRESENTACION = "Soy el asistente de Depot Tire";

/** Un saludo pelado al arranque, para quitarlo antes de poner la presentación. */
const SALUDO_PELADO =
  /^[\s¡!¿?"'*_~`]*(?:\p{Extended_Pictographic}[\s¡!]*)*(?:hola|buenas|buen(?:os)? d[íi]as|buenas tardes|buenas noches|qu[ée] tal|saludos)(?:\s*,?\s*[\p{L}]+)?\s*[!¡.,:;—-]*\s*(?:\p{Extended_Pictographic}\s*)*/iu;

/**
 * Lo PRIMERO que el negocio le dice a alguien en una conversación es quién es y
 * qué puede hacer por él — no un «hola» suelto ni, peor, la pregunta por el aro.
 *
 * Decisión de Manuel (31-ago-2026): al abrirse la conversación la presentación
 * sale SIEMPRE, incluso cuando el cliente ya mandó la medida en su primer
 * mensaje. En ese caso la presentación encabeza y el turno sigue con lo que
 * toca —las opciones, la cotización—, para no preguntarle un dato que ya dio.
 *
 * Si el modelo abrió con un «hola» propio, se le quita: la presentación ya
 * saluda y dos saludos pegados se leen como un bot tartamudo.
 */
export function presentacionDeApertura(nombre: string | null | undefined): string {
  const quien = nombreSaludable(nombre);
  return `¡Hola${quien ? `, ${quien}` : ""}! 👋 ${FIRMA_DE_PRESENTACION}.`
    + " Le cotizo al instante con stock y precios reales, comparo modelos y le armo"
    + " su cotización para tienda.";
}

export function conPresentacion(texto: string, nombre: string | null | undefined): string {
  const limpio = (texto ?? "").trim();
  if (!limpio) return limpio;
  if (limpio.includes(FIRMA_DE_PRESENTACION)) return limpio;
  const resto = limpio.replace(SALUDO_PELADO, "").trim();
  const cabecera = presentacionDeApertura(nombre);
  return resto ? `${cabecera}\n\n${resto}` : cabecera;
}

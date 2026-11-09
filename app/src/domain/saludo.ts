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
import { negocio, firmaDePresentacion, esPendiente } from "../negocio/index.js";
import { nombresDelNegocio } from "../negocio/identidad.js";
import { esNombreDePila } from "./nombresDePila.js";

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
 * Cómo se escribe una empresa y no una persona: «CAMBICOL S.A.S», «Pérez Cía.
 * Ltda». Una palabra suelta de estas en el perfil basta para no saludar por nombre.
 */
const SUFIJO_DE_EMPRESA = /^(?:s\.?a\.?s?\.?|c\.?a\.?|cia\.?|c[ií]a\.?|ltda\.?|corp\.?|inc\.?|llc|eirl|s\.?r\.?l\.?|group|grupo|cli|cia)$/iu;

/**
 * Palabras de negocio: «Mercedes Benz Repuestos», «Victoria Motors», «Henry Auto
 * Lujos» empiezan con un nombre de pila y son empresas. Si cualquier OTRA
 * palabra del perfil es de estas, se saluda sin nombre.
 */
const PALABRA_DE_NEGOCIO = new Set([
  "motors", "motor", "repuestos", "llantas", "llantera", "taller", "autos", "auto", "carros", "store",
  "bar", "importaciones", "importadora", "benz", "bakery", "lujos", "lujo", "tienda", "ferreteria",
  "comercial", "servicios", "service", "multimarcas", "tapiceria", "restaurant", "restaurante",
  "pizzeria", "cafe", "hotel", "farmacia", "distribuidora", "ventas", "accesorios", "parts",
  "garage", "lubricadora", "mecanica", "vulcanizadora", "constructora", "ingenieria", "yacht",
]);

/** Perfil de más palabras que esto es un negocio o una frase, no un nombre. */
const MAXIMO_DE_PALABRAS_DEL_PERFIL = 4;

/**
 * Primer nombre, para tutear con nombre sin soltarle el apellido completo.
 *
 * ES LA FUENTE ÚNICA de «¿con qué nombre se saluda a este cliente?». Los
 * perfiles de WhatsApp vienen con cualquier cosa (negocios, frases, usuarios,
 * emojis), y el 6–8 nov 16 de 69 saludos no eran una persona: «Hola La»
 * (La Brocheta Burguer), «Hola Tapicería», «Hola Mmmmmm». Solo se usa el nombre
 * si TODO esto se cumple; en la duda se saluda sin nombre, que no cuesta nada:
 *
 *  · el perfil tiene hasta 4 palabras y ninguna es un sufijo de empresa;
 *  · la primera palabra son solo letras (los emojis de cola se ignoran),
 *    de 2 a 20, sin una letra repetida 4+ veces seguidas y no escrita toda
 *    en mayúsculas (siglas y nombres de marca);
 *  · y esa primera palabra es un nombre de pila de la lista de
 *    `nombresDePila.ts` (con o sin tilde, o su diminutivo).
 */
const sinTildesDe = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

export function nombreSaludable(nombre: string | null | undefined): string | null {
  const palabras = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!palabras.length || palabras.length > MAXIMO_DE_PALABRAS_DEL_PERFIL) return null;
  if (palabras.some((palabra) => SUFIJO_DE_EMPRESA.test(palabra))) return null;
  if (palabras.slice(1).some((palabra) => PALABRA_DE_NEGOCIO.has(sinTildesDe(palabra).toLowerCase()))) return null;
  // «Tatiana🌷» → «Tatiana»: el adorno de cola no es parte del nombre.
  const primero = palabras[0].replace(/[^\p{L}\p{N}]+$/u, "");
  if (primero.length < 2 || primero.length > 20) return null;
  // Solo letras (con tildes y ñ): nada de dígitos, arrobas ni emojis.
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(primero)) return null;
  if (primero === primero.toUpperCase()) return null;
  if (/(\p{L})\1{3,}/iu.test(primero)) return null;
  if (!esNombreDePila(primero)) return null;
  return primero[0].toUpperCase() + primero.slice(1).toLowerCase();
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
// Joaquín, 14-sep-2026 (grupo «Depot tire arreglos»): «que se presente como una
// persona, tipo "mi nombre es Martín", para que la conversación se sienta más
// directa y personalizada». Manuel lo consultó y quedó: persona, nombre alegre,
// Martín. Desde el 24-sep el nombre lo pone el perfil del negocio: cada cliente
// tiene el suyo y el bot no puede presentarse con el de otro.
export const NOMBRE_DEL_VENDEDOR = negocio.vendedor.nombre;
export const FIRMA_DE_PRESENTACION = firmaDePresentacion(negocio);

const sinTildes = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapar = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ¿Este texto es la presentación del negocio? Reconoce la firma de hoy y la
 * anterior («Soy el asistente de <negocio>»), que sigue en el historial de los
 * chats abiertos antes del cambio. Recibe el texto ya sin tildes.
 *
 * Cada marca comercial se reconoce por su PRIMERA palabra («depot» de «Depot
 * Tire»): basta para identificarla y aguanta que el modelo escriba el resto
 * del nombre distinto o lo abrevie. Con varias identidades, un patrón por
 * marca: «soy el asistente de mundillantas…» y «…de competimotor…» son la
 * misma presentación. Un vendedor todavía `[PENDIENTE]` no entra al patrón:
 * con él, la firma que sale es «Soy el asistente de <frase>».
 */
const PRIMERAS_PALABRAS_DEL_NEGOCIO = nombresDelNegocio(negocio)
  .map((nombre) => escapar(sinTildes(nombre.split(/\s+/)[0]).toLowerCase()))
  .join("|");

export const ES_PRESENTACION_DEL_NEGOCIO = new RegExp(
  `\\bsoy\\s+(?:el\\s+asistente\\s+de${
    esPendiente(NOMBRE_DEL_VENDEDOR) ? "" : `|${escapar(sinTildes(NOMBRE_DEL_VENDEDOR).toLowerCase())},?\\s+de`
  })`
  + `\\s+(?:${PRIMERAS_PALABRAS_DEL_NEGOCIO})\\b`,
  "i",
);

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
  if (ES_PRESENTACION_DEL_NEGOCIO.test(limpio.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return limpio;
  const resto = limpio.replace(SALUDO_PELADO, "").trim();
  const cabecera = presentacionDeApertura(nombre);
  return resto ? `${cabecera}\n\n${resto}` : cabecera;
}

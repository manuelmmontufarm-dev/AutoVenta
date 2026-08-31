/**
 * ¿El mensaje de entrada es solo un saludo, sin un dato con el que trabajar?
 *
 * Hasta el 31-ago esto era una LISTA CERRADA de frases exactas: entraban «hola»
 * y «buenos dias» por separado, pero no «hola buenos dias», que es como saluda
 * media Quito. Medido en producción ese mismo día (conv 3, ciclos 36-38):
 * «hola» recibió la bienvenida, y «Hola, buenos días» y «hola buenos dias»
 * recibieron la guía de medidas sin una palabra de presentación.
 *
 * Ahora se razona en vez de listar: se le quita al texto el saludo y la
 * cortesía, y lo que sobra decide. Si no sobra nada —o sobra solo un pedido
 * genérico de precios o información— es un saludo y le toca la bienvenida. Si
 * sobra cualquier dato con el que se pueda vender (una medida, un aro, un año,
 * una marca, un vehículo), manda el agente, que sabe aprovecharlo.
 */

/** Sin tildes, sin puntuación, en minúsculas y con los espacios normalizados. */
function normalizar(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Las formas de saludar que llegan de verdad, incluidas las alargadas
 * («holaaa») y las del anuncio de Meta. Se quitan del ARRANQUE, tantas veces
 * como haga falta: «hola buenos dias» son dos saludos pegados.
 */
const SALUDOS = [
  "hola+", "holi+", "buenas", "buenos dias", "buen dia", "buenas tardes",
  "buenas noches", "buenas tardes noches", "que tal", "que mas", "saludos",
  "mucho gusto", "un gusto", "buen dia tenga", "hey", "hi", "hello",
  "muy buenos dias", "muy buenas tardes", "muy buenas noches", "muy buenas",
];

/** Cortesía y relleno que no aporta ningún dato: «disculpe», «por favor». */
const RELLENO = [
  "disculpe", "disculpa", "perdon", "por favor", "porfa", "gracias",
  "como esta", "como estan", "como le va", "que tal esta",
  "senor", "senorita", "senora", "amigo", "estimado", "estimados",
  "buenas nuevamente", "de nuevo", "una consulta", "consulta",
  "una pregunta", "pregunta", "quisiera", "quiero", "necesito", "busco",
  "me gustaria", "podria", "puede", "me puede", "ayuda", "ayudame",
  "me ayuda", "informacion", "mas informacion", "info", "mas info",
];

const alternativa = (frases: readonly string[]) =>
  frases.slice().sort((a, b) => b.length - a.length).join("|");

const SALUDO_AL_ARRANQUE = new RegExp(`^(?:${alternativa(SALUDOS)})\\b\\s*`);
const RELLENO_AL_ARRANQUE = new RegExp(`^(?:${alternativa(RELLENO)})\\b\\s*`);

/**
 * Lo que queda del mensaje después de quitarle saludos y cortesía por delante.
 * Devuelve `null` si el texto NO empieza con un saludo: «tengo una Hilux» no es
 * un saludo aunque después no traiga medida, y ahí el agente hace mejor trabajo.
 */
function loQueSobraTrasElSaludo(text: string): string | null {
  let resto = normalizar(text);
  if (!SALUDO_AL_ARRANQUE.test(resto)) return null;
  let antes = "";
  while (resto !== antes) {
    antes = resto;
    resto = resto.replace(SALUDO_AL_ARRANQUE, "").replace(RELLENO_AL_ARRANQUE, "");
  }
  return resto;
}

/**
 * Marcas del catálogo: nombrarlas es un dato de venta, no un saludo. «Hola,
 * ¿precio de la Kenda?» tiene que llegarle al agente para que la busque.
 */
const MARCAS = [
  "kenda", "falken", "winrun", "michelin", "bridgestone", "goodyear", "pirelli",
  "continental", "hankook", "yokohama", "dunlop", "toyo", "maxxis", "nexen",
  "kumho", "bfgoodrich", "firestone", "apollo", "linglong", "triangle",
  "aeolus", "westlake", "chaoyang", "sailun", "roadstone", "gt radial",
];

/**
 * Palabras que describen el vehículo o el uso: también son un dato. El agente
 * puede recomendar por vehículo sin que el cliente sepa su medida.
 */
const VEHICULO_O_USO = [
  "camioneta", "camion", "auto", "carro", "vehiculo", "moto", "furgoneta",
  "montacargas", "tractor", "bus", "buseta", "4x4", "suv", "jeep", "taxi",
  "aro", "rin", "llanta de", "para mi", "tengo un", "tengo una",
];

/** Servicios que no son la venta de llantas: los atiende el agente. */
const OTROS_SERVICIOS = [
  "aceite", "alineacion", "balanceo", "enllantaje", "frenos", "suspension",
  "amortiguador", "bateria", "reencauche", "parche", "pinchazo",
];

/** ¿Sobra algo con lo que ya se pueda vender? */
function traeUnDatoDeVenta(resto: string): boolean {
  // Un número casi siempre es una medida, un aro, un año o un modelo.
  if (/\d/.test(resto)) return true;
  const tiene = (lista: readonly string[]) => lista.some((p) => resto.includes(p));
  return tiene(MARCAS) || tiene(VEHICULO_O_USO) || tiene(OTROS_SERVICIOS);
}

/**
 * Lo que sobra y NO es un dato, pero sí una pregunta comercial genérica: «a
 * cuánto están las llantas», «qué precios manejan». La bienvenida es justo la
 * respuesta correcta —sin medida no hay precio— y así lo dice.
 *
 * Se comprueba palabra por palabra contra este vocabulario en vez de con un
 * patrón: cualquier palabra de fuera (una marca, un vehículo, un modelo) hace
 * que el turno le toque al agente. Es la forma conservadora de equivocarse.
 */
const PALABRAS_SIN_DATO = new Set([
  // Artículos, preposiciones y conectores.
  "de", "del", "sobre", "por", "el", "la", "lo", "los", "las", "un", "una",
  "unos", "unas", "sus", "su", "mi", "me", "y", "o", "en", "para", "con", "a",
  "al", "que", "es", "son", "esta", "estan", "hay", "se", "si", "no", "tambien",
  // La pregunta comercial en sí.
  "precio", "precios", "valor", "valores", "costo", "costos", "tarifa",
  "tarifas", "cotizar", "cotizacion", "cotizaciones", "proforma", "cuanto",
  "cuantos", "cuesta", "cuestan", "vale", "valen", "sale", "salen",
  "tienen", "tiene", "venden", "vende", "manejan", "maneja", "disponible",
  "disponibles", "disponibilidad", "stock", "saber", "ver", "conocer", "tener",
  "dar", "pasar", "mandar", "enviar", "hoy", "ahora",
  // El producto, dicho en genérico.
  "llanta", "llantas", "neumatico", "neumaticos", "rueda", "ruedas",
  "caucho", "cauchos", "juego", "juegos",
]);

const soloPalabrasSinDato = (resto: string) =>
  resto.split(" ").filter(Boolean).every((p) => PALABRAS_SIN_DATO.has(p));

/**
 * Solo toma saludos y el texto genérico de los anuncios de Meta.
 * Si el cliente ya dijo producto, vehículo, medida o pregunta concreta, el
 * agente conserva el turno para poder entenderlo y actuar sobre el catálogo.
 */
export function isGenericFirstContact(text: string): boolean {
  const resto = loQueSobraTrasElSaludo(text);
  if (resto === null) return esPedidoGenericoSinSaludo(text);
  if (!resto) return true;
  if (traeUnDatoDeVenta(resto)) return false;
  return soloPalabrasSinDato(resto);
}

/**
 * El anuncio de Meta manda «quiero más información» sin saludo por delante.
 * Sigue entrando, igual que antes, siempre que no traiga ningún dato.
 */
function esPedidoGenericoSinSaludo(text: string): boolean {
  let resto = normalizar(text);
  if (!RELLENO_AL_ARRANQUE.test(resto)) return false;
  let antes = "";
  while (resto !== antes) {
    antes = resto;
    resto = resto.replace(RELLENO_AL_ARRANQUE, "").replace(SALUDO_AL_ARRANQUE, "");
  }
  if (traeUnDatoDeVenta(resto)) return false;
  return soloPalabrasSinDato(resto);
}

/**
 * Entrada estable y sin IA: se presenta, dice qué sabe hacer y deja claras las
 * TRES puertas (medida escrita, foto del costado, vehículo) antes de pedir
 * nada. Texto aprobado por Manuel el 31-ago-2026 — cambiarlo se consulta.
 */
export function firstContactReply(): string {
  return [
    "¡Hola! 👋 Soy el asistente de Depot Tire. Le cotizo al instante con stock y precios reales, comparo modelos y le armo su cotización para tienda.",
    "",
    "Puede mandarme la medida escrita, una foto del costado de la llanta o decirme su vehículo.",
    "",
    "¿Qué medida usa? Ej: 225/65R17",
  ].join("\n");
}

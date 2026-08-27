/**
 * LA UBICACIÓN NO ESPERA SU TURNO EN EL EMBUDO.
 *
 * Manuel, 27-ago-2026: «si preguntan directamente que dónde estamos ubicados, o
 * si son de una provincia o un lugar, que solo mande los links con las
 * ubicaciones que siempre mandamos para que vean rápido — porque no siempre la
 * cotización va a ir en el orden que queremos: muchas veces preguntan la
 * ubicación antes de querer saber el rin».
 *
 * Los dos casos que lo motivaron, los dos en la conv 11901 del 27-ago:
 *
 *   15:27  CLIENTE: «De donde son»
 *          BOT: «Son *Kenda*; el origen exacto se lo confirma el asesor…»
 *   15:28  CLIENTE: «Soy de provincia de santo domingo»
 *          BOT: «…atendemos en *Cumbayá* y *Quito Sur*»   ← sin un solo link
 *   15:29  EL ASESOR, a mano: «Mil disculpas, nuestros locales son en el sur de
 *          quito y en cumbaya»
 *
 * En los dos turnos el bot habló de los locales y no mandó el mapa, y tuvo que
 * entrar un humano a decir dónde quedan. La regla del playbook existía
 * («la ubicación se manda con ubicacion_locales»), pero un prompt es una
 * petición: acá se vuelve candado.
 *
 * Puro a propósito: se prueba sin base y sin modelo.
 */

const normalizar = (texto: string) =>
  (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * El cliente PIDE la ubicación. Acá el link sale siempre, aunque ya se lo
 * hayamos mandado: si vuelve a preguntar es porque no lo encontró.
 *
 * «De dónde son» entra a propósito. En la conv 11901 el modelo lo leyó como el
 * ORIGEN DE LA LLANTA y contestó «Son Kenda». Es ambiguo para un humano
 * también, y por eso la respuesta correcta es la que sirve para las dos
 * lecturas: mandar el mapa cuesta un renglón y contesta la pregunta que el
 * cliente casi siempre está haciendo.
 */
const PIDE_UBICACION =
  /\b(?:donde\s+(?:estan|esta|queda|quedan|se\s+encuentran|los?\s+encuentro|es|son)|de\s+donde\s+son|en\s+que\s+parte|por\s+donde\s+(?:estan|quedan)|como\s+llego|como\s+llegar|la\s+direccion|su\s+direccion|direccion\s+del?\s+local|me\s+(?:manda|pasa|comparte|envia)\s+(?:la\s+)?ubicacion|la\s+ubicacion|su\s+ubicacion|ubicacion\s+del?\s+local|el\s+mapa|en\s+maps|google\s+maps|tienen\s+(?:local|locales|sucursal|sucursales|tienda|tiendas)|donde\s+(?:los|las|te|le)\s+ubico)\b/;

/**
 * Provincias y ciudades del Ecuador que la gente nombra al decir de dónde es.
 *
 * No están para resolver una distancia: están para saber que el cliente acaba
 * de hablar de GEOGRAFÍA, que es el momento en que el mapa vale. Quito y sus
 * sectores quedan fuera de esta lista a propósito — nombrar «Cumbayá» dentro de
 * la conversación de la visita es lo normal y mandarle el mapa cada vez sería
 * el ruido que este candado quiere evitar; para eso está `mencionaOtraCiudad`,
 * que mira lo que está LEJOS.
 */
const CIUDADES_Y_PROVINCIAS = [
  "santo domingo", "tsachilas", "guayaquil", "cuenca", "ambato", "riobamba",
  "ibarra", "loja", "manta", "portoviejo", "machala", "esmeraldas", "quevedo",
  "milagro", "babahoyo", "latacunga", "tulcan", "otavalo", "salinas", "duran",
  "santa elena", "el oro", "los rios", "manabi", "imbabura", "carchi", "azuay",
  "chimborazo", "tungurahua", "cotopaxi", "bolivar", "canar", "sucumbios",
  "napo", "pastaza", "orellana", "morona", "zamora", "galapagos", "guaranda",
  "puyo", "tena", "macas", "coca", "lago agrio", "nueva loja", "banos",
  "playas", "atacames", "pedernales", "chone", "jipijapa", "ventanas",
  "la libertad", "samborondon", "daule", "sangolqui", "machachi", "cayambe",
  "el carmen", "la concordia", "quininde", "san lorenzo", "huaquillas",
];

/** «Soy de X», «vivo en X», «estoy por X»: está diciendo de dónde escribe. */
const DICE_DE_DONDE_ES =
  /\b(?:soy\s+de|vivo\s+en|estoy\s+en|estoy\s+por|vengo\s+de|escribo\s+desde|me\s+queda\s+lejos|resido\s+en|radico\s+en|provincia\s+de|desde\s+la\s+provincia|aca\s+en|aqui\s+en)\b/;

/**
 * ¿El cliente nombró una ciudad o provincia fuera de Quito, o dijo de dónde es?
 *
 * Los dos juntos y no uno solo: «soy de Ambato» y «Ambato» sueltos valen igual,
 * pero «soy de aquí» también cuenta — está ubicándose, y ahí el mapa contesta.
 */
export function mencionaOtraCiudad(texto: string): boolean {
  const n = normalizar(texto);
  if (CIUDADES_Y_PROVINCIAS.some((lugar) => n.includes(lugar))) return true;
  return DICE_DE_DONDE_ES.test(n);
}

/** ¿Pidió la ubicación con todas las letras? */
export function pideUbicacion(texto: string): boolean {
  return PIDE_UBICACION.test(normalizar(texto));
}

export type MotivoDeUbicacion = "la_pidio" | "hablo_de_su_ciudad" | null;

/**
 * Qué le toca a este mensaje del cliente.
 *
 * - `la_pidio`: preguntó dónde quedan. El mapa sale SIEMPRE, repetido o no.
 * - `hablo_de_su_ciudad`: nombró un lugar. El mapa sale si nunca se lo mandamos.
 * - `null`: la conversación no habla de geografía; no se toca nada.
 */
export function motivoDeUbicacion(mensajeDelCliente: string): MotivoDeUbicacion {
  if (!mensajeDelCliente?.trim()) return null;
  if (pideUbicacion(mensajeDelCliente)) return "la_pidio";
  if (mencionaOtraCiudad(mensajeDelCliente)) return "hablo_de_su_ciudad";
  return null;
}

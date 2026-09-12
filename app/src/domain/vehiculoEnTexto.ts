/**
 * ¿EL CLIENTE NOMBRÓ SU CARRO EN ESTE MENSAJE?
 *
 * Existe para una decisión concreta: cuando el mensaje trae el aro Y el
 * vehículo, quién contesta. Hasta el 11-sep-2026 contestaba la ruta del aro,
 * que muestra tres llantas cualesquiera de ese aro y después las cotiza; el
 * resultado fueron siete cotizaciones en medidas que no le entran al carro
 * (convs 17668, 17711, 18106, 18121, 18262, 18555, 18684).
 *
 * La herramienta de fitment ya sabe hacer esto bien —investiga las medidas de
 * fábrica y tiene prohibido cotizar sobre una medida deducida— pero nunca
 * llegaba a correr. Con el vehículo sobre la mesa, el turno es suyo.
 *
 * Las marcas y los modelos salen de `domain/fitment.ts`, la misma tabla que
 * usa la investigación: una segunda lista de autos aquí se habría separado de
 * aquélla en un mes. Lo único propio es el puñado de modelos que la gente
 * nombra sin que estén en la tabla, y las palabras de carrocería que ya
 * implican un vehículo aunque no digan cuál.
 */
import { fitmentTable, palabrasDeModelo } from "./fitment.js";

/**
 * Palabras que nombran un vehículo sin decir marca ni modelo. «Camioneta» no
 * alcanza para deducir una medida, pero sí alcanza para saber que una llanta
 * de turismo está mal (conv 18519: «camioneta dacsun rin 14» → 185/60R14 de
 * auto; conv 18504: Hilux → 205/55R16).
 */
const CARROCERIAS = [
  "camioneta", "camionetas", "furgoneta", "furgon", "camion", "buseta", "buseton",
  "jeep", "jeepeta", "suv", "todoterreno", "4x4", "doble cabina",
];

/**
 * Modelos que la gente nombra y que la tabla de fitment todavía no trae, CON
 * LAS FALTAS DE ORTOGRAFÍA REALES. Salen de los chats: «es para una dimax»
 * (conv 18857), «camioneta dacsun rin 14» (18519), «Clasico B13» (18543).
 * Escribirlos bien no sirve de nada si el cliente los escribe así.
 */
const MODELOS_EXTRA = [
  "b13", "b15", "dmax", "d max", "dimax", "dmaxx", "luv", "vitara", "montero", "trooper",
  "x35", "aveo", "spark", "sail", "corsa", "esteem", "forsa", "prado",
  "qashqai", "cashcai", "duster", "stonic", "creta", "raize", "t8",
  "dacsun", "datsun", "arrizo", "sportero", "terios", "bt50", "npr",
];

const normalizar = (texto: string): string =>
  (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Marcas y modelos de la tabla, ya normalizados. Se calcula una vez: la tabla
 * se carga de un JSON y no cambia en caliente.
 */
let cacheTerminos: string[] | null = null;

function terminos(): string[] {
  if (cacheTerminos) return cacheTerminos;
  const fuera = new Set(["hino", "jac", "byd", "jmc", "gwm"]);
  const lista = new Set<string>();
  for (const ficha of fitmentTable()) {
    // La marca entra entera y también los alias entre paréntesis
    // («great wall (gwm)»).
    for (const trozo of normalizar(ficha.make).split(" ")) {
      if (trozo.length >= 4 && !fuera.has(trozo)) lista.add(trozo);
    }
    // El modelo puede venir con barras («yaris sedan / hatchback») y con
    // palabras de versión; `palabrasDeModelo` las limpia igual que la
    // búsqueda de fitment.
    for (const alias of ficha.model.split("/")) {
      for (const palabra of palabrasDeModelo(alias)) {
        if (palabra.length >= 4) lista.add(palabra);
      }
    }
  }
  for (const extra of MODELOS_EXTRA) lista.add(normalizar(extra));
  cacheTerminos = [...lista];
  return cacheTerminos;
}

/**
 * Marcas de LLANTA. Comparten el campo de juego con las de carro y alguna se
 * parece («general» es una marca de llanta, no un modelo), así que se excluyen
 * explícitamente antes de decidir.
 */
const MARCAS_DE_LLANTA = new Set([
  "kenda", "falken", "winrun", "michelin", "bridgestone", "pirelli", "goodyear",
  "continental", "hankook", "yokohama", "dunlop", "maxxis", "bfgoodrich", "venom",
  "general", "wildpeak", "azenis", "maxclaw", "aplus", "sunfull", "triangle",
]);

export function mencionaVehiculo(texto: string | null | undefined): boolean {
  const n = normalizar(texto ?? "");
  if (!n) return false;
  const palabras = n.split(" ").filter(Boolean);
  const utiles = palabras.filter((p) => !MARCAS_DE_LLANTA.has(p));
  if (!utiles.length) return false;
  const limpio = ` ${utiles.join(" ")} `;
  if (CARROCERIAS.some((c) => limpio.includes(` ${c} `))) return true;
  return terminos().some((t) => limpio.includes(` ${t} `));
}

/**
 * DÓNDE ESTÁ EL CLIENTE, Y SI PIENSA VENIR.
 *
 * Depot atiende en Cumbayá y Quito Sur. Todo lo demás del país es un cliente
 * que no puede «pasar por el local», y la familia más grande de la auditoría
 * del 8 al 11-sep (31 errores) es justamente esa: el cliente dice dónde está,
 * el bot lo entiende y contesta bien, y un segundo después le pega igual la
 * pregunta del local.
 *
 *   conv 18106 · CLIENTE: «Estoy en guayaquil»
 *                BOT: «En Guayaquil no tenemos local de atención…»
 *                BOT: «¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*? 📍»
 *
 * La segunda línea no la escribe el modelo: la pega un candado de cierre que
 * solo mira si falta el dato, no de dónde escribe el cliente.
 *
 * SON TRES ESTADOS, NO DOS. «Fuera de Quito» no significa que no venga:
 *
 *  · `cobertura` — está en Quito o el valle. Todo normal.
 *  · `viene`     — está fuera PERO anuncia que sube a Quito (conv 18821: «Soy
 *                  de Santo Domingo» … «Yo el lunes voy a estar en quito»;
 *                  conv 18221: «Yo les aviso el día que suba a la ciudad de
 *                  Quito»). Acá el local SÍ corresponde: viene él.
 *  · `fuera`     — está fuera y no dijo que venga. Ni local, ni mapas, ni
 *                  «¿qué día puede pasar?». Lo que corresponde es el asesor y,
 *                  si aplica, el envío.
 *
 * Puro y sin base: entra el texto del cliente, sale dónde está. Quien decida
 * qué hacer con eso es quien llama.
 */

const normalizar = (t: string): string =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Las ciudades y provincias que NO son Quito, con las formas en que la gente
 * las escribe. Cada una salió de un chat real o es una capital provincial que
 * va a aparecer tarde o temprano.
 *
 * El nombre canónico es el que se le muestra al cliente («En Santo Domingo no
 * tenemos local»), así que va escrito como se dice, no como se teclea.
 */
const FUERA: readonly (readonly [string, RegExp])[] = [
  ["Guayaquil", /\bguayaquil\b|\bgye\b/],
  ["Cuenca", /\bcuenca\b/],
  ["Santo Domingo", /\bsanto\s*domingo\b|\bsto\.?\s*domingo\b|\btsachilas\b/],
  ["Esmeraldas", /\besmeraldas?\b|\besmeralda\b|\bsan\s*lorenzo\b|\batacames\b/],
  ["Ibarra", /\bibarra\b/],
  ["Tulcán", /\btulcan\b/],
  ["Loja", /\bloja\b/],
  ["Ambato", /\bambato\b/],
  ["Riobamba", /\briobamba\b/],
  ["Manta", /\bmanta\b/],
  ["Portoviejo", /\bportoviejo\b/],
  ["Machala", /\bmachala\b/],
  ["Quevedo", /\bquevedo\b/],
  ["Latacunga", /\blatacunga\b/],
  ["Babahoyo", /\bbabahoyo\b/],
  ["Salinas", /\bsalinas\b/],
  ["Milagro", /\bmilagro\b/],
  ["Duran", /\bdur[aá]n\b/],
  ["Otavalo", /\botavalo\b/],
  ["Puyo", /\bpuyo\b/],
  ["Tena", /\btena\b/],
  ["Lago Agrio", /\blago\s*agrio\b|\bnueva\s*loja\b/],
  ["Coca", /\bel\s*coca\b|\bfrancisco\s*de\s*orellana\b/],
  ["Baños", /\bbanos\b/],
  ["Salém", /\bsalcedo\b/],
  ["Cayambe", /\bcayambe\b/],
  ["Santa Elena", /\bsanta\s*elena\b|\blibertad\b/],
];

/** Lo que SÍ es cobertura: Quito y el valle. */
const COBERTURA = /\bquito\b|\bcumbaya\b|\btumbaco\b|\bvalle\s*de\s*los\s*chillos\b|\bchillos\b|\bsangolqui\b|\bconocoto\b|\bpuembo\b|\bcalderon\b|\bpomasqui\b|\bel\s*condado\b/;

/**
 * Está diciendo DÓNDE ESTÁ, no nombrando un lugar de paso. «Soy de», «estoy
 * en», «vivo en», «por acá en», o el nombre solo cuando el mensaje es corto.
 */
const DICE_DONDE_ESTA =
  /\b(?:soy|somos)\s+de\b|\best(?:oy|amos)\s+(?:en|por)\b|\bviv(?:o|imos)\s+(?:en|por)\b|\bac[aá]\s+en\b|\bdesde\b|\bpara\b|\bprovincia\s+(?:de\s+)?\b|\bciudad\s+de\b|\ben\s+la\s+ciudad\b/;

/**
 * Anuncia que viene a Quito. Es lo que distingue al cliente de Santo Domingo
 * que va a pasar el lunes del que nunca va a poder ir.
 */
const VIENE_A_QUITO =
  /\b(?:voy|vamos|ire|iremos|estare|estaremos|paso|pasare|subo|subire|viajo|viajare|bajo|vengo|vendre)\b[^.?!]{0,40}\b(?:a|por|en|hasta|hacia)?\s*\b(?:quito|cumbaya|tumbaco)\b|\b(?:suba|subir|venir|ir|pasar|viajar)\b[^.?!]{0,30}\b(?:a\s+)?(?:la\s+)?(?:ciudad\s+de\s+)?(?:quito|cumbaya)\b|\bcuando\s+(?:este|vaya|suba|baje)\b[^.?!]{0,25}\bquito\b/;

/** Niega estar o ir a Quito: «no vivo en Quito», «no viajo a Quito». */
const NIEGA_QUITO = /\bno\s+(?:viv|estoy|soy|viaj|voy|subo|paso|puedo\s+ir)\w*\b[^.?!]{0,25}\bquito\b/;

export interface DondeEsta {
  /** `fuera` = no puede pasar por el local. `viene` = está fuera pero sube. */
  estado: "cobertura" | "viene" | "fuera";
  /** La ciudad, escrita como se le muestra al cliente. Null en cobertura. */
  ciudad: string | null;
}

/**
 * Dónde está el cliente según ESTE mensaje, o `null` si no habla de lugares.
 *
 * `null` no es «está en Quito»: es «este mensaje no lo dice». Quien llama
 * decide con el resto de la conversación, que es lo que evita tratar a un
 * cliente normal como si estuviera lejos.
 */
export function dondeEstaElCliente(texto: string | null | undefined): DondeEsta | null {
  const n = normalizar(texto ?? "");
  if (!n.trim()) return null;

  // La negación se lee primero: «no vivo en Quito» nombra Quito y es lo
  // contrario de estar en Quito (conv 18603).
  if (NIEGA_QUITO.test(n)) return { estado: "fuera", ciudad: null };

  const fuera = FUERA.find(([, re]) => re.test(n));
  if (fuera) {
    // Nombrar la ciudad no alcanza: tiene que estar diciendo que está ahí, o
    // ser un mensaje corto donde la ciudad ES la respuesta («En Sto. Domingo»).
    const esCorto = n.trim().split(/\s+/).length <= 6;
    if (!DICE_DONDE_ESTA.test(n) && !esCorto) return null;
    // Está fuera PERO anuncia que sube: el local vuelve a tener sentido.
    if (VIENE_A_QUITO.test(n)) return { estado: "viene", ciudad: fuera[0] };
    return { estado: "fuera", ciudad: fuera[0] };
  }

  if (VIENE_A_QUITO.test(n)) return { estado: "viene", ciudad: null };
  if (COBERTURA.test(n)) return { estado: "cobertura", ciudad: null };
  return null;
}

/** Atajo para los candados: ¿este mensaje dice que NO puede pasar por el local? */
export function noPuedePasarPorElLocal(texto: string | null | undefined): boolean {
  return dondeEstaElCliente(texto)?.estado === "fuera";
}

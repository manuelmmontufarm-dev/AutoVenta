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
 *
 * DE QUÉ CIUDAD ES «COBERTURA», desde el 4-nov-2026: de la del perfil
 * (`negocio.ciudad`). Con Mundillantas, «soy de Santo Domingo» es estar en
 * casa, no un cliente lejano; y «estoy en la av Quevedo» es la calle de su
 * matriz, no la ciudad de Quevedo. Con Depot los patrones salen idénticos.
 */
import { negocio, sinTildes } from "../negocio/index.js";
import { diceQueEstaLejos, diceQueNoPuedeIr } from "./clienteLejos.js";
import { mantieneLaVenta } from "./sinSeguimiento.js";

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
const OTRAS_CIUDADES: readonly (readonly [string, RegExp])[] = [
  // Quito es «otra ciudad» para un negocio que no está en Quito. Para Depot
  // sale de la lista sola (`FUERA` quita la ciudad del negocio).
  ["Quito", /\bquito\b/],
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
  // Auditoría del 19-oct (familia 7-A): provincias y cantones que llegaron y
  // no estaban. 27932: «Enq parte de Manabi están»; 8924: «Tungurahua Cantón
  // Pillaro». El cantón va antes que su provincia: se nombra lo más preciso.
  ["Píllaro", /\bpillaro\b/],
  ["Pelileo", /\bpelileo\b/],
  ["Tungurahua", /\btungurahua\b/],
  ["Chone", /\bchone\b/],
  ["Jipijapa", /\bjipijapa\b/],
  ["Montecristi", /\bmontecristi\b/],
  ["Pedernales", /\bpedernales\b/],
  ["Bahía de Caráquez", /\bbahia\s+de\s+caraquez\b/],
  ["Manabí", /\bmanabi\b/],
  ["Huaquillas", /\bhuaquillas\b/],
  ["El Oro", /\bprovincia\s+(?:de\s+)?el\s+oro\b/],
  ["Azogues", /\bazogues\b/],
  ["Azuay", /\bazuay\b/],
  ["Cañar", /\bcanar\b/],
  ["Guaranda", /\bguaranda\b/],
  ["Macas", /\bmacas\b/],
  ["Zamora", /\bzamora\s+chinchipe\b/],
  ["Carchi", /\bcarchi\b/],
  ["Imbabura", /\bimbabura\b/],
  ["Cotopaxi", /\bcotopaxi\b/],
  ["Chimborazo", /\bchimborazo\b/],
  ["Los Ríos", /\blos\s+rios\b/],
  ["Galápagos", /\bgalapagos\b/],
  // Auditoría del 9-nov (familia 7): 39597 «soy de bolivar esta muy aledado»;
  // 39845 «Estoy por el oriente». La avenida Simón Bolívar de Quito no es la
  // provincia: con «simón», «av», «calle», «la» o «plaza» delante es una calle.
  ["Bolívar", /(?<!\b(?:simon|av|avda|avenida|calle|la|plaza|parque)\.?\s{1,3})\bbolivar\b/],
  ["Napo", /\bnapo\b/],
  ["Pastaza", /\bpastaza\b/],
  ["Sucumbíos", /\bsucumbios\b/],
  ["Orellana", /\borellana\b/],
  ["Morona Santiago", /\bmorona\b/],
  ["Oriente", /\bel\s+oriente\b|\bamazonia\b|\bla\s+amazonia\b/],
];

/**
 * LO QUE SE SABE DE CADA CIUDAD DONDE HAY UN NEGOCIO: sus zonas (que también
 * son «cobertura») y a qué nombres se «sube» o «va» el que viene de fuera.
 * Es geografía, no política comercial: vale para cualquier llantera de esa
 * ciudad. Una ciudad sin fila acá usa solo su propio nombre.
 */
const ZONAS_DE_LA_CIUDAD: Record<string, { zonas: string[]; seVaA: string; seSubeA: string }> = {
  quito: {
    zonas: ["cumbaya", "tumbaco", "valle\\s*de\\s*los\\s*chillos", "chillos", "sangolqui", "conocoto", "puembo", "calderon", "pomasqui", "el\\s*condado"],
    seVaA: "quito|cumbaya|tumbaco",
    seSubeA: "quito|cumbaya",
  },
};

const CIUDAD = sinTildes(negocio.ciudad).toLowerCase().trim();
/** La ciudad del negocio como patrón: «quito», «santo\\s+domingo». */
const C = escapar(CIUDAD).replace(/\s+/g, "\\s+");
const ZONAS = ZONAS_DE_LA_CIUDAD[CIUDAD] ?? { zonas: [], seVaA: C, seSubeA: C };

function escapar(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Las ciudades que NO son la del negocio. Una fila cuyo patrón reconoce la
 * ciudad del perfil (Santo Domingo, con sus alias «sto. domingo» y
 * «tsáchilas») sale de la lista: ahí el cliente está en casa.
 */
const FUERA = OTRAS_CIUDADES.filter(([, re]) => !re.test(CIUDAD));

/**
 * Palabras de las direcciones de los locales que TAMBIÉN son nombre de otra
 * ciudad («Av. Quevedo km 1» en Santo Domingo). Precedidas de «av», «calle» o
 * «vía» son la calle del local: cobertura, no la ciudad lejana.
 */
const CALLES_PROPIAS: string[] = negocio.locales.flatMap((local) => {
  const dir = sinTildes(local.direccion ?? "").toLowerCase();
  if (dir.startsWith("[pendiente]")) return [];
  return FUERA
    .filter(([, re]) => re.test(dir))
    .map(([nombre]) => escapar(sinTildes(nombre).toLowerCase()).replace(/\s+/g, "\\s*"));
});
const CALLE_DEL_LOCAL = CALLES_PROPIAS.length
  ? new RegExp(`\\b(?:av|avda|avenida|calle|via)\\.?\\s+(?:${CALLES_PROPIAS.join("|")})\\b`, "g")
  : null;


/**
 * «Soy de provincia» (8924): no dice cuál, pero sí que no es Quito. Para la
 * gente de Quito «provincia» es todo lo demás.
 */
const DE_PROVINCIA = /\b(?:soy|somos|estoy|estamos|vivo|vivimos)\s+(?:de|en)\s+(?:una\s+|la\s+)?provincia\b/;

/** Lo que SÍ es cobertura: la ciudad del negocio y sus zonas (Depot: Quito y el valle). */
const COBERTURA = new RegExp([C, ...ZONAS.zonas].map((z) => `\\b${z}\\b`).join("|"));

/**
 * Está diciendo DÓNDE ESTÁ, no nombrando un lugar de paso. «Soy de», «estoy
 * en», «vivo en», «por acá en», o el nombre solo cuando el mensaje es corto.
 */
const DICE_DONDE_ESTA =
  /\b(?:soy|somos)\s+de\b|\best(?:oy|amos)\s+(?:en|por)\b|\bviv(?:o|imos)\s+(?:en|por)\b|\b(?:ac[aá]|aqui)\s+en\b|\bcanton\b|\bdesde\b|\bpara\b|\bprovincia\s+(?:de\s+)?\b|\bciudad\s+de\b|\ben\s+la\s+ciudad\b/;

/**
 * Anuncia que viene a Quito. Es lo que distingue al cliente de Santo Domingo
 * que va a pasar el lunes del que nunca va a poder ir. También cuenta quien YA
 * está en Quito de paso (conv 22481: «vivo en Ibarra, estando en Quito sector
 * norte»): la negación («no estoy en Quito») se lee antes y gana.
 */
const VIENE_A_QUITO = new RegExp(
  `\\b(?:voy|vamos|ire|iremos|estare|estaremos|paso|pasare|subo|subire|viajo|viajare|bajo|vengo|vendre)\\b[^.?!]{0,40}\\b(?:a|por|en|hasta|hacia)?\\s*\\b(?:${ZONAS.seVaA})\\b`
  + `|\\b(?:suba|subir|venir|ir|pasar|viajar)\\b[^.?!]{0,30}\\b(?:a\\s+)?(?:la\\s+)?(?:ciudad\\s+de\\s+)?(?:${ZONAS.seSubeA})\\b`
  + `|\\bcuando\\s+(?:este|vaya|suba|baje)\\b[^.?!]{0,25}\\b${C}\\b`
  + `|\\b(?:estando|estoy|estamos|ahora|ya)\\s+en\\s+(?:la\\s+ciudad\\s+de\\s+)?${C}\\b`
  + `|\\ben\\s+${C}\\s+por\\s+estos\\s+dias\\b`,
);

/**
 * AVISA QUE VUELVE (revisión ronda 1 del sprint 5): «La próxima semana estoy
 * por allá, este rato estoy trabajando en el oriente» (39329, con cotización y
 * local elegido) y «Estoy por el oriente llego en 15 días» (39845) no son
 * clientes que no pueden venir: anuncian cuándo vuelven. Una vuelta («llego»,
 * «regreso», «estoy por allá»…) con un plazo («la próxima semana», «en 15
 * días», «el lunes») es `viene` aunque el mensaje nombre dónde está ahora.
 */
const REGRESO =
  /\b(?:llego|llegare|llegamos|llegaremos|regreso|regresare|regresamos|vuelvo|volvere|volvemos|retorno|bajo|subo|vengo|estoy\s+por\s+(?:alla|aca)|estare\s+por\s+(?:alla|aca)|estamos\s+por\s+(?:alla|aca))\b/;
const PLAZO =
  /\b(?:la\s+(?:proxima|otra|siguiente)\s+semana|el\s+(?:proximo|otro|siguiente)\s+mes|en\s+(?:\d+|un|una|unos|unas|dos|tres|cuatro|cinco|ocho|quince|par\s+de)\s+(?:dias|semanas?|mes(?:es)?)|este\s+fin\s+de\s+semana|el\s+fin\s+de\s+semana|el\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|manana|pasado\s+manana|pronto|dentro\s+de)\b/;
const anunciaQueVuelve = (n: string): boolean => REGRESO.test(n) && PLAZO.test(n);

/** Niega estar o ir a Quito: «no vivo en Quito», «no viajo a Quito». */
const NIEGA_QUITO = new RegExp(`\\bno\\s+(?:viv|estoy|soy|viaj|voy|subo|paso|puedo\\s+ir)\\w*\\b[^.?!]{0,25}\\b${C}\\b`);

export interface DondeEsta {
  /** `fuera` = no puede pasar por el local. `viene` = está fuera pero sube. */
  estado: "cobertura" | "viene" | "fuera";
  /** La ciudad, escrita como se le muestra al cliente. Null en cobertura. */
  ciudad: string | null;
  /**
   * El estado vale para ESTE turno y no se guarda en la ficha: «está muy lejos»
   * o «no puedo ir» sin ciudad (revisión ronda 1 del sprint 5). Guardarlo 60
   * días callaba local, día y recordatorios en los ciclos siguientes.
   */
  soloElTurno?: true;
}

/**
 * Dónde está el cliente según ESTE mensaje, o `null` si no habla de lugares.
 *
 * `null` no es «está en Quito»: es «este mensaje no lo dice». Quien llama
 * decide con el resto de la conversación, que es lo que evita tratar a un
 * cliente normal como si estuviera lejos.
 */
export function dondeEstaElCliente(texto: string | null | undefined): DondeEsta | null {
  const crudo = normalizar(texto ?? "");
  if (!crudo.trim()) return null;
  // La calle del local («av quevedo») se lee como cobertura y se saca antes de
  // buscar ciudades lejanas, para que no la confunda con la ciudad.
  const n = CALLE_DEL_LOCAL ? crudo.replace(CALLE_DEL_LOCAL, " ") : crudo;
  const nombraLaCalleDelLocal = n !== crudo;

  // La negación se lee primero: «no vivo en Quito» nombra Quito y es lo
  // contrario de estar en Quito (conv 18603).
  if (NIEGA_QUITO.test(n)) return { estado: "fuera", ciudad: null };
  // «Está muy lejos», «muy difícil ir a Quito», «no puedo ir» (38924, 39597,
  // 18535): no puede venir aunque no nombre ciudad — y «difícil ir a Quito» NO
  // es anunciar que viene. Salvo que el mismo mensaje siga vendiendo («está
  // lejos de mi casa pero voy el sábado», «queda lejos, ¿tienen otro local?»).
  if ((diceQueEstaLejos(n) || diceQueNoPuedeIr(n)) && !mantieneLaVenta(texto ?? "")) {
    const ciudad = FUERA.find(([, re]) => re.test(n))?.[0] ?? null;
    return ciudad ? { estado: "fuera", ciudad } : { estado: "fuera", ciudad: null, soloElTurno: true };
  }
  if (DE_PROVINCIA.test(n) && !FUERA.some(([, re]) => re.test(n))) {
    return { estado: VIENE_A_QUITO.test(n) || anunciaQueVuelve(n) ? "viene" : "fuera", ciudad: null };
  }

  const fuera = FUERA.find(([, re]) => re.test(n));
  if (fuera) {
    // Nombrar la ciudad no alcanza: tiene que estar diciendo que está ahí, o
    // ser un mensaje corto donde la ciudad ES la respuesta («En Sto. Domingo»).
    const esCorto = n.trim().split(/\s+/).length <= 6;
    if (!DICE_DONDE_ESTA.test(n) && !esCorto) return null;
    // Está fuera PERO anuncia que sube: el local vuelve a tener sentido.
    if (VIENE_A_QUITO.test(n) || anunciaQueVuelve(n)) return { estado: "viene", ciudad: fuera[0] };
    return { estado: "fuera", ciudad: fuera[0] };
  }

  if (VIENE_A_QUITO.test(n)) return { estado: "viene", ciudad: null };
  if (COBERTURA.test(n) || nombraLaCalleDelLocal) return { estado: "cobertura", ciudad: null };
  return null;
}

/**
 * ¿Este nombre de lugar es la ciudad del negocio (o un alias suyo)? Para las
 * otras listas de «otras ciudades» del dominio: con Mundillantas, «santo
 * domingo» y «tsachilas» son su casa. Con Depot no excluye nada.
 */
export function esLaCiudadDelNegocio(lugar: string): boolean {
  const l = normalizar(lugar).trim();
  if (l === CIUDAD) return true;
  return OTRAS_CIUDADES.some(([, re]) => re.test(CIUDAD) && re.test(l));
}

/** Atajo para los candados: ¿este mensaje dice que NO puede pasar por el local? */
export function noPuedePasarPorElLocal(texto: string | null | undefined): boolean {
  return dondeEstaElCliente(texto)?.estado === "fuera";
}

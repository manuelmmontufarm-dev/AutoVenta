/**
 * CONOCIMIENTO DE PRODUCTO — lo que el cliente pregunta de una llanta y el
 * bot no sabía contestar.
 *
 * Sale de leer ~3.800 mensajes de clientes de ago–nov 2026
 * (docs/CONOCIMIENTO-LLANTAS.md). Las familias que más se repetían:
 * - LONAS (~82 conversaciones): «No tengo verificado el número de lonas» —
 *   con el dato en el nombre del producto, o deducible del índice LT.
 * - KM (~60): a unos les daba 86.500/68.500/58.000 y a otros «no le puedo
 *   prometer un kilometraje».
 * - ORIGEN: c7900 «Kenda… sí, son de origen chino» (es taiwanesa).
 * - USO: ZE310R (turismo) recomendada para montaña (c3), KR20 para Hilux
 *   mixta (c18504), KR29 (M/T) como «equilibrio» a quien pidió A/T (c1286).
 * - INCLUYE: «la alineación y balanceo van aparte» (c8590) — están incluidos.
 * - DIFERENCIAS: «No tengo fichas técnicas verificadas de estos diseños».
 *
 * Igual que `respaldo_marcas`, esto no se le deja al modelo «si quiere
 * consultarlo»: se detecta el tema de la pregunta de forma determinística y la
 * respuesta viaja como HECHO al vendedor y al Ángel Guardián. Lo que el revisor
 * no tiene entre sus hechos, lo borra (lección del 26-ago); por eso la MISMA
 * función arma el texto para los dos.
 *
 * El texto solo viaja cuando hay pregunta técnica: no gasta tokens en los
 * turnos de medida, local o día.
 */
import { readFileSync } from "node:fs";
import { rutaDeAsset } from "../negocio/assets.js";

interface FichaModelo {
  marca: string;
  nombre: string;
  tipo: string;
  alias: string[];
  uso: string;
  datos: string;
  frase: string;
}

interface Base {
  modelos: Map<string, FichaModelo>;
  marcas: Record<string, string>;
  temas: Record<string, string>;
  competencia: Record<string, string>;
  lonas: Map<string, number>;
  /** «KR628|26570R17» → [10]. Varios valores = versiones distintas de la medida. */
  lonasModeloMedida: Map<string, number[]>;
  /** Alias normalizado → llave del modelo, del más largo al más corto. */
  alias: Array<[string, string]>;
}

const normalizar = (texto: string): string =>
  (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La llave de un diseño: «WILDPEAK A/T 4W» y «WILDPEAK A/T4W» son la misma. */
export const llaveDeDiseno = (diseno: string): string =>
  (diseno ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

let base: Base | null = null;

function cargar(): Base {
  if (base) return base;
  const vacia: Base = { modelos: new Map(), marcas: {}, temas: {}, competencia: {}, lonas: new Map(), lonasModeloMedida: new Map(), alias: [] };
  try {
    const cruda = JSON.parse(// Es conocimiento DEL CLIENTE (seguro, km, qué incluye): `assets/<negocio>/`.
      // Sin archivo propio el negocio no recibe nada — 17-nov: el de Depot vivía
      // en la carpeta común y le llegaba también a Competimotor.
      readFileSync(rutaDeAsset("conocimiento-modelos.json"), "utf8")) as {
      modelos?: Record<string, Partial<FichaModelo> & { igual_a?: string }>;
      marcas?: Record<string, string>;
      temas?: Record<string, string>;
      competencia?: Record<string, string>;
      lonas_por_codigo?: Record<string, number | string>;
      lonas_por_modelo_medida?: Record<string, number[] | string>;
    };
    const modelos = new Map<string, FichaModelo>();
    const crudos = cruda.modelos ?? {};
    for (const [llave, m] of Object.entries(crudos)) {
      const real = m.igual_a ? crudos[m.igual_a] : m;
      if (!real?.nombre) continue;
      modelos.set(llaveDeDiseno(llave), {
        marca: real.marca ?? "", nombre: real.nombre, tipo: real.tipo ?? "",
        alias: m.igual_a ? [] : real.alias ?? [], uso: real.uso ?? "", datos: real.datos ?? "", frase: real.frase ?? "",
      });
    }
    const lonas = new Map<string, number>();
    for (const [codigo, valor] of Object.entries(cruda.lonas_por_codigo ?? {})) {
      if (typeof valor === "number") lonas.set(codigo, valor);
    }
    const lonasModeloMedida = new Map<string, number[]>();
    for (const [llave, valor] of Object.entries(cruda.lonas_por_modelo_medida ?? {})) {
      if (Array.isArray(valor)) lonasModeloMedida.set(llave, valor);
    }
    const alias: Array<[string, string]> = [];
    for (const [llave, m] of modelos) for (const a of m.alias) alias.push([normalizar(a), llave]);
    alias.sort((a, b) => b[0].length - a[0].length);
    base = {
      modelos, lonas, lonasModeloMedida, alias,
      marcas: cruda.marcas ?? {}, temas: cruda.temas ?? {}, competencia: cruda.competencia ?? {},
    };
    return base;
  } catch (error) {
    console.error("⚠️ No se pudo cargar el conocimiento de modelos:", error);
    base = vacia;
    return base;
  }
}

/** La ficha de un diseño tal como lo trae Contífico («WILDPEAK A/T 4W», «KR628»). */
export function fichaDeModelo(diseno: string | null | undefined): FichaModelo | null {
  if (!diseno) return null;
  return cargar().modelos.get(llaveDeDiseno(diseno)) ?? null;
}

/**
 * Lonas de un código de Contífico cuando el nombre no trae el «NPR». Viene del
 * nombre del sistema o del índice de carga LT (tablas TRA), revisado a mano.
 */
export function lonasPorCodigo(codigo: string | null | undefined): number | null {
  if (!codigo) return null;
  return cargar().lonas.get(String(codigo).trim()) ?? null;
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Alias de FAMILIA: «wildpeak», «maxclaw», «ziex»… nombran un modelo solo si
 * el texto no nombra ya uno concreto. «Wildpeak A/T3WA» es la A/T3W, no
 * además la A/T4W que «wildpeak» a secas representa.
 */
const ALIAS_DE_FAMILIA = new Set(["wildpeak", "wild peak", "maxclaw", "ziex", "azenis", "trail", "klever at", "klever a/t"]);

/** Los modelos que se nombran en un texto, por su alias («at4w», «kr628», «kaiser»). */
export function modelosEnTexto(texto: string): string[] {
  let n = ` ${normalizar(texto)} `;
  const vistos: string[] = [];
  const deFamilia: string[] = [];
  for (const [alias, llave] of cargar().alias) {
    const re = new RegExp(`(?<![a-z0-9])${escapar(alias)}(?![a-z0-9])`, "g");
    if (!re.test(n)) continue;
    // Se tapa lo ya reconocido: «wildpeak mt» no vuelve a contar como «wildpeak».
    n = n.replace(re, " ");
    const lista = ALIAS_DE_FAMILIA.has(alias) ? deFamilia : vistos;
    if (!lista.includes(llave)) lista.push(llave);
  }
  return vistos.length ? vistos : deFamilia;
}

const TEMAS: Array<[string, RegExp]> = [
  ["origen", /pro[cs]edenc|de\s+(?:que|donde)\s+(?:pais\s+)?(?:es|son|vienen?|proceden)\b|de\s+que\s+pais|fabricad[ao]s?\s+en|donde\s+(?:se\s+)?(?:fabric|hacen|producen)|hech[ao]s?\s+en\b|\bchin[ao]s?\b|japones|taiwan|corean|\borigen\b|made\s+in/],
  ["lonas", /\blonas?\b|\bcapas\b|\btelas\b|\b\d{1,2}\s?pr\b|\bply\b|rango\s+de\s+carga|\bcarga\b/],
  ["km", /kilometr|\bkms?\b|cuanto\s+(?:me\s+)?dura|durabilidad|duracion|duraderas?|cuanto\s+rinde|rendimiento|vida\s+util/],
  ["treadwear", /treadwear|\butqg\b|\btread\b/],
  ["dot", /\bdot\b|ano\s+de\s+(?:fabricacion|produccion)|fecha\s+de\s+(?:fabricacion|caducidad)|de\s+que\s+ano|son\s+nuev[ao]s|caducidad|antiguedad|vencid/],
  ["lluvia", /lluvi|mojad|agarre|adherencia|aquaplan|frenad|resbal|patin/],
  ["ruido", /ruid|zumb|\bsuaves?\b|dura\s+o\s+suave|\bduras\b|confort|comod|silencios/],
  ["uso", /\blodo\b|\bbarro|montan|lastre|\btierra\b|piedra|ripio|trocha|off\s?road|todo\s?terreno|\b4x4\b|\bcampo\b|\bfinca\b|pantaner|para\s+que\s+(?:es|sirve|son)|es\s+(?:a\/?t|mixta)/],
  ["incluye", /alineac|balance|\bincluye|incluid|valvula|enllantaje|instalac/],
  ["garantia", /garantia|\bseguro\b|reclam/],
  ["equivalencia", /mas\s+(?:alta|ancha|grande|baja|angosta)|en\s+(?:vez|lugar)\s+de|equivalen|otra\s+medida|\bperfil\b|\broce\b|\broza|\btope\b|velocimetro|cambiar\s+(?:de\s+)?(?:aro|rin|medida)|le\s+queda|le\s+sirve/],
  ["runflat", /run\s?flat/],
  ["consumo", /combustible|gasolina|\bconsumo|eficien/],
  ["presion", /presion|\bpsi\b|nitrogeno|inflad/],
  ["reencauche", /reencauch|recauch/],
  ["marcas_que_manejan", /que\s+marcas|marcas\s+(?:tienen|manejan|trabajan|hay)|en\s+que\s+marcas/],
  ["diferencia", /diferencia|\bvs\b|versus|cual\s+(?:es\s+)?(?:mejor|mas\s+buena)|cual\s+(?:me\s+)?(?:conviene|recomienda)|compar|que\s+tal\s+(?:es|son)/],
];

export function temasDeLaPregunta(texto: string): string[] {
  const n = normalizar(texto);
  return TEMAS.filter(([, re]) => re.test(n)).map(([tema]) => tema);
}

const COMPETIDORES: Array<[string, RegExp]> = [
  ["BFGOODRICH", /\bbf\s?goodrich\b|\bbfg\b|\bbf\b|\bko2\b|\bko3\b/],
  ["MICHELIN", /\bmichelin\b/],
  ["MAXXIS", /\bmaxxis\b/],
  ["TOYO", /\btoyo\b/],
  ["COOPER", /\bcooper\b/],
  ["CONTINENTAL", /\bcontinental\b|\bconti\b/],
  ["GENERAL TIRE", /\bgeneral\s+(?:tire|grabber)\b|\bgrabber\b/],
  ["HANKOOK", /\bhankook\b/],
  ["BRIDGESTONE", /\bbridgestone\b/],
  ["GOODYEAR", /\bgoodyear\b|\bgood\s+year\b/],
  ["PIRELLI", /\bpirelli\b/],
  ["YOKOHAMA", /\byokohama\b/],
  ["CHINAS", /\blinglong\b|\btriangle\b|\bsailun\b|\bwestlake\b|no\s+(?:quiero\s+)?chin/],
];

export function competidoresEnTexto(texto: string): string[] {
  const n = normalizar(texto);
  return COMPETIDORES.filter(([, re]) => re.test(n)).map(([marca]) => marca);
}

/**
 * Las marcas de la ficha que el cliente nombra («¿la Haida es buena?»). «BF»
 * es BFGoodrich; «general» a secas es una palabra común, así que General Tire
 * solo cuenta con «general tire» o el nombre de su línea.
 */
export function marcasEnTexto(texto: string): string[] {
  const n = ` ${normalizar(texto)} `;
  const vistas: string[] = [];
  for (const marca of Object.keys(cargar().marcas)) {
    const patron = marca === "GENERAL"
      ? /general\s+tire|grabber|altimax/
      : marca === "BFGOODRICH"
        ? /(?<![a-z0-9])(?:bf\s?goodrich|bfg|bf)(?![a-z0-9])/
        : new RegExp(`(?<![a-z0-9])${escapar(normalizar(marca))}(?![a-z0-9])`);
    if (patron.test(n)) vistas.push(marca);
  }
  return vistas;
}

/** Pregunta abierta sobre un modelo nombrado: «¿qué tal la KR628?», «la trail es buena?». */
const PREGUNTA_ABIERTA = /\?|que\s+tal|es\s+buen|son\s+buen|sirve|recomiend|conviene|para\s+que/;

const OPINION_DE_MARCA = /que\s+tal|es\s+buen|son\s+buen|recomiend|conviene|calidad|confiable|dura|de\s+donde|mejor/;

const MAX_MODELOS = 4;

/** Las medidas escritas en un texto, como llave del índice: «265/70R17» → «26570R17», «31x10.50R15» → «31X10.50R15». */
export function medidasComoLlave(texto: string): string[] {
  const vistas: string[] = [];
  for (const m of (texto ?? "").toUpperCase().matchAll(/(\d{2,3})\s*[/X*]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*Z?R\s*(\d{2})/g)) {
    const llave = m[1].length === 3 ? `${m[1]}${m[2]}R${m[3]}` : `${m[1]}X${m[2].replace(",", ".")}R${m[3]}`;
    if (!vistas.includes(llave)) vistas.push(llave);
  }
  return vistas;
}

/** Lonas de un modelo en una medida, del catálogo de Depot. */
export function lonasDeModeloEnMedida(modelo: string, medida: string): number[] {
  const [llaveMedida] = medidasComoLlave(medida);
  if (!llaveMedida) return [];
  return cargar().lonasModeloMedida.get(`${llaveDeDiseno(modelo)}|${llaveMedida}`) ?? [];
}

/**
 * El HECHO de conocimiento del turno, o null si el cliente no preguntó nada
 * técnico. `textosRecientes` = mensajes recientes de la visita (bot y cliente):
 * de ahí salen los modelos que están sobre la mesa aunque el cliente diga solo
 * «¿y esa de cuántas lonas es?».
 */
export function conocimientoParaElTurno(
  textoDelCliente: string,
  textosRecientes: readonly string[] = [],
): string | null {
  const b = cargar();
  if (!b.modelos.size) return null;
  const temas = temasDeLaPregunta(textoDelCliente);
  const competidores = competidoresEnTexto(textoDelCliente);
  const nombrados = modelosEnTexto(textoDelCliente);
  // Una marca a secas solo cuenta si se pregunta POR ELLA («¿qué tal la Haida?»):
  // «¿tienen Kenda?» es disponibilidad, va al catálogo y no gasta este hecho.
  const preguntaPorModelo = (nombrados.length > 0 && PREGUNTA_ABIERTA.test(normalizar(textoDelCliente)))
    || (marcasEnTexto(textoDelCliente).length > 0 && OPINION_DE_MARCA.test(normalizar(textoDelCliente)));
  if (!temas.length && !competidores.length && !preguntaPorModelo) return null;

  const enMesa: string[] = [];
  for (const texto of textosRecientes) for (const m of modelosEnTexto(texto ?? "")) if (!enMesa.includes(m)) enMesa.push(m);
  const modelos = [...nombrados, ...enMesa.filter((m) => !nombrados.includes(m))].slice(0, MAX_MODELOS);

  const lineas: string[] = [
    "CONOCIMIENTO DE PRODUCTO (ficha del negocio; el bot PUEDE afirmarlo tal cual y NO debe mandarlo al asesor ni decir «no tengo el dato»):",
  ];
  for (const tema of temas) if (b.temas[tema]) lineas.push(`• ${tema.toUpperCase()}: ${b.temas[tema]}`);
  // Marcas: las que nombró el cliente, las de los modelos sobre la mesa y, si
  // pregunta el origen sin contexto, las primeras de la ficha (las de la casa).
  const marcas = new Set([
    ...marcasEnTexto(textoDelCliente),
    ...(modelos.map((m) => b.modelos.get(m)?.marca?.toUpperCase()).filter(Boolean) as string[]),
  ]);
  if (temas.includes("origen") && !marcas.size) for (const m of Object.keys(b.marcas).slice(0, 4)) marcas.add(m);
  for (const marca of [...marcas].slice(0, 6)) if (b.marcas[marca]) lineas.push(`• MARCA ${marca}: ${b.marcas[marca]}`);
  for (const llave of modelos) {
    const f = b.modelos.get(llave);
    if (f) lineas.push(`• MODELO ${f.nombre} — ${f.tipo}. Para: ${f.uso} Datos: ${f.datos} Frase: «${f.frase}»`);
  }
  for (const c of competidores) if (b.competencia[c]) lineas.push(`• CONTRA ${c}: ${b.competencia[c]}`);
  if (temas.includes("lonas")) {
    // Las lonas YA resueltas para lo que está sobre la mesa: con la regla sola
    // el bot igual contestaba «lo confirma el asesor» (simulador, 17-nov).
    const medidas = [...new Set([textoDelCliente, ...textosRecientes].flatMap((t) => medidasComoLlave(t ?? "")))];
    const resueltas: string[] = [];
    for (const llave of modelos) for (const medida of medidas) {
      const lonas = b.lonasModeloMedida.get(`${llave}|${medida}`);
      if (lonas?.length) resueltas.push(`${b.modelos.get(llave)?.nombre ?? llave} ${medida.replace(/^(\d{3})(\d{2})R/, "$1/$2R")}: ${lonas.join(" o ")} lonas${lonas.length > 1 ? " (hay versiones distintas; el asesor confirma cuál)" : ""}`);
    }
    if (resueltas.length) lineas.push(`• LONAS EN EL CATÁLOGO (dato del sistema, DILO): ${resueltas.join(" · ")}. Medida sin LT ni C = 4 lonas (llanta de pasajero).`);
  }
  lineas.push(
    "Reglas: responde CADA tema preguntado (si preguntó dos cosas, contesta las dos) con estos datos en la primera parte del mensaje; los km y el treadwear se dicen como aproximados; "
    + "no inventes lo que no está aquí (válvulas, nitrógeno, año exacto del stock, exclusiones del seguro → lo confirma el asesor); "
    + "no hables mal de otra marca.",
  );
  return lineas.join("\n");
}

import {
  extractConventionalSizes, extractFlotationSizes, extractTireSizes,
  formatConventionalSize, formatTireSize, type TireSize,
} from "./tireSize.js";
import { resolveCatalogMedia } from "./catalogMedia.js";
import { extractLoadSpeed, type TireLoadSpeed } from "./tireSpecs.js";

export type CatalogAvailability = "available" | "check" | "out";
export type PriceTier = "pvp1" | "pvp2" | "pvp3" | "pvp4";

export interface ContificoProductWire {
  id?: unknown;
  codigo?: unknown;
  nombre?: unknown;
  descripcion?: unknown;
  marca_nombre?: unknown;
  estado?: unknown;
  tipo?: unknown;
  pvp1?: unknown;
  pvp2?: unknown;
  pvp3?: unknown;
  pvp4?: unknown;
  porcentaje_iva?: unknown;
  cantidad_stock?: unknown;
  imagen?: unknown;
}

export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  brand: string;
  design: string;
  size: TireSize | null;
  sizeLabel: string | null;
  /** Precio cliente antes de IVA; es el valor que consume el PDF. */
  price: number;
  /** Precio base de Contífico antes de IVA. */
  sourcePrice: number;
  priceTier: PriceTier;
  prices: Record<PriceTier, number | null>;
  taxRate: number;
  customerPriceWithTax: number;
  minimumPriceWithTax: number;
  distributorPriceWithTax: number;
  stock: number;
  availability: CatalogAvailability;
  imageUrl: string | null;
  imageSource: string | null;
  loadSpeed: TireLoadSpeed | null;
  active: boolean;
  source: "contifico" | "sheets";
}

const PRICE_TIERS: PriceTier[] = ["pvp1", "pvp2", "pvp3", "pvp4"];
const FLOTATION_RE = /(?<!\d)(\d{2})\s*[xX]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:Z?R\s*)?(\d{2})(?!\d)/;

export function numberFromWire(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCatalogText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}.]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactCatalogText(value: string): string {
  return normalizeCatalogText(value).replace(/[^a-z0-9]/g, "");
}

/**
 * Medida de flotación en forma canónica: "30X9.5R15".
 *
 * El catálogo trae la MISMA llanta escrita de dos formas — "30X9.5R15LT" y
 * "30X9.50R15LT" — y sin canonizar quedan como medidas distintas. Eso le costó
 * una venta a Depot: el cliente pidió 30x9.5r15, el bot encontró solo la que
 * tenía stock 0 y le dijo que no había, mientras la otra tenía 20 unidades.
 * Se quitan los ceros de más del decimal para que ambas colapsen en una.
 */
export function canonicalFlotationLabel(
  width: string | number,
  section: string | number,
  rim: string | number,
): string {
  const dec = String(section).replace(",", ".");
  const limpio = dec.includes(".") ? dec.replace(/0+$/, "").replace(/\.$/, "") : dec;
  return `${width}X${limpio}R${rim}`;
}

export function extractCatalogSizeLabel(text: string): {
  size: TireSize | null;
  sizeLabel: string | null;
} {
  const metric = extractTireSizes(text)[0] ?? null;
  if (metric) return { size: metric, sizeLabel: formatTireSize(metric) };

  // El parser del dominio, no un regex local: entiende «33x12.50r17» en
  // minúscula, con asterisco y sin punto decimal, que es como aparece tanto
  // en el catálogo de Contífico como en los mensajes de la gente.
  const flotation = extractFlotationSizes(text)[0];
  if (flotation) {
    return {
      size: null,
      sizeLabel: canonicalFlotationLabel(flotation.diameter, flotation.section, flotation.rim),
    };
  }

  // Última: la convencional de camión liviano («7.00R15»). Va al final porque
  // su patrón es el más laxo y podría morder el ancho de una flotación.
  const conventional = extractConventionalSizes(text)[0];
  if (conventional) return { size: null, sizeLabel: formatConventionalSize(conventional) };

  return { size: null, sizeLabel: null };
}

export function availabilityFromStock(stock: number): CatalogAvailability {
  if (stock <= 0) return "out";
  if (stock < 4) return "check";
  return "available";
}

export function normalizeContificoProduct(
  wire: ContificoProductWire,
  preferredTier: PriceTier,
  pricing: { customerDivisor: number; minimumDivisor: number } = {
    customerDivisor: 0.5625,
    minimumDivisor: 0.75,
  },
): CatalogItem | null {
  const id = text(wire.id);
  const code = text(wire.codigo);
  const name = text(wire.nombre) || text(wire.descripcion);
  if (!id || !code || !name) return null;
  if (text(wire.estado).toUpperCase() === "I") return null;
  if (text(wire.tipo).toUpperCase() === "SER") return null;

  const prices = Object.fromEntries(
    PRICE_TIERS.map((tier) => {
      const value = numberFromWire(wire[tier]);
      return [tier, value !== null && value > 0 ? round2(value) : null];
    }),
  ) as Record<PriceTier, number | null>;

  let priceTier = preferredTier;
  let sourcePrice = prices[preferredTier];
  if (sourcePrice === null) {
    const fallback = PRICE_TIERS.find((tier) => prices[tier] !== null);
    if (!fallback) return null;
    priceTier = fallback;
    sourcePrice = prices[fallback];
  }
  if (sourcePrice === null) return null;

  const brand = text(wire.marca_nombre) || inferBrand(name);
  const { size, sizeLabel } = extractCatalogSizeLabel(name);
  const stock = Math.max(0, numberFromWire(wire.cantidad_stock) ?? 0);
  const taxPercent = numberFromWire(wire.porcentaje_iva) ?? 0;
  const taxRate = taxPercent > 1 ? taxPercent / 100 : taxPercent;
  const customerDivisor = validDivisor(pricing.customerDivisor, 0.5625);
  const minimumDivisor = validDivisor(pricing.minimumDivisor, 0.75);
  const distributorPriceWithTax = round2(sourcePrice * (1 + taxRate));
  const minimumPriceWithTax = round2(distributorPriceWithTax / minimumDivisor);
  const customerPriceWithTax = round2(distributorPriceWithTax / customerDivisor);
  const customerPriceBeforeTax = round2(customerPriceWithTax / (1 + taxRate));
  const design = inferCatalogDesign(name, brand, sizeLabel);
  const media = resolveCatalogMedia(brand, design);

  return {
    id,
    code,
    name,
    brand: brand || "Sin marca",
    design,
    size,
    sizeLabel,
    price: customerPriceBeforeTax,
    sourcePrice,
    priceTier,
    prices,
    taxRate,
    customerPriceWithTax,
    minimumPriceWithTax,
    distributorPriceWithTax,
    stock,
    availability: availabilityFromStock(stock),
    imageUrl: media?.publicUrl ?? imageUrlFromWire(wire.imagen),
    imageSource: media?.sourceLabel ?? null,
    loadSpeed: extractLoadSpeed(name),
    active: true,
    source: "contifico",
  };
}

/**
 * Cómo pregunta la gente, no cómo se describe una llanta. El agente a veces
 * pasa la frase del cliente casi entera a la búsqueda; estas palabras no
 * pueden costar el resultado.
 */
const RELLENO = new Set([
  "tienen", "tiene", "tendran", "tendras", "hay", "habra", "busco", "buscamos",
  "quiero", "quisiera", "necesito", "necesitamos", "venden", "vende", "manejan",
  "maneja", "disponen", "dispone", "disponible", "disponibilidad", "precio",
  "precios", "cuanto", "cuesta", "vale", "cotiza", "cotizar", "cotizacion",
  "llanta", "llantas", "de", "del", "la", "las", "el", "los", "un", "una",
  "en", "para", "por", "con", "y", "o", "me", "mi", "su", "rin", "aro",
  "medida", "juego", "unidades",
  // Cortesías: el cliente saluda y agradece dentro de la misma frase.
  "favor", "porfavor", "porfa", "gracias", "hola", "buenas", "buenos",
  "dias", "tardes", "noches", "senor", "senora", "amigo", "disculpe",
]);

export function searchCatalog(
  items: readonly CatalogItem[],
  query: string,
  limit = 40,
): CatalogItem[] {
  const normalizedQuery = normalizeCatalogText(query);
  const compactQuery = compactCatalogText(query);
  if (!normalizedQuery || !compactQuery) return [];

  // LA MEDIDA SE DECODIFICA PRIMERO y manda como FILTRO, no como texto.
  //
  // El parser de medidas (tireSize.ts) entiende cómo escribe la gente
  // («265/70/16», «265/70 Rin17», «31x10.50r15») y la canoniza. Si la consulta
  // trae una medida y el catálogo TIENE esa medida, se busca solo dentro de
  // ella: el texto restante («falken», «at4») elige el modelo, y es imposible
  // que salga una llanta de otra medida — que es exactamente como una búsqueda
  // por texto terminó firmando la cotización equivocada del 13-ago. Si en esa
  // medida no hay nada, se cae a la búsqueda ancha: devolver el mismo modelo
  // en otras medidas le permite al bot decir «en la suya no, pero existe en
  // estas» en vez de un «no hay» en seco.
  const querySize = extractCatalogSizeLabel(query).sizeLabel;
  const compactSize = querySize ? compactCatalogText(querySize) : null;
  let pool: readonly CatalogItem[] = items;
  let acotadoPorMedida = false;
  if (compactSize) {
    const deLaMedida = items.filter(
      (item) => item.sizeLabel && compactCatalogText(item.sizeLabel) === compactSize,
    );
    if (deLaMedida.length) {
      pool = deLaMedida;
      acotadoPorMedida = true;
    }
  }

  // Las palabras de conversación no describen la llanta y exigirlas mata la
  // búsqueda: «tienen falken wildpeak at4» fallaba porque ningún producto
  // contiene «tienen». Solo se filtran si queda algo con qué buscar. Y con la
  // medida ya decodificada, sus fragmentos («265», «70r17») tampoco son
  // tokens de texto: ya hicieron su trabajo como filtro.
  const crudos = normalizedQuery.split(" ").filter(Boolean);
  const esFragmentoDeMedida = (token: string): boolean => {
    if (!compactSize) return false;
    // «rin17»/«aro17» llegan pegados: se les quita la palabra y queda el
    // número, que sí es parte de la medida ya decodificada. Igual con el
    // prefijo LT/P de las medidas de camioneta («LT265/70R17»), que el parser
    // de medidas sí entiende pero el nombre del producto no siempre trae.
    // Si el token ES la medida completa escrita de otra forma («35x12.50R20»
    // contra la canónica «35X12.5R20»), se decodifica y se compara ya
    // canonizado. Sin esto, la variante con el cero de más o sin punto se
    // exigía como palabra literal y no aparecía en ningún nombre.
    const propia = extractCatalogSizeLabel(token).sizeLabel;
    if (propia && compactCatalogText(propia) === compactSize) return true;
    const nucleo = compactCatalogText(token)
      .replace(/^(?:rin|aro)/, "")
      .replace(/^(?:lt|p)(?=\d)/, "");
    return nucleo.length > 0 && compactSize.includes(nucleo);
  };
  // El relleno solo se conserva si sin él no queda NADA con qué buscar.
  const sinRelleno = crudos.filter((token) => !RELLENO.has(token));
  const base = sinRelleno.length ? sinRelleno : crudos;
  // Y los pedazos de la medida salen siempre: ya filtraron el catálogo. Que
  // la lista quede vacía es válido y frecuente —«215/75 Rin15» es SOLO una
  // medida—; ahí manda el filtro y no se exige ninguna palabra.
  const queryTokens = base.filter((token) => !esFragmentoDeMedida(token));

  // Sin palabras y sin medida acotada no hay búsqueda posible: devolver todo
  // el catálogo sería peor que devolver nada («tienen llantas», o una medida
  // que no existe en stock).
  if (!queryTokens.length && !acotadoPorMedida) return [];

  return pool
    .map((item) => ({ item, score: scoreItem(item, normalizedQuery, compactQuery, compactSize, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const availability = availabilityRank(a.item.availability) - availabilityRank(b.item.availability);
      if (availability !== 0) return availability;
      if (a.item.price !== b.item.price) return a.item.price - b.item.price;
      return a.item.name.localeCompare(b.item.name, "es");
    })
    .slice(0, Math.max(1, Math.min(limit, 60)))
    .map((entry) => entry.item);
}

/** Lo que responde el catálogo cuando se le pregunta por una llanta. */
export interface ResultadoEscalera {
  /** Coincidencias en la medida pedida (o las mejores, si no se pidió medida). */
  resultados: CatalogItem[];
  /** true = no hay nada que sea exactamente lo pedido. */
  sinCoincidenciaExacta: boolean;
  medidaPedida: string | null;
  /** Qué SÍ hay en la medida que pidió, cuando su modelo no está. */
  enEsaMedida: CatalogItem[];
  /** En qué medidas SÍ existe el modelo que pidió, cuando su medida no está. */
  modeloEnOtrasMedidas: CatalogItem[];
}

/**
 * Búsqueda en escalera: primero lo exacto, y si no hay, QUÉ SÍ HAY.
 *
 * Un `[]` a secas es la peor respuesta posible del catálogo: obliga al modelo
 * a improvisar un «no tenemos» que ni él puede verificar (14-ago, la Wildpeak
 * A/T4W que sí estaba en stock). Y escalar cada uno de esos al asesor tampoco
 * sirve: terminaría contestando «¿tenemos esto?» todo el día. Así que el
 * catálogo responde con datos y el bot arma una respuesta precisa solo:
 *
 *  · Está lo pedido            → `resultados`.
 *  · Existe la medida, no el modelo → `enEsaMedida` («esa no, pero mire estas»).
 *  · Existe el modelo, no la medida → `modeloEnOtrasMedidas` («la manejo en…»).
 *  · No existe ninguno         → las dos vacías: ahí sí es un «no» honesto.
 *
 * Regla dura: si el cliente pidió una medida, NADA de otra medida entra en
 * `resultados`. Presentar otra medida como si fuera la suya es el error que
 * terminó en una cotización firmada por $82,84 menos (chat 5499).
 */
export function buscarConEscalera(
  items: readonly CatalogItem[],
  consulta: string,
  limit = 8,
): ResultadoEscalera {
  const crudos = searchCatalog(items, consulta, limit);
  const medidaPedida = extractCatalogSizeLabel(consulta).sizeLabel;
  const compactPedida = medidaPedida ? compactCatalogText(medidaPedida) : null;
  const enLaMedida = compactPedida
    ? crudos.filter((item) => item.sizeLabel && compactCatalogText(item.sizeLabel) === compactPedida)
    : crudos;

  if (enLaMedida.length) {
    return {
      resultados: enLaMedida,
      sinCoincidenciaExacta: false,
      medidaPedida,
      enEsaMedida: [],
      modeloEnOtrasMedidas: [],
    };
  }

  // El texto del modelo = la consulta sin los pedazos de la medida ya
  // decodificada («265», «70r17», «rin17»): ya hicieron su trabajo de filtro.
  const textoDelModelo = consulta
    .split(/\s+/)
    .filter((token) => {
      const nucleo = compactCatalogText(token).replace(/^(?:rin|aro)/, "");
      return !(compactPedida && nucleo.length > 0 && compactPedida.includes(nucleo));
    })
    .join(" ")
    .trim();

  return {
    resultados: [],
    sinCoincidenciaExacta: true,
    medidaPedida,
    enEsaMedida: medidaPedida ? searchCatalog(items, medidaPedida, limit) : [],
    // `crudos` ya trae el modelo en otras medidas cuando la pedida no existe.
    modeloEnOtrasMedidas: crudos.length
      ? crudos
      : textoDelModelo && textoDelModelo !== consulta
        ? searchCatalog(items, textoDelModelo, limit)
        : [],
  };
}

/**
 * Los productos que pueden ser la referencia que el agente conserva.
 *
 * El agente no siempre devuelve el código de Contífico: devuelve lo que el
 * cliente dijo — «Wildpeak», «Falken Wildpeak M/T», «la 265/70R17 falken
 * wildpeak». Antes esto exigía coincidencia ÚNICA y, si no la había, se
 * respondía «no existe en el catálogo».
 *
 * Eso rompía justo con los modelos que más se venden. Depot tiene la Wildpeak
 * en muchas medidas, así que «Falken Wildpeak M/T» nunca coincide con una sola
 * fila: coincide con ocho. El agente le creía al «no existe», le decía al
 * cliente que no había, volvía a buscar, encontraba lo mismo y volvía a
 * fallar — el chat trabado que reportó Joaquín el 12-ago con
 * «265/70R17 falken wildpeak».
 *
 * Aquí se devuelven TODOS los candidatos, en orden, y se afinan con lo que la
 * conversación ya sabe. Quien llama decide: uno solo es la llanta; varios son
 * una pregunta al cliente; ninguno sí es «no existe».
 */
export function resolveCatalogCandidates(
  items: readonly CatalogItem[],
  reference: string,
  /** Medida ya confirmada en la conversación. Es lo que desempata de verdad. */
  sizeLabel?: string | null,
): CatalogItem[] {
  const clean = reference.trim().toLowerCase();
  if (!clean) return [];

  const exactas = items.filter((item) =>
    item.code.toLowerCase() === clean ||
    item.id.toLowerCase() === clean ||
    item.design.trim().toLowerCase() === clean ||
    `${item.brand} ${item.design}`.trim().toLowerCase() === clean,
  );
  // La búsqueda por texto solo entra si el nombre exacto no dio nada: un
  // diseño que coincide letra por letra siempre le gana a una coincidencia
  // parcial, aunque salgan varias filas de ese mismo diseño.
  const candidatos = exactas.length > 0 ? exactas : searchCatalog(items, reference, 8);
  if (candidatos.length <= 1) return candidatos;

  // Primer desempate: la medida de la conversación. «Wildpeak M/T» son ocho
  // llantas en el catálogo, pero una sola en la medida que este cliente pidió.
  const compactSize = sizeLabel ? compactCatalogText(sizeLabel) : null;
  const deLaMedida = compactSize
    ? candidatos.filter((item) => compactCatalogText(item.sizeLabel ?? "") === compactSize)
    : [];
  const porMedida = deLaMedida.length > 0 ? deLaMedida : candidatos;
  if (porMedida.length <= 1) return porMedida;

  // Segundo desempate: el stock. Si de las que quedan solo una se puede
  // vender, esa es — cotizar la agotada sería el error, no la ambigüedad.
  const conStock = porMedida.filter((item) => item.stock > 0);
  return conStock.length > 0 ? conStock : porMedida;
}

function scoreItem(
  item: CatalogItem,
  query: string,
  compactQuery: string,
  compactSize: string | null,
  queryTokens: string[],
): number {
  const code = normalizeCatalogText(item.code);
  const design = normalizeCatalogText(item.design);
  const brand = normalizeCatalogText(item.brand);
  const name = normalizeCatalogText(item.name);
  const size = compactCatalogText(item.sizeLabel ?? "");
  const blob = `${code} ${brand} ${design} ${name} ${item.sizeLabel ?? ""}`;
  const compactBlob = compactCatalogText(blob);
  // Cada token se busca también en forma COMPACTA (sin espacios ni signos).
  // La gente escribe «at4» y el catálogo dice «A/T4W»: normalizado con
  // espacios eso es «a t4w» y el token «at4» no aparece contiguo — así fue
  // como el 12 y el 14-ago el bot juró que la Wildpeak A/T4W 265/70R17 no
  // existía teniéndola en stock. En compacto («...wildpeakat4w...») sí está.
  const everyTokenMatches = queryTokens.every(
    (token) => blob.includes(token) || compactBlob.includes(compactCatalogText(token)),
  );

  let score = 0;
  if (compactCatalogText(code) === compactQuery) score += 180;
  if (compactCatalogText(design) === compactQuery) score += 150;
  if (compactSize && size === compactSize) score += 130;
  if (compactQuery === size) score += 130;
  if (brand === query) score += 80;
  if (name === query) score += 110;
  if (everyTokenMatches) score += 60 + queryTokens.length * 5;
  else if (compactBlob.includes(compactQuery)) score += 35;
  else return 0;
  if (compactSize && size === compactSize && queryTokens.some((token) => brand.includes(token))) {
    score += 35;
  }
  if (item.availability === "available") score += 8;
  if (item.availability === "out") score -= 6;
  return score;
}

function inferBrand(name: string): string {
  const known = ["Falken", "Kenda", "Winrun", "Sunoco", "Eurolub"];
  const normalized = normalizeCatalogText(name);
  return known.find((brand) => normalized.includes(brand.toLowerCase())) ?? "";
}

export function inferCatalogDesign(
  name: string,
  brand: string,
  sizeLabel: string | null,
): string {
  const upper = name.toUpperCase();
  const normalizedBrand = brand.toUpperCase();

  if (normalizedBrand.includes("KENDA")) {
    const model = upper.match(/\bKR\s*[- ]?\s*(\d{2,3}[A-Z]?)\b/);
    if (model) return `KR${model[1]}`;
  }

  if (normalizedBrand.includes("FALKEN")) {
    if (/\bWPRT0?1\b/.test(upper)) return "WILDPEAK R/T01";
    const azenis = upper.match(/\bAZENIS\s+FK\s*([0-9]{3}[A-Z]?)\b/);
    if (azenis) return `AZENIS FK${azenis[1]}`;
    const fk = upper.match(/\bFK\s*([0-9]{3}[A-Z]?)\b/);
    if (fk) return `FK${fk[1]}`;
    const ze = upper.match(/\bZE\s*([0-9]{3}[A-Z]*)\b/);
    if (ze) return `ZE${ze[1]}`;
    if (/\b(?:ZIEX\s+)?CT\s*60\s*(?:A\s*\/?\s*S|AS)?\b/.test(upper)) {
      return "ZIEX CT60 A/S";
    }
    if (/\bWILDPEAK\s+R\s*\/?\s*T\s*0?1\b/.test(upper)) {
      return "WILDPEAK R/T01";
    }
    if (/\bWILDPEAK\s+M\s*\/?\s*T(?:\s+MT0?1)?\b/.test(upper)) {
      return /\bMT0?1\b/.test(upper) ? "WILDPEAK M/T01" : "WILDPEAK M/T";
    }
    const wildpeakAt = upper.match(
      /\bWILDPEAK\s+A\s*\/?\s*T\s*(4W|TRAIL|AT3W)?\b/,
    );
    if (wildpeakAt) {
      const variant = wildpeakAt[1] ?? "";
      if (variant === "4W") return "WILDPEAK A/T 4W";
      if (variant === "TRAIL") return "WILDPEAK A/T TRAIL";
      if (variant === "AT3W") return "WILDPEAK A/T3W";
      return "WILDPEAK A/T";
    }
  }

  if (normalizedBrand.includes("WINRUN")) {
    if (/\bR330\s*-?\s*E\b/.test(upper)) return "R330-E";
    const radial = upper.match(/\b(R330|R380)\b/);
    if (radial) return radial[1];
    if (/\bMT305\b/.test(upper)) return "MT305";
    if (/\bMAXCLAW\s+H\s*\/?\s*T2\b/.test(upper)) return "MAXCLAW H/T2";
    if (/\bMAXCLAW\s+R\s*\/?\s*T\b/.test(upper)) return "MAXCLAW R/T";
    if (/\bMAXCLAW\s+A\s*\/?\s*T\b/.test(upper)) return "MAXCLAW A/T";
  }

  let design = name;
  if (brand) design = replaceLiteral(design, brand, " ");
  if (sizeLabel) {
    const parts = sizeLabel.match(/\d+(?:[/.X]\d+)?/g) ?? [];
    for (const part of parts) design = replaceLiteral(design, part, " ");
  }
  design = design
    .replace(/\b\d{2,3}(?:\s*\/\s*\d{2,3})?\s*[A-Z]\b/gi, " ")
    .replace(/\b(?:\d{1,3}PR|\d{1,3}P|OWL|BL|TL|XL|E4)\b/gi, " ")
    .replace(/\b\d{2,3}\b/g, " ")
    .replace(/\b(?:LT|ZR|R|TL|XL)\b/gi, " ")
    .replace(/\b\d{2,3}[A-Z]\b/gi, " ")
    .replace(/[/()_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return design || name;
}

function imageUrlFromWire(value: unknown): string | null {
  if (typeof value === "string") return isHttp(value) ? value : null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = imageUrlFromWire(entry);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["url", "imagen", "ruta", "archivo", "src"]) {
    const found = imageUrlFromWire(record[key]);
    if (found) return found;
  }
  return null;
}

function isHttp(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function replaceLiteral(value: string, search: string, replacement: string): string {
  if (!search) return value;
  return value.replace(new RegExp(escapeRegExp(search), "gi"), replacement);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function availabilityRank(value: CatalogAvailability): number {
  return value === "available" ? 0 : value === "check" ? 1 : 2;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function validDivisor(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

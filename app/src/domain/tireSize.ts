/**
 * Parser de medidas de llanta.
 *
 * No existe librería npm para esto (investigado jul-2026); implementación
 * propia inspirada en el diseño de Gan4x4/tyresize (PHP) y los regex
 * tolerantes de ricilandolt/tires_tgcode — solo ideas, no código (sin licencia).
 *
 * Acepta lo que la gente escribe por WhatsApp:
 *   "185/65R14"  "185/65 R14"  "185 65 14"  "185-65-14"  "185/65-14"
 *   "185 R14"    "185R14"      "LT265/70R17"  "P205/55ZR16"
 *   "265/70/16"  ← la forma con TRES barras, la más común en Ecuador
 *   "265/70 Rin17"  "265/70 rin 17"  "265 aro 16"  ← «rin» y «aro» en Ecuador
 */

export interface TireSize {
  /** Ancho de sección en mm (ej. 185). */
  width: number;
  /** Perfil / relación de aspecto en % (ej. 65). Null en medidas tipo "185 R14". */
  aspect: number | null;
  /** Diámetro del aro en pulgadas (ej. 14). */
  rim: number;
}

// Rangos reales del mercado — todo lo que caiga fuera se descarta para no
// confundir números de teléfono, precios o fechas con medidas.
const WIDTH_MIN = 125;
const WIDTH_MAX = 445;
const ASPECT_MIN = 25;
const ASPECT_MAX = 90;
const RIM_MIN = 10;
const RIM_MAX = 24;

// (?<!\d) evita partir números largos ("0991855514" no debe dar 185/55R14... sí
// podría — por eso además validamos rangos y múltiplos de 5 en width/aspect).
// Grupos: 1=prefijo LT/P, 2=ancho, 3=perfil (opcional), 4=aro.
//
// El separador del ARO acepta tres cosas que antes no:
//  · la BARRA — «265/70/16», la forma en que más gente escribe la medida aquí;
//  · «RIN» y «ARO» — «265/70 Rin17», «265 aro 16», como se dice en Ecuador.
// Las tres se vieron en chats reales del 11 y 13-ago, y en los tres casos la
// medida del cliente no se guardó como hecho de la conversación. Los rangos y
// el múltiplo de 5 siguen filtrando lo que no es una medida: una fecha como
// «05/08/16» no pasa porque el ancho pide 3 dígitos.
const TIRE_RE =
  /(?<!\d)(LT|P)?\s*(\d{3})(?:\s*[/.\-\s]\s*(\d{2}))?\s*(?:Z?R\s*|(?:RIN|ARO)\s*|[-./\s]\s*(?:Z?R|RIN|ARO)?\s*)(\d{2})(?!\d)/gi;

function isValid(width: number, aspect: number | null, rim: number): boolean {
  if (width < WIDTH_MIN || width > WIDTH_MAX || width % 5 !== 0) return false;
  if (aspect !== null && (aspect < ASPECT_MIN || aspect > ASPECT_MAX || aspect % 5 !== 0)) {
    return false;
  }
  if (rim < RIM_MIN || rim > RIM_MAX) return false;
  return true;
}

/** Extrae TODAS las medidas válidas de un texto libre. */
export function extractTireSizes(text: string): TireSize[] {
  const sizes: TireSize[] = [];
  for (const match of text.matchAll(TIRE_RE)) {
    const width = Number(match[2]);
    const aspect = match[3] !== undefined ? Number(match[3]) : null;
    const rim = Number(match[4]);
    if (!isValid(width, aspect, rim)) continue;
    if (!sizes.some((s) => s.width === width && s.aspect === aspect && s.rim === rim)) {
      sizes.push({ width, aspect, rim });
    }
  }
  if (sizes.length === 0) {
    const barajada = extractShuffledSize(text);
    if (barajada) sizes.push(barajada);
  }
  return sizes;
}

/**
 * «Rin 14 60 195» — ancho, perfil y aro en cualquier orden, con rin/aro
 * marcando cuál es el aro.
 *
 * Conv valle, 1-sep: «Rin 14 60 195 doble propósito». El regex canónico pide
 * el ancho (3 dígitos) primero, así que devolvía vacío; el bot buscó por aro
 * 14 y cotizó 215/75R14. La palabra rin/aro es el ancla: sin ella no se
 * baraja, para no inventar medidas de un teléfono o una fecha.
 */
function extractShuffledSize(text: string): TireSize | null {
  const n = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const rin = n.match(/\b(?:rin|aro)\s*(\d{2})\b/);
  if (!rin) return null;
  const rim = Number(rin[1]);
  if (rim < RIM_MIN || rim > RIM_MAX) return null;
  const resto: number[] = [];
  const re = /(?<!\d)(\d{2,3})(?!\d)/g;
  const desde = rin.index ?? 0;
  const hasta = desde + rin[0].length;
  for (const m of n.matchAll(re)) {
    if (m.index >= desde && m.index < hasta) continue;
    resto.push(Number(m[1]));
  }
  const widths = resto.filter((x) => x >= WIDTH_MIN && x <= WIDTH_MAX && x % 5 === 0);
  const aspects = resto.filter((x) => x >= ASPECT_MIN && x <= ASPECT_MAX && x % 5 === 0 && x !== rim);
  if (widths.length !== 1) return null;
  const width = widths[0];
  const perfil = aspects.filter((x) => x !== width);
  if (perfil.length !== 1) return null;
  const aspect = perfil[0];
  if (!isValid(width, aspect, rim)) return null;
  return { width, aspect, rim };
}

/**
 * EL TEXTO CON LAS MEDIDAS TAPADAS, para quien busca otros números en él.
 *
 * Una medida es un número con la misma forma que cualquier otro, y quien lea
 * el texto buscando cantidades la va a contar: «quiero 265/65R17» le daba 265
 * llantas al detector de cantidades grandes (ver `domain/cantidadGrande.ts`).
 * El único que sabe qué es una medida es este archivo —con sus rangos y sus
 * múltiplos de 5—, así que la respuesta se da acá y no se reimplementa afuera.
 *
 * Se tapa con espacios y no se borra: las posiciones del resto del texto no se
 * mueven, y dos palabras que estaban separadas no quedan pegadas.
 */
export function enmascararMedidas(text: string): string {
  const tapar = (dentro: string, re: RegExp, valido: (m: RegExpMatchArray) => boolean): string => {
    let salida = dentro;
    for (const m of dentro.matchAll(re)) {
      if (m.index === undefined || !valido(m)) continue;
      salida =
        salida.slice(0, m.index) + " ".repeat(m[0].length) + salida.slice(m.index + m[0].length);
    }
    return salida;
  };
  let limpio = tapar(text, TIRE_RE, (m) =>
    isValid(Number(m[2]), m[3] !== undefined ? Number(m[3]) : null, Number(m[4])),
  );
  limpio = tapar(limpio, FLOTATION_TEXT_RE, (m) => {
    const diameter = Number(m[1]);
    const section = anchoDeFlotacion(m[2]);
    const rim = Number(m[3]);
    return diameter >= 26 && diameter <= 44 && section >= 6 && section <= 20 && rim >= 12 && rim <= 24;
  });
  return tapar(limpio, CONVENTIONAL_RE, (m) => {
    const width = Number(m[1].replace(",", "."));
    const rim = Number(m[2]);
    return width >= 5 && width <= 14 && rim >= 12 && rim <= 24;
  });
}

/** Parsea un texto que debería ser UNA medida. Null si no se reconoce. */
export function parseTireSize(text: string): TireSize | null {
  const sizes = extractTireSizes(text);
  return sizes.length === 1 ? sizes[0] : null;
}

/** Formato canónico: "185/65R14" o "185R14" (sin perfil). */
export function formatTireSize(size: TireSize): string {
  return size.aspect !== null
    ? `${size.width}/${size.aspect}R${size.rim}`
    : `${size.width}R${size.rim}`;
}

/** Igualdad de medidas (el catálogo puede tener perfil null vs explícito). */
export function sameSize(a: TireSize, b: TireSize): boolean {
  return a.width === b.width && a.aspect === b.aspect && a.rim === b.rim;
}

/**
 * Medida de flotación tal como la escribe la gente: "30x9.5r15", "31X10.50R15".
 *
 * Van aparte de las métricas porque no tienen perfil en % — son pulgadas:
 * diámetro exterior × ancho de sección, sobre el aro. Muy usadas en camioneta
 * y 4x4 en Ecuador, y hasta ahora el bot no las reconocía en absoluto.
 */
export interface FlotationSize {
  /** Diámetro exterior en pulgadas (ej. 30). */
  diameter: number;
  /** Ancho de sección en pulgadas (ej. 9.5). */
  section: number;
  /** Aro en pulgadas (ej. 15). */
  rim: number;
}

// El separador admite `*` además de `x`: el catálogo de Depot trae la MISMA
// llanta escrita de las dos formas («30X9.5R15LT» y «30*9.50R15LT»), y con
// solo `x` la variante del asterisco quedaba sin medida — invisible a toda
// búsqueda por medida aunque estuviera en stock (medido 14-ago sobre los 385
// SKUs reales: 6 familias afectadas, incluidas las 35*12.50R17 y R20).
// El ancho acepta hasta 4 dígitos para leer «33X1250R20», que es 33X12.50R20
// escrito sin punto.
const FLOTATION_TEXT_RE =
  /(?<!\d)(\d{2})\s*[xX*×]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:Z?R\s*|[-\s]\s*)(\d{2})(?!\d)/gi;

/** «1250» → 12.5. Sin punto, los dos últimos dígitos son los decimales. */
function anchoDeFlotacion(crudo: string): number {
  const limpio = crudo.replace(",", ".");
  if (limpio.includes(".")) return Number(limpio);
  const entero = Number(limpio);
  return limpio.length >= 3 ? entero / 100 : entero;
}

/** Extrae medidas de flotación de texto libre. */
export function extractFlotationSizes(text: string): FlotationSize[] {
  const out: FlotationSize[] = [];
  for (const m of text.matchAll(FLOTATION_TEXT_RE)) {
    const diameter = Number(m[1]);
    const section = anchoDeFlotacion(m[2]);
    const rim = Number(m[3]);
    // Rangos reales: por debajo o encima no es una llanta, es otro número.
    if (diameter < 26 || diameter > 44) continue;
    if (section < 6 || section > 20) continue;
    if (rim < 12 || rim > 24) continue;
    if (out.some((s) => s.diameter === diameter && s.section === section && s.rim === rim)) continue;
    out.push({ diameter, section, rim });
  }
  return out;
}

/**
 * Medida CONVENCIONAL de camión liviano: «7.00R15», «6.50R16», «7.50R16».
 *
 * El ancho va en pulgadas con decimales y no hay perfil. Son las KR12 de
 * Kenda que Depot vende para camión: sin este parser quedaban con medida
 * `null` y el bot respondía «no tenemos» a un cliente que preguntaba por algo
 * que está en bodega.
 *
 * El lookbehind evita comerse el ancho de una flotación («30*9.50R15» no es
 * una 9.50R15): quien llama debe probar flotación primero, y este regex
 * además se niega a empezar justo después de una x/asterisco.
 */
export interface ConventionalSize {
  /** Ancho en pulgadas, ej. 7 para 7.00R15. */
  width: number;
  rim: number;
}

const CONVENTIONAL_RE =
  /(?<![\d.,])(?<![xX*×]\s?)(\d{1,2}[.,]\d{2})\s*(?:Z?R\s*|[-\s]\s*)(\d{2})(?!\d)/gi;

export function extractConventionalSizes(text: string): ConventionalSize[] {
  const out: ConventionalSize[] = [];
  for (const m of text.matchAll(CONVENTIONAL_RE)) {
    const width = Number(m[1].replace(",", "."));
    const rim = Number(m[2]);
    if (width < 5 || width > 14) continue;
    if (rim < 12 || rim > 24) continue;
    if (out.some((s) => s.width === width && s.rim === rim)) continue;
    out.push({ width, rim });
  }
  return out;
}

/** «7.00R15» — con los dos decimales, como se imprime en el flanco. */
export function formatConventionalSize(size: ConventionalSize): string {
  return `${size.width.toFixed(2)}R${size.rim}`;
}

/** Forma canónica, sin ceros de más: 30x9.50 y 30x9.5 dan lo mismo. */
export function formatFlotationSize(size: FlotationSize): string {
  return `${size.diameter}X${size.section}R${size.rim}`;
}

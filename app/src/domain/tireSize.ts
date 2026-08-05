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
const TIRE_RE =
  /(?<!\d)(LT|P)?\s*(\d{3})(?:\s*[/.\-\s]\s*(\d{2}))?\s*(?:Z?R\s*|[-.\s]\s*Z?R?\s*)(\d{2})(?!\d)/gi;

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
  return sizes;
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

const FLOTATION_TEXT_RE =
  /(?<!\d)(\d{2})\s*[xX]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:Z?R\s*|[-\s]\s*)(\d{2})(?!\d)/gi;

/** Extrae medidas de flotación de texto libre. */
export function extractFlotationSizes(text: string): FlotationSize[] {
  const out: FlotationSize[] = [];
  for (const m of text.matchAll(FLOTATION_TEXT_RE)) {
    const diameter = Number(m[1]);
    const section = Number(m[2].replace(",", "."));
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

/** Forma canónica, sin ceros de más: 30x9.50 y 30x9.5 dan lo mismo. */
export function formatFlotationSize(size: FlotationSize): string {
  return `${size.diameter}X${size.section}R${size.rim}`;
}

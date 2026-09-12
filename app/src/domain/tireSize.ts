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
// El separador es UNO O MÁS caracteres y admite la coma, el paréntesis y la
// equis: la gente escribe «175//70 R13», «235,75r15», «235)75/15» y
// «315x75R16» (los cuatro, chats del 9 y 10-sep-2026). Y detrás de la R del
// aro puede venir otra barra —«215/65R/16»— porque se escribe de memoria y el
// dedo repite el separador.
const TIRE_RE =
  /(?<!\d)(LT|P)?\s*(\d{3})(?:\s*[/.,\-\s)x×]+\s*(\d{2}))?\s*(?:Z?R\s*[/\-]?\s*|(?:RIN|ARO|RON|RIM)\s*|[-.,/\s)]+\s*(?:Z?R|RIN|ARO|RON|RIM)?\s*[/\-]?\s*)(\d{2})(?!\d)/gi;

/**
 * LA MEDIDA CON PALABRAS EN EL MEDIO: «245/ 70 para camioneta R 16».
 *
 * Conv 18666, 10-sep. El ancho y el perfil van juntos, después el cliente
 * explica para qué la quiere, y al final el aro. `TIRE_RE` exige que entre el
 * perfil y el aro solo haya separadores, así que ese mensaje no traía medida y
 * salió el cierre «necesito la medida exacta» a quien acababa de escribirla.
 *
 * Se exige la R (o «rin»/«aro») delante del aro: sin esa ancla, cualquier par
 * de números con una frase en medio pasaría por medida.
 */
const MEDIDA_CON_PALABRAS_RE =
  /(?<!\d)(\d{3})\s*[/.,\-\s)]+\s*(\d{2})\s*[^\d]{1,24}?(?:Z?R|RIN|ARO)\s*[/\-]?\s*(\d{2})(?!\d)/gi;

/**
 * EL PERFIL QUE LLEGA DESPUÉS DEL ARO: «225R15/75» es 225/75R15.
 *
 * Conv 17647, 9-sep: «Por favor la 225R15/75 TRINGLER». `TIRE_RE` leyó
 * «225R15» —una medida válida, sin perfil— y el «/75» quedó suelto. El bot
 * dijo que no tenía esa medida y le ofreció la KENDA KR601 225/75R15, que era
 * justo la suya, presentada como «equivalente».
 *
 * Corre ANTES que `TIRE_RE` porque su match es más largo y más específico. El
 * separador se limita a barra o guion: con un espacio, «205R16 65» sería
 * indistinguible de una medida seguida de un número cualquiera.
 */
const PERFIL_DESPUES_DEL_ARO_RE =
  /(?<!\d)(\d{3})\s*Z?R\s*(\d{2})\s*[/\-]\s*(\d{2})(?!\d)/gi;

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
  const agregar = (width: number, aspect: number | null, rim: number): void => {
    if (!isValid(width, aspect, rim)) return;
    if (sizes.some((s) => s.width === width && s.aspect === aspect && s.rim === rim)) return;
    sizes.push({ width, aspect, rim });
  };
  // El perfil colgado del final va primero: su match contiene al de TIRE_RE.
  for (const m of text.matchAll(PERFIL_DESPUES_DEL_ARO_RE)) {
    agregar(Number(m[1]), Number(m[3]), Number(m[2]));
  }
  if (sizes.length === 0) {
    for (const match of text.matchAll(TIRE_RE)) {
      agregar(
        Number(match[2]),
        match[3] !== undefined ? Number(match[3]) : null,
        Number(match[4]),
      );
    }
  }
  if (sizes.length === 0) {
    for (const m of text.matchAll(MEDIDA_CON_PALABRAS_RE)) {
      agregar(Number(m[1]), Number(m[2]), Number(m[3]));
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
 *
 * La «R» sola también ancla, y se acepta pegada a la palabra anterior: conv
 * 17707, 9-sep, «Me interesa llantasR15/275/35». Ahí el aro venía primero y de
 * todo el mensaje solo se leyó «15», con lo que salieron llantas de turismo de
 * una medida que nadie pidió. El ancla suelta no basta por sí sola para
 * inventar nada: hacen falta además un ancho y un perfil válidos en el resto
 * del texto, y uno solo de cada uno.
 */
function extractShuffledSize(text: string): TireSize | null {
  const n = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const rin = n.match(/\b(?:rin|aro|ron|rim)\s*(\d{2})\b/) ?? n.match(/r\s*(\d{2})(?!\d)/);
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
  // Las flotación PRIMERO: «33 * 12.5 rin 15» contiene un «12.5 rin 15» que la
  // convencional leería como 12.50R15, y taparla después dejaría medio número
  // suelto para el que venga a contar llantas.
  let limpio = tapar(text, FLOTATION_TEXT_RE, (m) => {
    const diameter = Number(m[1].replace(",", "."));
    const section = anchoDeFlotacion(m[2] ?? m[3]);
    return flotacionValida(diameter, section, Number(m[4]));
  });
  limpio = tapar(limpio, PERFIL_DESPUES_DEL_ARO_RE, (m) =>
    isValid(Number(m[1]), Number(m[3]), Number(m[2])),
  );
  limpio = tapar(limpio, TIRE_RE, (m) =>
    isValid(Number(m[2]), m[3] !== undefined ? Number(m[3]) : null, Number(m[4])),
  );
  limpio = tapar(limpio, MEDIDA_CON_PALABRAS_RE, (m) =>
    isValid(Number(m[1]), Number(m[2]), Number(m[3])),
  );
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
// El aro también se dice con palabras —«32x10.50 Rin 15», «33 * 12.5 rin 15»,
// «37 12.50 rin 20»—, igual que en las métricas. Este lector no lo sabía, y
// esa es la causa de la cotización equivocada del 10-sep (conv 18821: la
// 32x10.50R15 salió como KENDA KR29 215/75R15 por $726.83) y del «no me
// aparece stock» de la conv 18535 con seis unidades en bodega.
//
// El diámetro admite un decimal («30.5/10/R15», conv 17707) y el separador con
// el ancho admite la barra. Nada de esto puede morder una medida métrica: el
// diámetro son DOS dígitos y el lookbehind impide empezar en mitad de un
// número, así que «205/55R16» nunca entra por aquí.
//
// Cuando el separador es un espacio o un guion, el ancho tiene que traer
// decimales: «37 12.50 rin 20» es una flotación, pero «195 50 15» es métrica y
// no puede confundirse con una.
const FLOTATION_TEXT_RE =
  /(?<!\d)(\d{2}(?:[.,]\d)?)\s*(?:[xX*×/]\s*(\d{1,4}(?:[.,]\d{1,2})?)|[-\s]\s*(\d{1,2}[.,]\d{1,2}))\s*(?:Z?R\s*|(?:RIN|ARO|RON|RIM)\s*|[-/\s]\s*(?:Z?R|RIN|ARO|RON|RIM)?\s*)(\d{2})(?!\d)/gi;

/** Rangos reales de una flotación; fuera de esto es otro número. */
function flotacionValida(diameter: number, section: number, rim: number): boolean {
  return (
    diameter >= 26 && diameter <= 44
    && section >= 6 && section <= 20
    && rim >= 12 && rim <= 24
  );
}

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
    const diameter = Number(m[1].replace(",", "."));
    const section = anchoDeFlotacion(m[2] ?? m[3]);
    const rim = Number(m[4]);
    // Rangos reales: por debajo o encima no es una llanta, es otro número.
    if (!flotacionValida(diameter, section, rim)) continue;
    if (out.some((s) => s.diameter === diameter && s.section === section && s.rim === rim)) continue;
    out.push({ diameter, section, rim });
  }
  return out;
}

/**
 * LA FLOTACIÓN A LA QUE LE FALTA EL ANCHO: «MT 30.5 r15», «llantas 33 rin 15».
 *
 * Conv 18677, 10-sep: «¿Dispone llantas MT 30.5 r15?». El diámetro y el aro
 * están, el ancho no. Hasta hoy ese mensaje no era una medida para nadie, así
 * que el detector de aro se quedaba con el 15 y la ruta del aro mandó una
 * KENDA KR29 215/75R15 —una métrica de 27,7 pulgadas de diámetro— diciendo
 * «es la única que tengo para lo que me pidió».
 *
 * Devolver el pedazo que sí se entendió es lo que permite preguntar bien:
 * «¿es 30x9.50R15 o 30x10.50R15?», en vez de adivinar o de pedir la medida
 * entera otra vez.
 */
export function flotacionIncompleta(text: string): { diameter: number; rim: number } | null {
  if (extractFlotationSizes(text).length) return null;
  const n = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const m = n.match(/(?<!\d)(\d{2}(?:[.,]\d)?)\s*(?:[-/\s]\s*)?(?:r|rin|aro|ron|rim)\s*(\d{2})(?!\d)/i);
  if (!m) return null;
  const diameter = Number(m[1].replace(",", "."));
  const rim = Number(m[2]);
  // Un diámetro entero de dos dígitos puede ser cualquier cosa («son 30 r15»
  // dicho de un precio). Se exige que NO sea también un perfil creíble: por
  // debajo de 26 no hay flotación, y 26–44 está fuera del rango de perfiles.
  if (diameter < 26 || diameter > 44) return null;
  if (rim < RIM_MIN || rim > RIM_MAX) return null;
  return { diameter, rim };
}

/**
 * ¿EL CLIENTE ESTÁ ESCRIBIENDO UNA MEDIDA QUE NO SE PUEDE RESOLVER?
 *
 * Tres formas, las tres de chats de esta semana:
 *  · le falta el ancho — «65 R 17» (conv 17668) o «MT 30.5 r15» (conv 18677);
 *  · el perfil no existe — «185/64 R15» (conv 18468: no hay perfiles 64, y el
 *    bot lo trató como medida real «sin stock»);
 *  · hay dos anchos posibles — «200 x 175 R16» (conv 18204).
 *
 * Los tres casos terminaron igual: el bot afirmó algo sobre una medida que
 * nadie había confirmado. Con esto, quien pregunta puede pedir la aclaración
 * en vez de adivinar.
 */
export function medidaIncompleta(text: string): boolean {
  const n = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  // Los dos anchos se miran ANTES de intentar leer la medida: «200 x 175 R16»
  // sí tiene dentro una medida legible (175R16) y quedarse con ella es
  // justamente el error de la conv 18204.
  const dosAnchosAntes = n.match(/(?<!\d)(\d{3})\s*[x×*\s]\s*(\d{3})\s*(?:z?r|rin|aro)\s*(\d{2})(?!\d)/i);
  if (dosAnchosAntes) {
    const rim = Number(dosAnchosAntes[3]);
    const anchos = [Number(dosAnchosAntes[1]), Number(dosAnchosAntes[2])]
      .filter((w) => w >= WIDTH_MIN && w <= WIDTH_MAX);
    if (anchos.length >= 1 && rim >= RIM_MIN && rim <= RIM_MAX) return true;
  }
  if (extractTireSizes(text).length || extractFlotationSizes(text).length) return false;
  if (extractConventionalSizes(text).length) return false;
  if (flotacionIncompleta(text)) return true;
  // Perfil (dos dígitos en rango) + aro, sin ancho delante: «65 R 17».
  const soloPerfil = n.match(/(?<![\d/])(\d{2})\s*(?:[-/\s]\s*)?(?:z?r|rin|aro)\s*(\d{2})(?!\d)/i);
  if (soloPerfil) {
    const perfil = Number(soloPerfil[1]);
    const rim = Number(soloPerfil[2]);
    if (perfil >= ASPECT_MIN && perfil <= ASPECT_MAX && rim >= RIM_MIN && rim <= RIM_MAX) return true;
  }
  // Ancho + perfil + aro con la forma correcta pero un valor imposible:
  // «185/64 R15». Se mira aparte de `isValid` para distinguir «no es una
  // medida» de «es una medida mal escrita».
  const conForma = n.match(/(?<!\d)(\d{3})\s*[/.,\-\s)]+\s*(\d{2})\s*(?:z?r|rin|aro)?\s*[/\-]?\s*(\d{2})(?!\d)/i);
  if (conForma) {
    const [width, aspect, rim] = [Number(conForma[1]), Number(conForma[2]), Number(conForma[3])];
    if (
      width >= WIDTH_MIN && width <= WIDTH_MAX
      && rim >= RIM_MIN && rim <= RIM_MAX
      && aspect >= ASPECT_MIN && aspect <= ASPECT_MAX
    ) return true;
  }
  return false;
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

/**
 * QUÉ MITAD DE LA MEDIDA FALTA, dicho para que el cliente lo lea.
 *
 * Auditoría del 8 al 11-sep-2026. Cuando el cliente escribe casi toda la
 * medida, pedirle «la medida» entera le hace repetir lo que acaba de mandar —y
 * peor: el bot, sin nada que buscar, terminaba adivinando. Conv 18677: «MT
 * 30.5 r15» → una KENDA KR29 215/75R15 como «la única que tengo para lo que me
 * pidió». Conv 17668: «65 R 17» → cotización de 4 FALKEN ZE310 215/40R17.
 *
 * Devuelve la frase que nombra lo que falta, o null cuando la medida está
 * completa (no hay nada que pedir) o cuando no hay medida en absoluto (eso se
 * pregunta con la guía de siempre).
 */
export function loQueFaltaDeLaMedida(text: string): string | null {
  if (!medidaIncompleta(text)) return null;
  const flot = flotacionIncompleta(text);
  if (flot) {
    return `El cliente dio el diámetro *${flot.diameter}* y el aro *${flot.rim}*, pero falta el ANCHO `
      + `(la cifra del medio: 30x**9.50**R15). Pregúntale solo eso, nombrando lo que ya te dio, `
      + `y ofrécele los anchos que existen en ese diámetro si los tienes.`;
  }
  const n = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const dosAnchos = n.match(/(?<!\d)(\d{3})\s*[x×*\s]\s*(\d{3})\s*(?:z?r|rin|aro)\s*(\d{2})(?!\d)/i);
  if (dosAnchos) {
    return `El cliente escribió DOS números de ancho posibles (*${dosAnchos[1]}* y *${dosAnchos[2]}*) `
      + `para el aro *${dosAnchos[3]}*. Pregúntale cuál de los dos es el ancho de su llanta; no elijas por él.`;
  }
  const perfilRaro = n.match(/(?<!\d)(\d{3})\s*[/.,\-\s)]+\s*(\d{2})\s*(?:z?r|rin|aro)?\s*[/\-]?\s*(\d{2})(?!\d)/i);
  if (perfilRaro && Number(perfilRaro[2]) % 5 !== 0) {
    return `La medida que escribió el cliente trae el perfil *${perfilRaro[2]}*, que no existe en el mercado `
      + `(los perfiles van de 5 en 5). Dile que revise el costado y te confirme ese número; no lo redondees tú `
      + `ni le ofrezcas otra medida como si fuera la suya.`;
  }
  const soloPerfil = n.match(/(?<![\d/])(\d{2})\s*(?:[-/\s]\s*)?(?:z?r|rin|aro)\s*(\d{2})(?!\d)/i);
  if (soloPerfil) {
    return `El cliente dio el perfil *${soloPerfil[1]}* y el aro *${soloPerfil[2]}*, pero falta el ANCHO `
      + `(el primer número: **205**/65R16). Pregúntale solo eso, nombrando lo que ya te dio.`;
  }
  return null;
}

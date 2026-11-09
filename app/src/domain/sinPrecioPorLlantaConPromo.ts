/**
 * CANDADO: CON BLACK FRIDAY NO EXISTE UN «$X c/u» PARA FALKEN NI KENDA.
 *
 * Auditoría del 9-nov-2026 (convs 39597, 39731, 18535, 40034, 39573, 40027,
 * 39615, 40082, 39909): la lámina y la cotización decían «2 × $270.49 + 2 ×
 * $108.20 = $757.38» y el texto de al lado «$202.87 c/u» (el precio de hoy,
 * −25 %) o «$251.59 c/u» (la lista). Multiplicado por 4 el cliente obtiene un
 * total que no es ninguno. La fuente única de cómo se dice el precio es
 * `decirPrecioDeLaLinea`; este candado corre DESPUÉS del Guardián y cubre lo
 * que escape (el vendedor, o el propio Guardián, escribiendo un «c/u»).
 *
 * Es determinístico y ve lo que la pieza o la cotización GUARDARON (la promo
 * que el cliente vio): nunca parsea texto del bot para saber qué se ofreció.
 * Si el texto trae «$N c/u» y N es el precio de hoy o el de lista de una línea
 * con promo, ese «$N c/u» se reemplaza por la cuenta de ESA línea.
 */
import { cuentaConRotulo, type SegundaLlanta } from "./promocionDeTemporada.js";

export interface LineaConPromo {
  /** Para el log: «FALKEN WILDPEAK A/T TRAIL». */
  nombre: string;
  /** El precio de hoy (−25 %) por llanta: el que el texto viejo imprimía como «c/u». */
  hoyConIva: number;
  /** El precio de lista por llanta: el que firma la cotización en las impares. */
  listaConIva: number;
  cantidad: number;
  segunda: SegundaLlanta;
}


/**
 * «$202.87 c/u con IVA», «*$202.87 c/u con IVA*», «$202.87 c/u + IVA», «$202.87
 * cada una / cada llanta / por llanta / la unidad», y —si lo trae pegado—
 * «· 4 = $811.48» (el 4 queda en el grupo 5: se compara con la cantidad de la línea).
 */
const PRECIO_POR_LLANTA =
  /(\*?)\$\s?(\d+(?:[.,]\d{1,2})?)(\*?)\s*(?:c\/u|cada\s+una|cada\s+llanta|por\s+llanta|por\s+unidad|la\s+unidad)(?:\s*\+\s*IVA|\s+con\s+IVA)?(\*?)(?:\s*[·•x×]\s*(\d+)\s*=\s*\*?\$\s?\d+(?:[.,]\d{1,2})?\*?)?/gi;

const aCentavos = (v: number) => Math.round(v * 100);

const EN_PALABRAS: Record<string, number> = { una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, ocho: 8 };

/**
 * Las cantidades que el TEXTO DEL BOT menciona: «3 llantas», «una sola llanta»,
 * «las 3», «por 4». Solo sirve para NO reescribir cuando el texto habla de otra
 * cantidad que la de la línea; la cantidad de verdad sale del estado
 * (`lineasConPromo.ts`), nunca de aquí.
 */
function cantidadesDichas(texto: string): number[] {
  const normal = texto.toLowerCase();
  return [
    ...[...normal.matchAll(/\b(\d{1,2})\s+(?:sola\s+|solo\s+)?llantas?\b/g)].map((m) => Number(m[1])),
    ...[...normal.matchAll(/\b(una|un|dos|tres|cuatro|cinco|seis|ocho)\s+(?:sola\s+|solo\s+)?(?:llantas?|unidad(?:es)?)\b/g)].map((m) => EN_PALABRAS[m[1]]),
    ...[...normal.matchAll(/\b(?:las|los|por)\s+(\d{1,2})\b(?![.,]\d)/g)].map((m) => Number(m[1])),
  ];
}

export interface CambioDeCandado {
  /** Lo que decía («$202.87 c/u con IVA»). */
  de: string;
  /** Lo que dice ahora (la cuenta). */
  a: string;
  linea: string;
  /** Quedó un importe suelto al lado de la cuenta (un total viejo): se anota en el log. */
  totalHuerfano: boolean;
}

export function sinPrecioPorLlantaConPromo(
  texto: string,
  lineas: readonly LineaConPromo[],
): { texto: string; cambios: CambioDeCandado[] } {
  if (!lineas.length || !/c\/u|cada\s+una|cada\s+llanta|por\s+llanta|por\s+unidad|la\s+unidad/i.test(texto)) return { texto, cambios: [] };
  const cambios: CambioDeCandado[] = [];
  const dichas = cantidadesDichas(texto);
  const resultado = texto.replace(PRECIO_POR_LLANTA, (...args) => {
    const [completo, a1, numero, a2, a3, nPegado, offset, entero] = args as [string, string, string, string, string, string | undefined, number, string];
    const valor = aCentavos(Number(numero.replace(",", ".")));
    // Una línea con promo cuyo precio de hoy o de lista es este número…
    const linea = lineas.find((l) => aCentavos(l.hoyConIva) === valor || aCentavos(l.listaConIva) === valor);
    if (!linea) return completo;
    // …y el texto no está hablando de OTRA cantidad (con 1 o 3 llantas el «c/u»
    // es correcto: ahí la promo no aplica y el precio por llanta sí existe).
    if (dichas.some((n) => n !== linea.cantidad)) return completo;
    if (nPegado && Number(nPegado) !== linea.cantidad) return completo;
    const cuenta = cuentaConRotulo(linea.cantidad, linea.segunda);
    const negrita = Boolean(a1 || a2 || a3);
    const a = negrita ? `*${cuenta}*` : cuenta;
    // ¿Queda al lado un importe que no es de la cuenta (un total viejo)?
    const resto = entero.slice(offset + completo.length, offset + completo.length + 40);
    const suelto = /^[^.\n]{0,30}?\$\s?(\d+(?:[.,]\d{1,2})?)/.exec(resto);
    const totalHuerfano = Boolean(suelto) && aCentavos(Number(suelto![1].replace(",", "."))) !== aCentavos(linea.segunda.totalConIva);
    cambios.push({ de: completo.trim(), a, linea: linea.nombre, totalHuerfano });
    return a;
  });
  return { texto: resultado, cambios };
}

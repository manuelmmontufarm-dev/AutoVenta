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
 *
 * SEGUNDO RESPALDO, EL CATÁLOGO (replay del 10-nov, conv 39597): el Guardián
 * corrigió una lista y escribió tres llantas de hoy con «c/u»; una estaba en la
 * lámina guardada y las otras dos (KR50 y 4W) no estaban en NINGUNA pieza ni
 * cotización del ciclo, así que no había línea guardada con que emparejarlas y
 * pasaron. Si el «$X c/u» no empareja con una línea guardada, se busca la llanta
 * que ESA MISMA línea de texto nombra (marca + diseño, código) en el catálogo de
 * hoy; si es de una marca de la promo y su precio de hoy o de lista es X, se
 * reemplaza por su cuenta, hecha con la cantidad del ESTADO. El llamador solo
 * entrega este respaldo con cantidad conocida, par y sin vetos en conflicto.
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

/**
 * El catálogo de hoy, a la cantidad del ESTADO. `productosEn(fragmento)` devuelve, de las
 * llantas del catálogo que el fragmento nombra, las que llevan promo con esa cantidad
 * (la cuenta ya calculada). Una llanta de otra marca no vuelve: nunca se reescribe.
 */
export interface RespaldoDelCatalogo {
  productosEn: (fragmento: string) => LineaConPromo[];
}

/** La línea de texto (entre saltos) donde está la posición `offset`. */
function lineaDelTexto(texto: string, offset: number): string {
  const ini = texto.lastIndexOf("\n", offset - 1) + 1;
  const fin = texto.indexOf("\n", offset);
  return texto.slice(ini, fin === -1 ? texto.length : fin);
}

export interface CambioDeCandado {
  /** Lo que decía («$202.87 c/u con IVA»). */
  de: string;
  /** Lo que dice ahora (la cuenta). */
  a: string;
  linea: string;
  /** De dónde salió la línea: lo que la cotización o la pieza guardaron, o el catálogo de hoy. */
  origen: "guardado" | "catalogo";
  /** Quedó un importe suelto al lado de la cuenta (un total viejo): se anota en el log. */
  totalHuerfano: boolean;
}

export function sinPrecioPorLlantaConPromo(
  texto: string,
  lineas: readonly LineaConPromo[],
  respaldo: RespaldoDelCatalogo | null = null,
): { texto: string; cambios: CambioDeCandado[] } {
  if ((!lineas.length && !respaldo) || !/c\/u|cada\s+una|cada\s+llanta|por\s+llanta|por\s+unidad|la\s+unidad/i.test(texto)) return { texto, cambios: [] };
  const cambios: CambioDeCandado[] = [];
  const dichas = cantidadesDichas(texto);
  const resultado = texto.replace(PRECIO_POR_LLANTA, (...args) => {
    const [completo, a1, numero, a2, a3, nPegado, offset, entero] = args as [string, string, string, string, string, string | undefined, number, string];
    const valor = aCentavos(Number(numero.replace(",", ".")));
    // Una línea con promo cuyo precio de hoy o de lista es este número…
    let origen: CambioDeCandado["origen"] = "guardado";
    let linea = lineas.find((l) => aCentavos(l.hoyConIva) === valor || aCentavos(l.listaConIva) === valor);
    if (!linea && respaldo) {
      // …o, si ninguna lo tiene, la llanta que ESTA línea de texto nombra en el catálogo de hoy.
      // Si dos llantas distintas dan cuentas distintas, no se adivina cuál.
      const candidatas = respaldo.productosEn(lineaDelTexto(entero, offset))
        .filter((l) => aCentavos(l.hoyConIva) === valor || aCentavos(l.listaConIva) === valor);
      const cuentas = new Set(candidatas.map((l) => cuentaConRotulo(l.cantidad, l.segunda)));
      if (candidatas.length && cuentas.size === 1) { linea = candidatas[0]; origen = "catalogo"; }
    }
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
    cambios.push({ de: completo.trim(), a, linea: linea.nombre, origen, totalHuerfano });
    return a;
  });
  return { texto: resultado, cambios };
}

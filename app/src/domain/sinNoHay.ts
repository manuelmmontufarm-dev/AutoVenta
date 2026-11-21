/**
 * EN COMPETIMOTOR NO EXISTE «NO HAY» (Carlos Romero y Jenny Paz, 21-nov-2026).
 *
 *   Jenny: «En nuestro lema comercial no existe la palabra no hay al cliente:
 *   siempre hay o podemos conseguirle. Si no hay en stock y tengo opciones,
 *   debería pasarle al vendedor».
 *   Carlos: «En ese caso sería una notificación para que el vendedor vea una
 *   solución».
 *
 *   Conv 469 (20-nov), lo que NO quieren: «En *235/75R15 tipo pantanera (M/T)*
 *   no me aparece stock disponible en este momento, por eso no puedo darle
 *   precio real de esa pantanera.»
 *
 * Con `politica.nuncaDecirNoHay` (Competimotor) cuando lo pedido no tiene
 * stock el bot dice «No me sale en stock en este momento, pero tenemos estas
 * que son parecidas:» y muestra las más cercanas; sin ninguna parecida, que un
 * asesor le revisa cómo conseguirla. Y SIEMPRE sale el aviso al asesor
 * (`services/sinStockAlAsesor.ts`). Depot no tiene el campo: nada cambia.
 *
 * Este módulo es puro: la frase, la regla para el vendedor y el Guardián, el
 * detector y el candado que reescribe lo que se escape.
 */
import { MARCAS_DE_LLANTA_CONOCIDAS } from "./marcasDeLlanta.js";

/** La frase que pidió Manuel, palabra por palabra. */
export const FRASE_SIN_STOCK_CON_OPCIONES = "No me sale en stock en este momento, pero tenemos estas que son parecidas:";
/** Sin ninguna parecida: no se dice «no hay», se dice quién la busca. */
export const FRASE_SIN_STOCK_SIN_OPCIONES =
  "No me sale en stock en este momento, pero un asesor ya le está revisando cómo conseguírsela.";
/** La línea que se agrega cuando hubo aviso y el texto no lo dice. */
export const LINEA_ASESOR_REVISANDO = "Un asesor también lo está revisando para conseguírsela.";

/** Campo que las búsquedas ponen PRIMERO (la huella del Guardián corta a 500 caracteres). */
export const CAMPO_SIN_STOCK = "sin_stock_en_lo_pedido";

/** La regla que va en el resultado de la búsqueda y en el contrato del vendedor. */
export const REGLA_SIN_NO_HAY_VENDEDOR =
  "EN ESTE NEGOCIO NO EXISTE «NO HAY» (regla del dueño, manda sobre cualquier «díselo con todas las letras»): "
  + "PROHIBIDO escribirle al cliente «no hay», «no tengo», «no tenemos», «no me queda», «no me aparece stock», «agotado», "
  + "«sin stock» o «no puedo darle precio». Cuando lo que pidió (medida, tipo o marca) no tiene stock, dilo ASÍ: "
  + `«${FRASE_SIN_STOCK_CON_OPCIONES}» y manda con preparar_opciones las más cercanas, en este orden: misma medida con otro tipo o marca; `
  + "equivalentes (incluida la medida en pulgadas); mismo aro. "
  + `Si no hay ninguna parecida: «${FRASE_SIN_STOCK_SIN_OPCIONES}». `
  + "El sistema ya le avisó al asesor: puedes decir que un asesor también lo está revisando, pero NUNCA prometas que se la consiguen ni un plazo.";

/** Lo que el Guardián recibe como regla del negocio. */
export const REGLA_SIN_NO_HAY_GUARDIAN =
  "REGLA DEL NEGOCIO, SIN EXCEPCIÓN: al cliente NUNCA se le dice «no hay», «no tengo», «no tenemos», «no me queda», "
  + "«no me aparece stock», «agotado», «sin stock» ni «no puedo darle precio». Si el borrador lo dice, es **tono** (severidad alta) "
  + `y tu corrección lo cambia por «${FRASE_SIN_STOCK_CON_OPCIONES}» (si el turno manda opciones) o por «${FRASE_SIN_STOCK_SIN_OPCIONES}» `
  + "(si no manda ninguna), sin agregar llantas, precios ni plazos que el borrador no traía. «No me sale en stock» SÍ está permitido.";

// Lo negado tiene que ser una llanta: «no hay problema», «no tengo ese dato» o
// «no tenemos local fuera de Quito» no hablan del stock y no se tocan.
const TIPOS = "(?:a\\/t|h\\/t|r\\/t|m\\/t|at|ht|rt|mt|pantaner\\w*|todo\\s+terreno|mixtas?)";
const OBJETO = `(?:stock|disponib\\w*|inventario|existencias?|unidades|llantas?|neum[aá]ticos?|`
  + `(?:esa|su|la|esta|una)\\s+medida|(?:ese|este)\\s+(?:modelo|tipo|dise[nñ]o)|(?:esa|esta)\\s+(?:llanta|referencia|opci[oó]n|marca)|`
  + `(?:ninguna|una)\\s+(?:que|de|en|para)|${TIPOS}|\\d{3}\\/\\d{2}\\s*r\\s*\\d{2}|`
  + `${MARCAS_DE_LLANTA_CONOCIDAS.map((m) => m.replace(/\s+/g, "\\s+")).join("|")})`;
const VERBO_NEGADO = "no\\s+(?:(?:le|les|nos)\\s+)?(?:tengo|tenemos|hay|me\\s+queda|nos\\s+queda|queda|quedan|me\\s+aparecen?|aparecen?|"
  + "figuran?|manejo|manejamos|contamos\\s+con|dispongo\\s+de|disponemos\\s+de|encuentro|encontr[eé]|est[aá]n?\\s+disponibles?)";
/** El verbo negado seguido (a ≤40 caracteres, misma frase) de una llanta. */
const NIEGA_LLANTA = new RegExp(`\\b${VERBO_NEGADO}\\b(?=[^.?!\\n]{0,40}?\\b${OBJETO})`, "gi");
/** La llanta ANTES del verbo: «En *235/75R15 tipo pantanera (M/T)* no me aparece…». */
const LLANTA_LUEGO_NIEGA = new RegExp(`\\b${OBJETO}\\b[^.?!\\n]{0,40}?\\b(${VERBO_NEGADO})\\b`, "gi");
const SIN_STOCK = /\b(?:est[aá]n?\s+)?(?:sin\s+stock|agotad[oa]s?)\b/gi;
const NO_PUEDO_PRECIO = /\bno\s+(?:le\s+)?(?:puedo|podr[ií]a|alcanzo\s+a)\s+(?:darle|dar|confirmarle|confirmar|pasarle|ofrecerle)\s+(?:el\s+|un\s+|su\s+)?precio\b/i;

/** ¿El texto le dice al cliente que no hay (en cualquiera de sus formas)? */
export function diceNoHay(texto: string | null | undefined): boolean {
  const t = texto ?? "";
  const prueba = (re: RegExp) => { re.lastIndex = 0; return re.test(t); };
  return prueba(NIEGA_LLANTA) || prueba(LLANTA_LUEGO_NIEGA) || prueba(SIN_STOCK) || NO_PUEDO_PRECIO.test(t);
}

/** Parte un bloque en oraciones conservando la puntuación. */
function oraciones(bloque: string): string[] {
  return bloque.match(/[^.?!\n]+[.?!]*\s*|\n/g) ?? [bloque];
}

/**
 * EL CANDADO: reescribe lo que se escapó. La oración que niega el stock se
 * cambia por la frase del negocio (una sola vez por mensaje); la que dice «no
 * puedo darle precio» se quita. Lo demás queda igual. Si no niega nada,
 * devuelve el texto tal cual (mismo objeto).
 */
export function sinNoHay(texto: string, opts: { hayOpciones: boolean }): string {
  if (!diceNoHay(texto)) return texto;
  const frase = opts.hayOpciones ? FRASE_SIN_STOCK_CON_OPCIONES : FRASE_SIN_STOCK_SIN_OPCIONES;
  let yaDicha = texto.includes("No me sale en stock");
  const bloques = texto.split(/(\n?---\n?)/);
  const salida = bloques.map((bloque) => {
    if (/^\n?---\n?$/.test(bloque)) return bloque;
    return oraciones(bloque).map((o) => {
      if (!diceNoHay(o)) return o;
      const cola = /\s*$/.exec(o)?.[0] ?? "";
      if (NO_PUEDO_PRECIO.test(o) && !yaDicha) {
        yaDicha = true;
        return `${frase}${cola}`;
      }
      if (NO_PUEDO_PRECIO.test(o) || yaDicha) return "";
      yaDicha = true;
      return `${frase}${cola}`;
    }).join("");
  }).join("");
  // Bloques que quedaron vacíos se van con su separador.
  return salida
    .split(/\n?---\n?/)
    .map((b) => b.trim())
    .filter(Boolean)
    .join("\n---\n");
}

/** Lo que pidió el cliente y no tiene stock: lo que va en el aviso al asesor. */
export interface PedidoSinStock {
  medida: string | null;
  tipo: string | null;
  marca: string | null;
  aro: number | null;
}

/** Lee la marca `sin_stock_en_lo_pedido` de un resultado de herramienta. */
export function pedidoSinStockDelResultado(resultado: string): PedidoSinStock | null {
  // La huella corta el resultado a 500 caracteres: el campo va primero y se
  // lee solo (es un objeto plano y corto), no el JSON entero.
  const m = new RegExp(`"${CAMPO_SIN_STOCK}"\\s*:\\s*(\\{[^{}]*\\})`).exec(resultado);
  if (!m) return null;
  try {
    const p = JSON.parse(m[1]) as Partial<PedidoSinStock> | undefined;
    if (!p || typeof p !== "object") return null;
    return { medida: p.medida ?? null, tipo: p.tipo ?? null, marca: p.marca ?? null, aro: p.aro ?? null };
  } catch {
    return null;
  }
}

/** «235/75R15 · tipo M/T · marca KENDA · 4 llantas»: la línea del pedido para el asesor. */
export function describirPedido(p: PedidoSinStock, cantidad: number | null): string {
  return [
    p.medida ?? (p.aro ? `aro ${p.aro}` : null),
    p.tipo ? `tipo ${p.tipo}` : null,
    p.marca ? `marca ${p.marca}` : null,
    cantidad ? `${cantidad} llanta${cantidad === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ") || "lo que pidió (ver el chat)";
}

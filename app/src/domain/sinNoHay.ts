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
 * stock el bot NO NOMBRA EL STOCK: dice «Claro» y recomienda las más cercanas.
 * Y SIEMPRE sale el aviso al asesor (`services/sinStockAlAsesor.ts`). Depot no
 * tiene el campo: nada cambia.
 *
 * 24-nov-2026, Carlos Romero sobre una respuesta real («De CONTINENTAL no me
 * sale en stock en este momento en esa medida, pero tenemos estas…»):
 *   «Eso también se tendría que corregir, que no diga lo de no hay Stock…
 *   sería omitir solo lo de no hay Stock… y decir sí claro, y recomendar.»
 *   «Y cuando pregunten precios por la que quieren y no haya Stock, decir algo
 *   como "Claro, ya le estoy revisando el valor promocional con el que me
 *   llegó esa mercadería" y avisar al Asesor para que intervenga.»
 *   Manuel: «y que continúe con "hasta eso, le puedo recomendar…"». Carlos: «Exacto».
 * La frase del 21-nov («No me sale en stock en este momento…») quedó prohibida.
 *
 * Este módulo es puro: las frases, la regla para el vendedor y el Guardián, el
 * detector y el candado que reescribe lo que se escape.
 */
import { MARCAS_DE_LLANTA_CONOCIDAS } from "./marcasDeLlanta.js";

/** Lo pedido no está y hay parecidas: «sí claro, y recomendar» (Carlos, 24-nov). */
export const FRASE_SIN_STOCK_CON_OPCIONES = "Claro, con gusto. Le recomiendo estas opciones:";
/** Preguntó el PRECIO de la que quiere y no está: la frase de Carlos, palabra por palabra. */
export const FRASE_PRECIO_SIN_STOCK = "Claro, ya le estoy revisando el valor promocional con el que me llegó esa mercadería.";
/** …y la continuación que pidió Manuel («hasta eso, le puedo recomendar…»). */
export const FRASE_PRECIO_SIN_STOCK_CON_OPCIONES = `${FRASE_PRECIO_SIN_STOCK} Hasta eso, le puedo recomendar estas opciones:`;
/** Sin ninguna parecida: no se nombra el stock, se dice quién la revisa. */
export const FRASE_SIN_STOCK_SIN_OPCIONES = "Claro, un asesor ya se la está revisando para ayudarle.";
/** La línea que se agrega cuando hubo aviso y el texto no lo dice. */
export const LINEA_ASESOR_REVISANDO = "Un asesor también lo está revisando para conseguírsela.";

/** Campo que las búsquedas ponen PRIMERO (la huella del Guardián corta a 500 caracteres). */
export const CAMPO_SIN_STOCK = "sin_stock_en_lo_pedido";

const PROHIBIDAS = "«no hay», «no tengo», «no tenemos», «no me queda», «no me aparece stock», «no me sale en stock», "
  + "«no la veo en stock», «agotado», «sin stock» o «no puedo darle precio»";

/** La regla que va en el resultado de la búsqueda y en el contrato del vendedor. */
export const REGLA_SIN_NO_HAY_VENDEDOR =
  "EN ESTE NEGOCIO NO EXISTE «NO HAY» (regla del dueño, manda sobre cualquier «díselo con todas las letras»): "
  + `PROHIBIDO escribirle al cliente ${PROHIBIDAS}. NO NOMBRES EL STOCK NI LA DISPONIBILIDAD de lo que no está. `
  + "Cuando lo que pidió (medida, tipo o marca) no tiene stock, empieza con «Claro» y RECOMIENDA: si nombró una marca, "
  + "di en una frase algo bueno y cierto de ella (solo con datos que tengas) y sigue con "
  + `«le recomiendo estas opciones:»; si no, «${FRASE_SIN_STOCK_CON_OPCIONES}». Manda con preparar_opciones las más cercanas, `
  + "en este orden: misma medida con otro tipo o marca; equivalentes (incluida la medida en pulgadas); mismo aro. "
  + `Si PREGUNTA EL PRECIO de la que quiere y no tiene stock, di palabra por palabra: «${FRASE_PRECIO_SIN_STOCK}» `
  + "y continúa con «Hasta eso, le puedo recomendar estas opciones:» y las más cercanas. NUNCA inventes un precio de lo que no tiene stock. "
  + `Si no hay ninguna parecida: «${FRASE_SIN_STOCK_SIN_OPCIONES}». `
  + "«Claro» NO es afirmar que la tienes: PROHIBIDO decir que sí hay, que llegó o que se la consiguen, y prometer un plazo. "
  + "El sistema ya le avisó al asesor: puedes decir que un asesor también lo está revisando.";

/** Lo que el Guardián recibe como regla del negocio. */
export const REGLA_SIN_NO_HAY_GUARDIAN =
  `REGLA DEL NEGOCIO, SIN EXCEPCIÓN: al cliente NUNCA se le dice ${PROHIBIDAS}, ni se nombra el stock de lo que no está. `
  + "Si el borrador lo dice, es **tono** (severidad alta) y tu corrección QUITA esa frase y pone en su lugar "
  + `«${FRASE_SIN_STOCK_CON_OPCIONES}» (si el turno manda opciones) o «${FRASE_SIN_STOCK_SIN_OPCIONES}» (si no manda ninguna); `
  + `si el cliente preguntó el precio de lo que no está, «${FRASE_PRECIO_SIN_STOCK}» seguido de «Hasta eso, le puedo recomendar estas opciones:» cuando hay opciones. `
  + "No agregues llantas, precios ni plazos que el borrador no traía. "
  + "Esas frases («Claro…», «ya le estoy revisando el valor promocional con el que me llegó esa mercadería», «un asesor ya se la está revisando») "
  + "son texto APROBADO por el dueño y el asesor ya fue avisado: NO son promesa sin respaldo ni dato inventado, déjalas pasar tal cual.";

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
// 24-nov: «no me sale en stock», «no la veo en stock», «en stock no me sale».
// Acá el objeto tiene que ser el stock: «no veo la medida en la foto» es otra cosa.
const VERBO_VER = "no\\s+(?:(?:me|le|lo|la|los|las|se)\\s+)*(?:salen?|veo|vemos|figuran?|aparecen?|registran?)";
const PALABRA_STOCK = "(?:stock|disponib\\w*|inventario|existencias?)";
const NO_SALE_EN_STOCK = new RegExp(`\\b${VERBO_VER}\\b[^.?!\\n]{0,50}?\\b${PALABRA_STOCK}|\\b${PALABRA_STOCK}\\b[^.?!\\n]{0,30}?\\b${VERBO_VER}\\b`, "i");
/** El mensaje ya recomienda con la frase del negocio: no se repite. */
const YA_RECOMIENDA = /valor promocional con el que me lleg|le recomiendo estas opciones|le puedo recomendar/i;
const PIDE_PRECIO = /\b(?:precios?|cu[aá]nto|valor(?:es)?|cuestan?|costos?|a\s+c[oó]mo|cotiz\w*|proforma)\b/i;

/** ¿El cliente está preguntando el precio? (elige la frase del «valor promocional»). */
export function pideElPrecio(texto: string | null | undefined): boolean {
  return PIDE_PRECIO.test(texto ?? "");
}

const SIN_STOCK = /\b(?:est[aá]n?\s+)?(?:sin\s+stock|agotad[oa]s?)\b/gi;
const NO_PUEDO_PRECIO = /\bno\s+(?:le\s+)?(?:puedo|podr[ií]a|alcanzo\s+a)\s+(?:darle|dar|confirmarle|confirmar|pasarle|ofrecerle)\s+(?:el\s+|un\s+|su\s+)?precio\b/i;

/** ¿El texto le dice al cliente que no hay (en cualquiera de sus formas)? */
export function diceNoHay(texto: string | null | undefined): boolean {
  const t = texto ?? "";
  const prueba = (re: RegExp) => { re.lastIndex = 0; return re.test(t); };
  return prueba(NIEGA_LLANTA) || prueba(LLANTA_LUEGO_NIEGA) || prueba(SIN_STOCK) || NO_PUEDO_PRECIO.test(t) || NO_SALE_EN_STOCK.test(t);
}

/** Parte un bloque en oraciones conservando la puntuación. */
function oraciones(bloque: string): string[] {
  return bloque.match(/[^.?!\n]+[.?!]*\s*|\n/g) ?? [bloque];
}

/**
 * EL CANDADO: reescribe lo que se escapó. La oración que niega el stock se
 * cambia por la frase del negocio (una sola vez por mensaje; la del «valor
 * promocional» si el cliente preguntó el precio); la que dice «no
 * puedo darle precio» se quita. Lo demás queda igual. Si no niega nada,
 * devuelve el texto tal cual (mismo objeto).
 */
export function sinNoHay(texto: string, opts: { hayOpciones: boolean; pidePrecio?: boolean }): string {
  if (!diceNoHay(texto)) return texto;
  const frase = opts.pidePrecio
    ? (opts.hayOpciones ? FRASE_PRECIO_SIN_STOCK_CON_OPCIONES : FRASE_PRECIO_SIN_STOCK)
    : (opts.hayOpciones ? FRASE_SIN_STOCK_CON_OPCIONES : FRASE_SIN_STOCK_SIN_OPCIONES);
  // Ya recomienda en una oración que NO niega: la que niega solo se quita.
  let yaDicha = oraciones(texto).some((o) => YA_RECOMIENDA.test(o) && !diceNoHay(o));
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

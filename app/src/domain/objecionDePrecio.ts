/**
 * «ESTÁ CARO» SE CONTESTA, NO SE REPITE LA LISTA (Sprint 2, Competimotor,
 * auditoría 26-nov-2026, familia F-02). Puro: qué dice el cliente y qué se le
 * contesta. Los números llegan hechos (lista de la lámina, catálogo de hoy).
 *
 *   1303 (24-nov 13:22) «Disculpe están muy caras» → el bot repitió la opción 1
 *        y «¿Cuál le cotizo, la 1 o la 2?».
 *   1762 (25-nov 15:34) «El precio esta elevado» → «la más económica equivalente
 *        es la KENDA KR20» y otra vez «¿Le cotizo la 1, la 2 o la 3?».
 *   697  «Ninguna todas está. Carísimas» → la misma Goodyear de la lista.
 *   1321 «No gracias están muy caras» → el asesor cerró con «$164.50 c/u»: el
 *        precio en EFECTIVO (Precio C) de la Falken que el bot dio a $180.55.
 *
 * Lo que hace el asesor que sí cierra, en un turno: (a) el precio en efectivo o
 * transferencia de lo que vio, (b) la opción más barata de su medida que
 * alcance, con su precio, y (c) lo que va incluido. Esto lo arma; el paso
 * `la_objecion_de_precio_se_responde` (`services/prepararSalida.ts`) lo pone
 * DESPUÉS del Guardián, para que no dependa de que el modelo no calque la lista.
 */
import { preguntaDeLaLista } from "./listaDeOpciones.js";

const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * ¿El cliente objeta el precio? «caro», «carísimas», «carito», «elevado», «muy
 * caras», «algo más accesible», «mi tope es…», «se me sale del presupuesto».
 * No es objeción preguntar cuánto cuesta, ni «¿cuál es la más barata?»: eso es
 * pedir un dato y lo contesta la lista.
 */
export function esObjecionDePrecio(texto: string | null | undefined): boolean {
  const n = normal(texto ?? "");
  if (!n.trim()) return false;
  return /\b(?:caro|cara|caros|caras|carito|carita|caritos|caritas|carisim[oa]s?|carazo)\b/.test(n)
    || /\b(?:elevad[oa]s?|exagerad[oa]s?|costos[oa]s?)\b/.test(n)
    || /\bmuy\s+alt[oa]s?\b/.test(n)
    || /\b(?:algo|alguna|algun|otra|otras|opcion|opciones|hay)\s+(?:\w+\s+){0,2}mas\s+(?:accesible|barat\w*|economic\w*)/.test(n)
    || /\bmas\s+accesible\b/.test(n)
    || /\b(?:mi|el)\s+tope\b|\btope\s+(?:es|de|seria)\b|\bpresupuesto\b/.test(n);
}

export interface OpcionVista {
  n?: number;
  nombre: string;
  /** Por llanta, con tarjeta (lo que mostró la lista). */
  tarjeta: number;
  /** Por llanta, en efectivo o transferencia; null si el catálogo no lo trae. */
  efectivo: number | null;
}

export interface OpcionMasBarata {
  nombre: string;
  tarjeta: number;
  efectivo: number | null;
}

const dinero = (v: number) => `$${v.toFixed(2)}`;
const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * La respuesta completa al «está caro», o null si no hay un precio en efectivo
 * que dar (sin eso no hay nada nuevo que decir y sigue el turno del modelo).
 * `masBarata`: la más barata de la medida que NO vio, si es más barata que todo
 * lo que vio; null si la más barata de la medida ya está en lo que vio.
 */
export function respuestaAObjecionDePrecio(input: {
  vistas: readonly OpcionVista[];
  cantidad: number;
  medida: string | null;
  masBarata: OpcionMasBarata | null;
  incluye: string | null;
}): string | null {
  const conEfectivo = input.vistas.filter((v) => v.efectivo !== null && v.efectivo > 0 && v.efectivo < v.tarjeta);
  if (!conEfectivo.length && !input.masBarata) return null;
  const c = Number.isInteger(input.cantidad) && input.cantidad >= 1 ? input.cantidad : 4;
  const cuantas = `${c} ${c === 1 ? "llanta" : "llantas"}`;
  const cu = (unitario: number) => (c > 1 ? ` (${dinero(unitario)} c/u)` : "");
  const numerada = input.vistas.length >= 2 && input.vistas.every((v) => v.n);
  const enLaMedida = input.medida ? ` en *${input.medida}*` : "";
  const partes: string[] = [];
  if (conEfectivo.length) {
    partes.push(
      [
        "Le entiendo 👍 Pagando en *efectivo o transferencia* le queda más bajo:",
        ...conEfectivo.map((v) =>
          `${numerada ? `${v.n} · ` : "• "}${v.nombre} — ${cuantas}: *${dinero(centavos(v.efectivo! * c))}*${cu(v.efectivo!)}`),
      ].join("\n"),
    );
  } else {
    partes.push("Le entiendo 👍");
  }
  const masBarataVista = [...input.vistas].sort((a, b) => a.tarjeta - b.tarjeta)[0];
  if (input.masBarata) {
    const m = input.masBarata;
    const efectivo = m.efectivo !== null && m.efectivo > 0 && m.efectivo < m.tarjeta
      ? ` o *${dinero(centavos(m.efectivo * c))}* en efectivo o transferencia`
      : "";
    partes.push(`Lo más económico que tengo${enLaMedida} es la *${m.nombre}*: ${cuantas} *${dinero(centavos(m.tarjeta * c))}* con tarjeta${efectivo}.`);
  } else if (masBarataVista && input.vistas.length >= 2 && input.medida) {
    // Solo con la medida: sin ella (opciones de varias medidas) no se buscó nada más barato.
    partes.push(`La *${masBarataVista.nombre}* ya es la más económica que tengo${enLaMedida}.`);
  }
  if (input.incluye?.trim()) partes.push(input.incluye.trim());
  const pregunta = input.masBarata
    ? `¿Le cotizo la *${input.masBarata.nombre}*? 😊`
    : numerada
      ? preguntaDeLaLista(input.vistas.length)
      // No «¿Se la cotizo?»: es la que ya se le hizo antes del «caro» y el candado de calcos la quita.
      : "¿Le preparo la cotización? 😊";
  return `${partes.join("\n\n")}\n---\n${pregunta}`;
}

/**
 * ¿Preguntan por descuento o promoción? («en efectivo hay descuento?», «no hay
 * descuentos o promociones en esa medida», «X viernes negro hay más
 * descuento»). Para la línea de la promo que se suma al bloque de precios.
 */
export function preguntaPorDescuentoOPromocion(texto: string | null | undefined): boolean {
  const n = normal(texto ?? "");
  return /\bdescuent\w*|\bpromo\w*|\brebaj\w*|\bblack\s*friday\b|\bviernes\s+negro\b|\boferta\w*|\bmas\s+barat\w*/.test(n);
}

/**
 * La línea que cierra el bloque de precios cuando preguntan por descuento o
 * promoción (Sprint 2, F-02/F-03): con promo vigente en alguna de sus llantas,
 * que ese precio ya la trae; sin ninguna, que el descuento es pagando en
 * efectivo o transferencia. Nunca «ya queda con el precio promocional de Black
 * Friday» para una llanta que no está en la tabla `promociones` (1790, 463).
 */
export function lineaDeDescuentoOPromocion(promociones: readonly (string | null | undefined)[], medida: string | null): string {
  const conPromo = [...new Set(promociones.filter((p): p is string => Boolean(p)))];
  if (conPromo.length) {
    return `Ese precio ya trae la promoción (*${conPromo.join(" · ")}*): no se descuenta otra vez.`;
  }
  const enLaMedida = medida ? ` en *${medida}*` : " en esta medida";
  return `Por ahora${enLaMedida} no hay una promoción vigente: el descuento es pagando en *efectivo o transferencia* 💵.`;
}

/**
 * ¿Esta frase del modelo afirma una promoción? («ya están con valor
 * promocional», «su cotización ya queda con el precio promocional vigente de
 * Black Friday»). Se quita cuando la respuesta de la promo la pone el sistema.
 */
export function afirmaUnaPromocion(frase: string): boolean {
  const n = normal(frase);
  return /\bpromocion\w*|\bpromo\b|\bblack\s*friday\b|\bviernes\s+negro\b|\bprecio\s+especial\b|\bmejora\s+adicional\b/.test(n);
}

const NUMEROS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };

/**
 * La cantidad que el cliente dijo, leída con tolerancia a la ortografía, para
 * que el «está caro» hable de SU cantidad (1321: «Nesecito dos cuanto es el
 * valor»; `extractExplicitQuantity` exige «necesito» bien escrito, y con razón:
 * allá una cantidad mal leída firma una cotización; acá solo cambia un total).
 */
export function cantidadDichaConTolerancia(texto: string | null | undefined): number | null {
  const n = normal(texto ?? "");
  if (/\bun\s+par\b|\bel\s+par\b/.test(n)) return 2;
  const m = n.match(/\b(?:ne[cs]+e[cs]+ito|nesesito|quiero|quisiera|solo|deme|dame|serian|son)\s+(?:las?\s+|unas?\s+)?([1-6]|una?|uno|dos|tres|cuatro|cinco|seis)\b(?!\s*(?:dias?|horas?|meses|semanas|\/))/);
  if (!m) return null;
  return /^\d$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]] ?? null;
}

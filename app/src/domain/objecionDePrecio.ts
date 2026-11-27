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
  // Revisión de la coordinadora (27-nov): «¿cuál es la más cara?», «y la más cara
  // cuánto?» piden un dato, y «no está caro» / «no me parece caro» dicen lo
  // contrario. Esas frases salen antes de buscar «caro»: si no, el paso
  // reemplazaría el turno entero con «Le entiendo 👍».
  const sinFalsos = n
    .replace(/\b(?:la|el|las|los)\s+mas\s+(?:car[oa]s?|barat[oa]s?|economic[oa]s?|accesibles?)\b/g, " ")
    .replace(/\bno\s+(?:(?:esta|estan|es|son|me\s+parecen?|lo\s+veo|las?\s+veo|los\s+veo|se\s+ven?)\s+)?(?:tan\s+|muy\s+|nada\s+)?car[oa]s?\b/g, " ");
  return /\b(?:caro|cara|caros|caras|carito|carita|caritos|caritas|carisim[oa]s?|carazo)\b/.test(sinFalsos)
    || /\b(?:elevad[oa]s?|exagerad[oa]s?|costos[oa]s?)\b/.test(sinFalsos)
    || /\bmuy\s+alt[oa]s?\b/.test(sinFalsos)
    || /\b(?:algo|alguna|algun|otra|otras|opcion|opciones|hay)\s+(?:\w+\s+){0,2}mas\s+(?:accesible|barat\w*|economic\w*)/.test(sinFalsos)
    || /\bmas\s+accesible\b/.test(sinFalsos)
    || /\b(?:mi|el)\s+tope\b|\btope\s+(?:es|de|seria)\b/.test(sinFalsos)
    // «Presupuesto» a secas es pedir la cotización en Ecuador («envíeme el presupuesto
    // de las 4»): solo cuenta como tope.
    || /\b(?:sale|salen|pasa|pasan|excede|exceden)\s+(?:\w+\s+){0,2}(?:del|de\s+mi)\s+presupuesto\b/.test(sinFalsos)
    || /\bfuera\s+de\s+(?:mi\s+)?presupuesto\b|\bno\s+me\s+alcanza\s+(?:el\s+)?presupuesto\b/.test(sinFalsos)
    || /\bmi\s+presupuesto\s+(?:es|son|seria|llega|alcanza|no)\b|\btengo\s+(?:un\s+)?presupuesto\s+de\b/.test(sinFalsos);
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
  /**
   * El cliente acaba de decir OTRA cantidad que la que se le cotizó (1974, 27-nov:
   * cotización de 4 por $671.60 y «Esta caro solo dos necesito»). Lo primero es
   * el precio de SU cantidad con los dos pagos: lo que vio era el total de 4.
   */
  cantidadCambio?: boolean;
}): string | null {
  const conEfectivo = input.vistas.filter((v) => v.efectivo !== null && v.efectivo > 0 && v.efectivo < v.tarjeta);
  if (!conEfectivo.length && !input.masBarata && !input.cantidadCambio) return null;
  const c = Number.isInteger(input.cantidad) && input.cantidad >= 1 ? input.cantidad : 4;
  const cuantas = `${c} ${c === 1 ? "llanta" : "llantas"}`;
  const cu = (unitario: number) => (c > 1 ? ` (${dinero(unitario)} c/u)` : "");
  const numerada = input.vistas.length >= 2 && input.vistas.every((v) => v.n);
  const enLaMedida = input.medida ? ` en *${input.medida}*` : "";
  const partes: string[] = [];
  if (input.cantidadCambio) {
    partes.push(
      [
        `Le entiendo 👍 Para *${cuantas}* le queda así:`,
        ...input.vistas.map((v) => {
          const efectivo = v.efectivo !== null && v.efectivo > 0 && v.efectivo < v.tarjeta
            ? ` o *${dinero(centavos(v.efectivo * c))}* en efectivo o transferencia${cu(v.efectivo)}`
            : cu(v.tarjeta);
          return `${numerada ? `${v.n} · ` : "• "}${v.nombre} — *${dinero(centavos(v.tarjeta * c))}* con tarjeta${efectivo}`;
        }),
      ].join("\n"),
    );
  } else if (conEfectivo.length) {
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
      : input.cantidadCambio
        ? `¿Le preparo la cotización de ${c === 1 ? "la llanta" : `las ${c}`}? 😊`
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
  const NUM = "([1-6]|una?|uno|dos|tres|cuatro|cinco|seis)";
  const m = n.match(new RegExp(`\\b(?:ne[cs]+e[cs]+ito|nesesito|quiero|quisiera|solo|solamente|deme|dame|serian|son)\\s+(?:las?\\s+|unas?\\s+)?${NUM}\\b(?!\\s*(?:dias?|horas?|meses|semanas|\\/))`))
    // 1974 (27-nov): «Esta caro solo dos necesito» — el número antes del verbo.
    ?? n.match(new RegExp(`\\b${NUM}\\s+(?:nomas|no\\s+mas|nada\\s+mas|necesito|nesesito|ne[cs]+e[cs]+ito|quiero|me\\s+(?:hacen|hace)\\s+falta)\\b`));
  if (!m) return null;
  return /^\d$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]] ?? null;
}

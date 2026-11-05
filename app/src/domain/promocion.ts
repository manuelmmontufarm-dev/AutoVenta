/**
 * Cómo se NOMBRA la rebaja: «25 % de descuento» o «3x4» (paga 3, lleva 4).
 *
 * Manuel, 26-oct-2026: por el feriado Depot cambió la promoción de «25 %» a
 * «3x4». Es la misma plata —pagar 3 de 4 llantas es 25 % menos— dicha de otra
 * forma. El precio NO sale de acá: sigue saliendo del catálogo (lista contra
 * venta), y este módulo solo decide el rótulo que llevan la pieza, el PDF, el
 * texto de respaldo, la frase del ahorro, el vendedor y el Guardián. Una sola
 * fuente para los seis, para que nunca digan cosas distintas.
 *
 * El modo lo elige el negocio en Ajustes → Piezas (`pieces_config.promocion`).
 *
 * CANDADO DE VERDAD: «3x4» solo se dice si el descuento real de esa llanta
 * está entre 24 % y 26 %. Una llanta con −18 % rotulada «paga 3 lleva 4»
 * prometería una plata que no es; esa cae al porcentaje, que sí es cierto.
 *
 * Puro: sin base, sin catálogo.
 */

import type { SegundaLlanta } from "./promocionDeTemporada.js";

export const MODOS_PROMOCION = ["porcentaje", "3x4"] as const;
export type ModoPromocion = (typeof MODOS_PROMOCION)[number];

/** El rango en el que «paga 3 lleva 4» es cierto (3/4 = 25 %, ±1 por redondeo). */
const MINIMO_3X4 = 24;
const MAXIMO_3X4 = 26;

export interface EtiquetaDePromocion {
  clase: ModoPromocion;
  /** La cifra grande de la insignia: «−25%» o «3x4». */
  grande: string;
  /** Los dos renglones chicos al lado: «DESCUENTO / HOY» o «PAGA 3 / LLEVA 4». */
  renglones: [string, string];
  /** En una línea, para chips y texto: «−25%» o «3x4 · PAGA 3 LLEVA 4». */
  corta: string;
  /** Para decirla en una oración: «25 % de descuento ya aplicado». */
  frase: string;
}

/** Lo guardado (o lo que llega en un PieceTheme) → un modo válido. Lo desconocido es porcentaje. */
export function modoDePromocion(valor: unknown): ModoPromocion {
  const crudo = valor && typeof valor === "object" ? (valor as { modo?: unknown }).modo : valor;
  return crudo === "3x4" ? "3x4" : "porcentaje";
}

/**
 * ¿Esta llanta, con este descuento, se puede presentar como 3x4?
 *
 * `cantidad` (revisión del 26-oct): «paga 3 lleva 4» solo es verdad con el juego
 * de 4 (o 8, 12…). Una cotización de 2 llantas rotulada así le promete al
 * cliente una cuarta llanta que no está en su total; esa cae al porcentaje, que
 * es la misma plata dicha sin mentir. Sin cantidad (las láminas de OPCIONES,
 * que siempre son el juego de 4) se decide como antes.
 */
export function seMuestraComo3x4(
  modo: ModoPromocion,
  pct: number | null | undefined,
  cantidad?: number | null,
): boolean {
  if (typeof cantidad === "number" && cantidad % 4 !== 0) return false;
  return modo === "3x4" && typeof pct === "number" && pct >= MINIMO_3X4 && pct <= MAXIMO_3X4;
}

export function etiquetaDePromocion(
  modo: ModoPromocion,
  pct: number | null | undefined,
  cantidad?: number | null,
): EtiquetaDePromocion {
  if (seMuestraComo3x4(modo, pct, cantidad)) {
    return {
      clase: "3x4",
      // «4 llantas por el precio de 3», literal (Manuel, 26-oct 17:31): «3x4»
      // y «paga 3 lleva 4» se leían al revés o como otra promo. El modo se
      // sigue llamando "3x4" por dentro; lo que ve el cliente es esto.
      grande: "4x3",
      renglones: ["4 LLANTAS POR", "EL PRECIO DE 3"],
      corta: "4x3 · 4 llantas por el precio de 3",
      frase: "promoción 4x3: 4 llantas por el precio de 3",
    };
  }
  const p = pct ?? 0;
  return {
    clase: "porcentaje",
    grande: `−${p}%`,
    renglones: ["DESCUENTO", "HOY"],
    corta: `−${p}%`,
    frase: `${p} % de descuento ya aplicado`,
  };
}

/** El aviso de Ajustes cuando la llanta de la vista previa no saldría como 3x4. Null = sale bien. */
export function advertenciaDe3x4(pct: number | null | undefined): string | null {
  if (typeof pct !== "number") return "Esta llanta está sin precio de lista: no lleva insignia de promoción.";
  if (pct >= MINIMO_3X4 && pct <= MAXIMO_3X4) return null;
  return `Esta llanta tiene −${pct} %: saldría como porcentaje, no como 3x4.`;
}

/**
 * La línea que el vendedor recibe en el bloque de hechos (`activeBenefitFactsBlock`).
 * En modo porcentaje no hay línea: el prompt queda exactamente como antes.
 */
export function lineaDePromocionVigente(modo: ModoPromocion): string | null {
  if (modo !== "3x4") return null;
  return "PROMOCIÓN VIGENTE (fuente determinística): se presenta como 4x3 — 4 llantas por el precio de 3 (si el cliente dice «3x4», «paga 3 lleva 4» o «25 %», es esta misma). "
    + "Es el mismo precio que imprime la cotización (ya está descontado; no se resta otra vez ni se regala una llanta aparte). "
    // «ya está aplicado en su cotización» (revisión del 26-oct) afirmaba una
    // cotización que a esa altura muchas veces no existe: el cliente pregunta
    // por la promo antes de dar la medida.
    + "Si preguntan «¿tienen el 3x4?»: sí, y se aplica en la cotización. "
    + "Si preguntan por el 25 %: es lo mismo, la misma rebaja dicha de otra forma. "
    + "Solo aplica a las llantas con 25 % de descuento; no inventes un monto distinto al de la cotización.";
}

// ===========================================================================
// Black Friday: el 60 % en las llantas pares, dicho en palabras
// ===========================================================================

/** «2.ª», «2.ª y 4.ª», «2.ª, 4.ª y 6.ª»: las llantas pares que llevan la promo. */
export function paresEnPalabras(unidades: number): string {
  const pares = Array.from({ length: Math.max(1, Math.round(unidades)) }, (_, i) => `${(i + 1) * 2}.ª`);
  return pares.length === 1 ? pares[0] : `${pares.slice(0, -1).join(", ")} y ${pares[pares.length - 1]}`;
}

/** Cuántas llantas van a precio normal: la cantidad, o la deducida de la cuenta si no viene. */
function normalesDe(s: SegundaLlanta, cantidad?: number | null): number {
  if (typeof cantidad === "number" && cantidad >= s.unidades) return Math.round(cantidad) - s.unidades;
  return Math.max(0, Math.round((s.totalConIva - s.unidades * s.precioConIva) / s.precioNormalConIva));
}

/**
 * «*Black Friday*: 60 % menos en su 2.ª y 4.ª llanta — 2 a *$75.00* y 2 a
 * *$30.00*, *$90.00* menos». Las cifras son las de `segundaLlantaDe`, tal cual:
 * la pieza, el PDF, el texto y el Guardián leen la misma.
 */
export function fraseDeSegundaLlanta(s: SegundaLlanta, cantidad?: number | null): string {
  return `*${s.nombre}*: ${s.porcentaje} % menos en su ${paresEnPalabras(s.unidades)} llanta — `
    + `${normalesDe(s, cantidad)} a *$${s.precioNormalConIva.toFixed(2)}* y ${s.unidades} a *$${s.precioConIva.toFixed(2)}*, `
    + `*$${s.ahorroConIva.toFixed(2)}* menos`;
}

/** Lo que `hechoDelAhorro` necesita de `AhorroDeLaCotizacion` (sin importar el módulo, para no hacer un ciclo). */
interface AhorroParaElHecho {
  porcentaje: number;
  porLlanta: number;
  monto: number;
  precioConDescuento: number;
  precioAntes: number;
  /** Las llantas de la cotización: 3x4 solo con múltiplos de 4. */
  cantidad?: number | null;
  /** Black Friday: las pares con el 60 %. Con ella `monto` ya la incluye. */
  segundaLlanta?: SegundaLlanta | null;
  /** Lo que se ahorra solo por el precio de hoy contra el de lista. */
  montoCatalogo?: number;
}

/**
 * El hecho del Black Friday para el Guardián: cada cifra que el texto puede
 * decir («60 %», «la 2.ª a $30», «2 × $75 + 2 × $30», «$90 menos») tiene que
 * estar acá, o la tacha por `precio_incorrecto` (26-ago: lo que el revisor no
 * ve en los hechos, lo borra).
 */
function hechoDeSegundaLlanta(ahorro: AhorroParaElHecho, s: SegundaLlanta): string {
  const normales = normalesDe(s, ahorro.cantidad);
  const catalogo = ahorro.montoCatalogo ?? Math.round((ahorro.monto - s.ahorroConIva) * 100) / 100;
  const porPar = Math.round((s.precioNormalConIva - s.precioConIva) * 100) / 100;
  return "Ahorro de esa cotización: "
    + (ahorro.porcentaje >= 1 && catalogo >= 1
      ? `${ahorro.porcentaje} % menos que el precio de lista: $${ahorro.porLlanta.toFixed(2)} por llanta y $${catalogo.toFixed(2)} en toda la compra `
        + `(precio por llanta con el descuento: $${ahorro.precioConDescuento.toFixed(2)}, antes $${ahorro.precioAntes.toFixed(2)}). Además, `
      : "")
    + `promoción ${s.nombre}: ${s.porcentaje} % menos en la ${paresEnPalabras(s.unidades)} llanta sobre el precio de hoy — `
    + `${normales} × $${s.precioNormalConIva.toFixed(2)} + ${s.unidades} × $${s.precioConIva.toFixed(2)} = $${s.totalConIva.toFixed(2)}; `
    + `cada llanta par cuesta $${s.precioConIva.toFixed(2)} ($${porPar.toFixed(2)} menos) y la promo ahorra $${s.ahorroConIva.toFixed(2)}. `
    + `Ahorro total de la compra: $${ahorro.monto.toFixed(2)}. Total a pagar de esas llantas: $${s.totalConIva.toFixed(2)}. `
    + "Es real y sale de la misma cotización: el bot PUEDE decirlo, y no depende de que el cliente dé el día. "
    + `Decir «${s.porcentaje} %», «la segunda a $${s.precioConIva.toFixed(2)}», «${normales} a $${s.precioNormalConIva.toFixed(2)} y ${s.unidades} a $${s.precioConIva.toFixed(2)}» `
    + `o «$${s.ahorroConIva.toFixed(2)} menos» NO es error. Esta cotización NO se presenta como 4x3: el ${s.nombre} reemplaza ese rótulo. `
    + "Si el cliente nombra como descuento una cifra que es el precio por llanta o el total a pagar, confirmarla («así es», «esa es la idea») es error ALTO **precio_incorrecto**: la corrección aclara cuál es cuál.";
}

/**
 * El hecho del ahorro que lee el Guardián (`services/guardian.ts`).
 *
 * SIN ESTA LÍNEA EL REVISOR BORRA EL DESCUENTO. Probado en el simulador el
 * 26-ago: la ruta directa preguntó el día con «*25 %* de descuento, *$277.44*
 * menos» —cierto, y calculado de la propia cotización— y el guardián lo tachó
 * por `precio_incorrecto`: «esos datos no aparecen en los hechos registrados».
 * Un dato que el revisor no puede verificar es un dato que el revisor borra.
 *
 * En modo 3x4 nombra la promoción igual que la pieza: si no, el revisor tacha
 * «3x4» por no verlo en los hechos, o corrige «es lo mismo que el 25 %».
 */
export function hechoDelAhorro(ahorro: AhorroParaElHecho, modo: ModoPromocion = "porcentaje"): string {
  if (ahorro.segundaLlanta) return hechoDeSegundaLlanta(ahorro, ahorro.segundaLlanta);
  const tres = seMuestraComo3x4(modo, ahorro.porcentaje, ahorro.cantidad);
  // «que equivale al 25 %» fijo y no el porcentaje redondeado: una llanta al
  // −24 % entra al candado, y «3x4, que es 24 % menos» le da al revisor dos
  // cifras que no cuadran entre sí (3 de 4 es 25 % exacto).
  return (tres
    ? "Ahorro de esa cotización: promoción 4x3 (4 llantas por el precio de 3), que equivale al 25 % menos que el precio de lista: "
    : `Ahorro de esa cotización: ${ahorro.porcentaje} % menos que el precio de lista: `)
    + `$${ahorro.porLlanta.toFixed(2)} por llanta y $${ahorro.monto.toFixed(2)} en toda la compra. `
    + `Precio por llanta con el descuento: $${ahorro.precioConDescuento.toFixed(2)} (antes $${ahorro.precioAntes.toFixed(2)}). `
    + "Es real y sale de la misma cotización: el bot PUEDE decirlo, y no depende de que el cliente dé el día. "
    + (tres
      ? "La promoción vigente se presenta como 4x3 (4 llantas por el precio de 3; el cliente puede llamarla «3x4»): decir que la cotización ya la trae, o confirmar que es la misma rebaja del 25 %, NO es error. "
      : "")
    // 12-sep 21:42: el cliente llamó descuento al precio por llanta («q son
    // 58 menos») y el revisor aprobó «Sí, esa es la idea». Con las cifras a
    // la vista puede verlo.
    + "Si el cliente nombra como descuento una cifra que es el precio por llanta o el total a pagar, confirmarla («así es», «esa es la idea») es error ALTO **precio_incorrecto**: la corrección aclara cuál es cuál.";
}

/**
 * Lo que el Guardián sabe de la promoción en este turno (`services/guardian.ts`).
 *
 * Con cotización, el hecho del ahorro con sus cifras. SIN cotización y con la
 * 3x4 vigente (revisión del 26-oct): el cliente pregunta «¿tienen el 3x4?» antes
 * de dar la medida, el vendedor contesta que sí —lo dice su línea de hechos— y
 * el revisor lo tachaba por no ver la promoción en ningún lado. Este hecho le
 * deja afirmarla y le sigue prohibiendo inventar un monto, que sin cotización
 * no hay de dónde sacar. En porcentaje no hay línea: el revisor queda como antes.
 */
export function hechoDeLaPromocion(
  ahorro: AhorroParaElHecho | null | undefined,
  modo: ModoPromocion,
): string | null {
  if (ahorro) return hechoDelAhorro(ahorro, modo);
  if (modo !== "3x4") return null;
  return "Promoción vigente: se presenta como 4x3 (4 llantas por el precio de 3) —el cliente puede llamarla «3x4»—; es la misma rebaja del 25 % que ya traen "
    + "los precios de las llantas con ese descuento, y se aplica en la cotización. Afirmar que existe NO es error; "
    + "inventar un monto sí lo es.";
}

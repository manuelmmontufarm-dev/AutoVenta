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

/** ¿Esta llanta, con este descuento, se puede presentar como 3x4? */
export function seMuestraComo3x4(modo: ModoPromocion, pct: number | null | undefined): boolean {
  return modo === "3x4" && typeof pct === "number" && pct >= MINIMO_3X4 && pct <= MAXIMO_3X4;
}

export function etiquetaDePromocion(modo: ModoPromocion, pct: number | null | undefined): EtiquetaDePromocion {
  if (seMuestraComo3x4(modo, pct)) {
    return {
      clase: "3x4",
      grande: "3x4",
      renglones: ["PAGA 3", "LLEVA 4"],
      corta: "3x4 · PAGA 3 LLEVA 4",
      frase: "promoción 3x4: paga 3 llantas y lleva 4",
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
  return "PROMOCIÓN VIGENTE (fuente determinística): se presenta como 3x4 — paga 3 llantas y lleva 4. "
    + "Es el mismo precio que imprime la cotización (ya está descontado; no se resta otra vez ni se regala una llanta aparte). "
    + "Si preguntan «¿tienen el 3x4?»: sí, y ya está aplicado en su cotización. "
    + "Si preguntan por el 25 %: es lo mismo, la misma rebaja dicha de otra forma. "
    + "Solo aplica a las llantas con 25 % de descuento; no inventes un monto distinto al de la cotización.";
}

/** Lo que `hechoDelAhorro` necesita de `AhorroDeLaCotizacion` (sin importar el módulo, para no hacer un ciclo). */
interface AhorroParaElHecho {
  porcentaje: number;
  porLlanta: number;
  monto: number;
  precioConDescuento: number;
  precioAntes: number;
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
  const tres = seMuestraComo3x4(modo, ahorro.porcentaje);
  return (tres
    ? `Ahorro de esa cotización: promoción 3x4 (paga 3 llantas y lleva 4), que es ${ahorro.porcentaje} % menos que el precio de lista: `
    : `Ahorro de esa cotización: ${ahorro.porcentaje} % menos que el precio de lista: `)
    + `$${ahorro.porLlanta.toFixed(2)} por llanta y $${ahorro.monto.toFixed(2)} en toda la compra. `
    + `Precio por llanta con el descuento: $${ahorro.precioConDescuento.toFixed(2)} (antes $${ahorro.precioAntes.toFixed(2)}). `
    + "Es real y sale de la misma cotización: el bot PUEDE decirlo, y no depende de que el cliente dé el día. "
    + (tres
      ? "La promoción vigente se presenta como 3x4: decir que la cotización ya trae el 3x4, o confirmar que 3x4 y 25 % son la misma rebaja, NO es error. "
      : "")
    // 12-sep 21:42: el cliente llamó descuento al precio por llanta («q son
    // 58 menos») y el revisor aprobó «Sí, esa es la idea». Con las cifras a
    // la vista puede verlo.
    + "Si el cliente nombra como descuento una cifra que es el precio por llanta o el total a pagar, confirmarla («así es», «esa es la idea») es error ALTO **precio_incorrecto**: la corrección aclara cuál es cuál.";
}

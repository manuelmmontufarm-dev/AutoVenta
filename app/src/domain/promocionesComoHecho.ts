/**
 * LAS PROMOCIONES DEL PANEL COMO HECHO (Manuel, 25-nov-2026): «verifica que se
 * refleje bien en el entendimiento del bot cada descuento y que lo pueda
 * explicar bien».
 *
 * Lo que se vio en el simulador con un 4x3 en Winrun cargado por Excel:
 *  · «¿tienen promo?» → el bot recitaba SOLO el Black Friday escrito en la
 *    política; el 4x3 no existía para él.
 *  · «¿el 4x3 se suma con el 25 %?» → contestaba «no se resta otra vez» y
 *    después «Winrun no tiene la promo 4x3»… mientras la cotización salía
 *    bien, con el 4x3 aplicado ($182,05).
 *
 * La causa: el vendedor y el Guardián solo veían cada promo del panel PEGADA a
 * una llanta (`promocion_por_cantidad` en el resultado de una búsqueda). Sin
 * búsqueda en el turno no había hecho, y en ningún lado decía sobre qué precio
 * se cuenta. Acá va la lista entera de lo que el negocio cargó, con la regla
 * de cada una y la del orden: el descuento de siempre baja el precio de hoy y
 * las promos del panel se cuentan sobre ESE precio, así que se suman.
 *
 * Puro: recibe las promociones, el % de siempre y cómo saber la marca de un
 * código. No recalcula ningún precio: las cifras de cada llanta siguen
 * viajando con la llanta (`domain/promociones.ts`).
 */
import {
  promocionVigente,
  reglaEnPalabras,
  vigenciaEnPalabras,
  type Promocion,
} from "./promociones.js";

export interface EntradaDelHecho {
  promos: readonly Promocion[];
  /** % del «Descuento de siempre» vigente (0 = no hay). */
  descuentoDeSiempre: number;
  /** La marca de un código del catálogo de hoy, o null si ya no está. */
  marcaDe: (codigo: string) => string | null;
  ahora?: Date;
}

export interface PromocionEnPalabras {
  nombre: string;
  /** «4x3: lleva 4 y paga 3» */
  queHace: string;
  /** «Winrun» / «Kenda y Falken» / null si no se sabe. */
  marcas: string | null;
  llantas: number;
  vigencia: string;
  porCantidad: boolean;
  regalo: boolean;
}

const MARCAS_QUE_SE_NOMBRAN = 4;
const enPalabras = (marca: string) => marca.charAt(0).toUpperCase() + marca.slice(1).toLowerCase();
function unidos(lista: readonly string[], conector: "y" | "o"): string {
  if (lista.length <= 1) return lista.join("");
  return `${lista.slice(0, -1).join(", ")} ${conector} ${lista.at(-1)}`;
}

// ── Lo que el catálogo leyó de la base (cada sincronización) ────────────────
let fijadas: Omit<EntradaDelHecho, "ahora"> | null = null;
/** Lo llama el catálogo cada vez que lee las promociones (como `fijarTemporadaDelPanel`). */
export function fijarPromocionesDelPanel(entrada: Omit<EntradaDelHecho, "ahora"> | null): void {
  fijadas = entrada;
}
/** Las de la última lectura, o null si todavía no se leyó nada. */
export function promocionesDelPanelFijadas(): Omit<EntradaDelHecho, "ahora"> | null {
  return fijadas;
}

/** Las del panel que corren hoy: ni el descuento de siempre ni la de temporada (esas ya tienen su hecho). */
export function promocionesDelPanelDeHoy(promos: readonly Promocion[], ahora: Date = new Date()): Promocion[] {
  return promos.filter((p) =>
    !p.origen.startsWith("politica:")
    && !p.parametros.todas
    && !p.parametros.temporada
    && p.filas.length > 0
    && promocionVigente(p, ahora));
}

function queHace(p: Promocion): { texto: string; porCantidad: boolean; regalo: boolean } {
  const { parametros: x } = p;
  switch (p.tipo) {
    case "precio_nuevo":
      return { texto: "precio rebajado por llanta (cada una tiene el suyo)", porCantidad: false, regalo: false };
    case "porcentaje": {
      const pcts = [...new Set(p.filas.map((f) => f.porcentaje).filter((v): v is number => typeof v === "number"))];
      return { texto: pcts.length === 1 ? `${pcts[0]} % menos por llanta` : "un % menos por llanta (cada una tiene el suyo)", porCantidad: false, regalo: false };
    }
    case "monto": {
      const montos = [...new Set(p.filas.map((f) => f.monto).filter((v): v is number => typeof v === "number"))];
      return { texto: montos.length === 1 ? `$${montos[0].toFixed(2)} menos por llanta` : "unos dólares menos por llanta (cada una tiene lo suyo)", porCantidad: false, regalo: false };
    }
    case "nxm":
      return { texto: reglaEnPalabras({ t: "nxm", lleva: x.lleva ?? 0, paga: x.paga ?? 0 }), porCantidad: true, regalo: false };
    case "enesima":
      return { texto: reglaEnPalabras({ t: "enesima", posicion: x.posicion ?? 2, porcentaje: x.porcentaje ?? 0 }), porCantidad: true, regalo: false };
    case "escalonado":
      return { texto: `mientras más lleva, más descuento en todas: ${reglaEnPalabras({ t: "escalonado", escalones: x.escalones ?? [] })}`, porCantidad: true, regalo: false };
    case "por_llanta":
      return { texto: "un precio distinto para la 1.ª, 2.ª, 3.ª y 4.ª llanta", porCantidad: true, regalo: false };
    case "juego":
      return { texto: "precio cerrado por el par o por el juego de 4", porCantidad: true, regalo: false };
    case "regalo":
      return { texto: `de regalo: ${(x.regalo ?? "").trim()}`, porCantidad: false, regalo: true };
  }
}

/** Cada promo del panel que corre hoy, dicha en palabras. */
export function promocionesEnPalabras(entrada: EntradaDelHecho): PromocionEnPalabras[] {
  return promocionesDelPanelDeHoy(entrada.promos, entrada.ahora).map((p) => {
    const marcas = [...new Set(p.filas.map((f) => entrada.marcaDe(f.codigo)).filter((m): m is string => Boolean(m)))]
      .map(enPalabras).sort();
    const { texto, porCantidad, regalo } = queHace(p);
    return {
      nombre: p.nombre,
      queHace: texto + (p.textoExtra ? ` (${p.textoExtra})` : ""),
      marcas: marcas.length && marcas.length <= MARCAS_QUE_SE_NOMBRAN ? unidos(marcas, "y") : null,
      llantas: p.filas.length,
      vigencia: vigenciaEnPalabras(p.hasta).larga,
      porCantidad,
      regalo,
    };
  });
}

function enLlantas(p: PromocionEnPalabras): string {
  return p.marcas ? `en ${p.llantas} llanta${p.llantas === 1 ? "" : "s"} ${p.marcas}` : `en ${p.llantas} llantas del inventario`;
}

/**
 * El hecho para el vendedor y el revisor: la lista entera y cómo se cuenta.
 * Null si el negocio no tiene ninguna promo del panel corriendo hoy.
 */
export function hechoDePromocionesDelPanel(entrada: EntradaDelHecho, para: "vendedor" | "revisor" = "vendedor"): string | null {
  const lista = promocionesEnPalabras(entrada);
  if (!lista.length) return null;
  const siempre = entrada.descuentoDeSiempre > 0 ? entrada.descuentoDeSiempre : 0;
  const lineas = [
    "PROMOCIONES CARGADAS POR EL NEGOCIO EN EL PANEL, VIGENTES HOY (fuente determinística; además de lo de arriba):",
    ...lista.map((p) => `- «${p.nombre}»: ${p.queHace}, ${enLlantas(p)}${p.vigencia ? `, ${p.vigencia}` : ""}.`),
    siempre
      ? `- CÓMO SE CUENTAN: el descuento de siempre (${siempre} %) ya está en el precio de hoy de cada llanta, y estas promociones se cuentan SOBRE ese precio de hoy. Se SUMAN: primero el ${siempre} %, después la promoción. Si preguntan «¿se suma con el ${siempre} %?», la respuesta es SÍ, y el ejemplo es la cifra de la llanta.`
      : "- CÓMO SE CUENTAN: sobre el precio de hoy de cada llanta.",
    "- Con el Black Friday de la 2.ª llanta (Falken/Kenda) NO se suman: la cotización usa la que deja la llanta más barata. Si gana la del panel, la llanta trae un precio por llanta y ese es el precio; si gana el Black Friday, trae su cuenta.",
    "- Las que dependen de la cantidad (lleva N paga M, la N.ª llanta, por par o juego, por cantidad) cambian el precio SOLO con la cantidad que piden; con otra cantidad la llanta va a su precio de hoy. La cifra exacta de cada llanta y cada cantidad viene en sus datos (promocion_por_cantidad) y en la cotización, que la aplica sola: no calcules otra.",
  ];
  if (para === "vendedor") {
    lineas.push("- Si preguntan si hay promociones, nombra TAMBIÉN estas, en la misma frase corta. Si preguntan cómo funciona una, explícala con su regla y con la cifra de SU llanta y SU cantidad.");
  } else {
    lineas.push("- PARA EL REVISOR: nombrar estas promociones, explicar su regla o decir que se suman con el descuento de siempre NO es error ni hecho inventado. SÍ es error negar que existen, decir que no se suman, o dar una cifra distinta a la de la llanta.");
  }
  return lineas.join("\n");
}

/** La parte corta para «¿tienen promociones?»: «4x3 en Winrun (lleva 4 y paga 3)». Null si no hay. */
export function resumenDePromocionesDelPanel(entrada: EntradaDelHecho): string | null {
  const lista = promocionesEnPalabras(entrada);
  if (!lista.length) return null;
  return unidos(lista.map((p) => `«${p.nombre}» ${p.marcas ? `en ${p.marcas} ` : ""}(${p.queHace})`), "y");
}

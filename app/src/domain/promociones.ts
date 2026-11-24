/**
 * PROMOCIONES QUE EL NEGOCIO ARMA SOLO (pestaña «Promociones», 24-nov-2026).
 *
 * Manuel: «la idea es que yo ya no haga las promociones sino ellos». El negocio
 * elige un TIPO, le pone nombre, texto y fechas, baja un Excel con su stock y
 * el precio de hoy, lo llena, lo sube, y la promoción queda guardada: se prende
 * y se apaga con un interruptor.
 *
 * Este módulo es PURO: los tipos, las cuentas y los candados. No lee la base ni
 * el catálogo (eso es `services/promociones.ts`).
 *
 * CÓMO LLEGA AL CLIENTE. Toda promoción termina en UNA cifra: el precio por
 * llanta que el cliente paga, que se monta sobre el mecanismo que ya dibuja el
 * precio tachado (`domain/preciosEspeciales.ts`): el precio de hoy pasa a ser
 * el de la promo y el de siempre queda como el tachado. Así la pieza, el PDF,
 * el texto, las cuotas, el Guardián y la cotización firmada dicen la misma
 * cifra y el mismo porcentaje, sin que ninguno la recalcule.
 *
 *  - Promos «parejas» (precio nuevo, % o $ de descuento): el mismo precio con
 *    cualquier cantidad. Se aplican al catálogo.
 *  - Promos «por cantidad» (precio por llanta 1-2-3-4, lleva N paga M, la N.ª
 *    con descuento, precio por juego, escalonada): el total depende de cuántas
 *    lleva. El precio por llanta de la cotización es total ÷ cantidad (hacia
 *    abajo al centavo: el cliente nunca paga más que la cuenta), que es como
 *    Depot presentó el «4x3» en octubre: la misma plata dicha como −25 %.
 *    Se resuelven al cotizar, con la cantidad en la mano (`productoParaCantidad`).
 *  - «Regalo»: no cambia el precio; es una línea más en la cotización.
 *
 * CANDADOS (los mismos del Black Friday de Competimotor, que salió bien):
 *   - la llanta tiene que existir en el inventario de hoy y, si el Excel trae
 *     medida, ser esa medida (un código reusado no hereda el precio);
 *   - el precio de la promo tiene que ser MENOR que el de hoy: nadie paga más
 *     por una promoción;
 *   - fuera de fechas o apagada, no existe.
 */
import type { CatalogItem } from "./catalog.js";

export const TIPOS_DE_PROMOCION = [
  "precio_nuevo", "porcentaje", "monto", "por_llanta", "nxm", "enesima", "juego", "escalonado", "regalo",
] as const;
export type TipoDePromocion = (typeof TIPOS_DE_PROMOCION)[number];

/** Lo que se configura una sola vez para toda la promoción (no por llanta). */
export interface ParametrosDePromocion {
  /** nxm: lleva `lleva`, paga `paga` (4x3 = lleva 4, paga 3). */
  lleva?: number;
  paga?: number;
  /** enesima: cada `posicion`.ª llanta va con `porcentaje` % menos (100 = gratis). */
  posicion?: number;
  porcentaje?: number;
  /** escalonado: desde cuántas llantas, qué % menos en todas. */
  escalones?: Array<{ desde: number; porcentaje: number }>;
  /** regalo: lo que se lleva («alineación gratis»). */
  regalo?: string;
  /**
   * porcentaje: `todas` = el `porcentaje` va a TODAS las llantas del inventario,
   * sin Excel (el «Descuento de siempre» de Depot, 24-nov-2026). No es una
   * promo como las demás: baja el PRECIO DE HOY de cada llanta (sin rótulo de
   * promoción) y las promos del panel se cuentan sobre ese precio.
   */
  todas?: boolean;
}

/** Una llanta de la promoción, como quedó guardada. */
export interface FilaDePromocion {
  codigo: string;
  /** La medida que tenía al subir el Excel: candado contra códigos reusados. */
  medida: string | null;
  /** precio_nuevo: precio final por llanta, con IVA. */
  precio?: number;
  /** porcentaje: % menos sobre el precio de hoy. */
  porcentaje?: number;
  /** monto: dólares menos por llanta. */
  monto?: number;
  /** por_llanta: precio de la 1.ª, 2.ª, 3.ª y 4.ª llanta (null = precio normal). */
  porLlanta?: Array<number | null>;
  /** juego: precio del par y del juego de 4 (con IVA, por el paquete entero). */
  juego2?: number | null;
  juego4?: number | null;
}

export interface Promocion {
  id: number;
  nombre: string;
  tipo: TipoDePromocion;
  /** Texto libre del negocio: sale junto al nombre en la cotización. */
  textoExtra: string | null;
  activa: boolean;
  /** Días de Ecuador, inclusive («2026-12-05»). Null = sin límite por ese lado. */
  desde: string | null;
  hasta: string | null;
  parametros: ParametrosDePromocion;
  filas: FilaDePromocion[];
  /** «panel» o «politica:<nombre>» (la que venía escrita en el código). */
  origen: string;
  creadaEn: string;
  actualizadaEn: string;
}

// ── Catálogo de tipos: lo que ve el negocio al elegir ───────────────────────

export interface TipoParaElPanel {
  id: TipoDePromocion;
  nombre: string;
  /** Una frase: qué hace. */
  queHace: string;
  ejemplo: string;
  /** Columnas que el negocio llena en el Excel. */
  columnas: string[];
  /** Parámetros que se piden antes de bajar el Excel. */
  pide: Array<"lleva_paga" | "posicion_porcentaje" | "escalones" | "regalo">;
  /** ¿El precio depende de cuántas llantas lleva? */
  porCantidad: boolean;
}

export const COL = {
  codigo: "Código",
  marca: "Marca",
  modelo: "Modelo",
  medida: "Medida",
  stock: "Stock",
  precioHoy: "Precio actual (con IVA)",
  precioEfectivo: "Precio efectivo (con IVA)",
  precioNuevo: "Precio promoción (con IVA)",
  porcentaje: "% de descuento",
  monto: "Descuento en $ por llanta",
  llanta1: "Precio llanta 1",
  llanta2: "Precio llanta 2",
  llanta3: "Precio llanta 3",
  llanta4: "Precio llanta 4",
  juego2: "Precio del par (2 llantas)",
  juego4: "Precio del juego (4 llantas)",
  aplica: "Aplica (escriba X)",
} as const;

export const TIPOS_PARA_EL_PANEL: readonly TipoParaElPanel[] = [
  {
    id: "precio_nuevo", nombre: "Precio de promoción",
    queHace: "Cada llanta tiene su precio nuevo. El de hoy sale tachado y el bot calcula el porcentaje.",
    ejemplo: "Kenda KR20 de $130 a $115", columnas: [COL.precioNuevo], pide: [], porCantidad: false,
  },
  {
    id: "porcentaje", nombre: "Porcentaje de descuento",
    queHace: "Usted escribe el % de cada llanta y el bot calcula el precio.",
    ejemplo: "15 % menos en las Falken", columnas: [COL.porcentaje], pide: [], porCantidad: false,
  },
  {
    id: "monto", nombre: "Dólares de descuento",
    queHace: "Tantos dólares menos por cada llanta.",
    ejemplo: "$10 menos en cada llanta", columnas: [COL.monto], pide: [], porCantidad: false,
  },
  {
    id: "por_llanta", nombre: "Precio por llanta 1, 2, 3 y 4",
    queHace: "Un precio distinto para la 1.ª, la 2.ª, la 3.ª y la 4.ª llanta. Deje vacía la que va a precio normal.",
    ejemplo: "La 4.ª llanta a $50", columnas: [COL.llanta1, COL.llanta2, COL.llanta3, COL.llanta4], pide: [], porCantidad: true,
  },
  {
    id: "nxm", nombre: "Lleva N, paga M",
    queHace: "Lleva tantas y paga menos: 4x3, 3x2, 2x1.",
    ejemplo: "4x3: lleva 4 y paga 3", columnas: [COL.aplica], pide: ["lleva_paga"], porCantidad: true,
  },
  {
    id: "enesima", nombre: "La 2.ª (o la N.ª) llanta con descuento",
    queHace: "Cada segunda, tercera o cuarta llanta va con un % menos. Con 100 % es gratis.",
    ejemplo: "La 2.ª llanta a mitad de precio", columnas: [COL.aplica], pide: ["posicion_porcentaje"], porCantidad: true,
  },
  {
    id: "juego", nombre: "Precio por par o por juego",
    queHace: "Un precio cerrado por el par y/o por el juego de 4.",
    ejemplo: "El juego de 4 por $399", columnas: [COL.juego2, COL.juego4], pide: [], porCantidad: true,
  },
  {
    id: "escalonado", nombre: "Descuento por cantidad",
    queHace: "Mientras más llantas lleva, más descuento en todas.",
    ejemplo: "2 llantas 5 % · 4 llantas 10 %", columnas: [COL.aplica], pide: ["escalones"], porCantidad: true,
  },
  {
    id: "regalo", nombre: "Regalo o beneficio",
    queHace: "No cambia el precio: la cotización dice lo que se lleva de regalo.",
    ejemplo: "Alineación gratis con el juego", columnas: [COL.aplica], pide: ["regalo"], porCantidad: false,
  },
];

export const tipoParaElPanel = (tipo: TipoDePromocion): TipoParaElPanel =>
  TIPOS_PARA_EL_PANEL.find((t) => t.id === tipo)!;

// ── Fechas (días de Ecuador, UTC−5 sin horario de verano) ───────────────────

const OFFSET_ECUADOR_MS = 5 * 60 * 60 * 1000;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

export const esDia = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

function diaEnEcuador(ahora: Date): string {
  return new Date(ahora.getTime() - OFFSET_ECUADOR_MS).toISOString().slice(0, 10);
}

/** Primer instante del día de Ecuador. */
const inicioDelDia = (dia: string) => Date.parse(`${dia}T00:00:00-05:00`);
/** Último instante vigente del día de Ecuador, ISO. */
export const finDelDiaIso = (dia: string) => `${dia}T23:59:59-05:00`;
/** Sin fecha de fin: un instante que no llega (el campo `hasta` del catálogo es obligatorio). */
export const SIN_FIN_ISO = "9999-12-31T23:59:59-05:00";

/** «hasta el sábado 5 de diciembre» / «hasta el sábado 5-dic»; vacío sin fecha de fin. */
export function vigenciaEnPalabras(hasta: string | null): { larga: string; corta: string } {
  if (!esDia(hasta)) return { larga: "", corta: "" };
  const [, mes, dia] = hasta.split("-").map(Number);
  const nombreDia = DIAS[new Date(`${hasta}T12:00:00Z`).getUTCDay()];
  return {
    larga: `hasta el ${nombreDia} ${dia} de ${MESES[mes - 1]}`,
    corta: `hasta el ${nombreDia} ${dia}-${MESES_CORTOS[mes - 1]}`,
  };
}

export type EstadoDePromocion = "activa" | "apagada" | "programada" | "vencida";

export function estadoDePromocion(p: Pick<Promocion, "activa" | "desde" | "hasta">, ahora: Date = new Date()): EstadoDePromocion {
  const hoy = diaEnEcuador(ahora);
  if (p.hasta && hoy > p.hasta) return "vencida";
  if (!p.activa) return "apagada";
  if (p.desde && hoy < p.desde) return "programada";
  return "activa";
}

export const promocionVigente = (p: Pick<Promocion, "activa" | "desde" | "hasta">, ahora: Date = new Date()): boolean =>
  estadoDePromocion(p, ahora) === "activa";

/**
 * Milisegundos hasta el próximo instante en que alguna promoción prendida
 * empieza o termina, o null si no hay ninguno. Con eso el catálogo se vuelve a
 * armar a la hora justa, sin esperar la sincronización de cada 5 minutos.
 */
export function msHastaElProximoCambioDePromociones(
  promos: ReadonlyArray<Pick<Promocion, "activa" | "desde" | "hasta">>,
  ahora: Date = new Date(),
): number | null {
  const t = ahora.getTime();
  let mejor: number | null = null;
  for (const p of promos) {
    if (!p.activa) continue;
    const instantes = [p.desde ? inicioDelDia(p.desde) : null, p.hasta ? Date.parse(finDelDiaIso(p.hasta)) + 1000 : null];
    for (const i of instantes) {
      if (i !== null && i > t && (mejor === null || i - t < mejor)) mejor = i - t;
    }
  }
  return mejor;
}

// ── Las cuentas ─────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
const dinero = (n: number) => `$${n.toFixed(2)}`;
const ordinal = (n: number) => `${n}.ª`;

/** La regla de una promo por cantidad, ya resuelta para UNA llanta. */
export type ReglaPorCantidad =
  | { t: "por_llanta"; precios: number[] }
  | { t: "nxm"; lleva: number; paga: number }
  | { t: "enesima"; posicion: number; porcentaje: number }
  | { t: "juego"; juego2: number | null; juego4: number | null }
  | { t: "escalonado"; escalones: Array<{ desde: number; porcentaje: number }> };

/** Lo que el cliente paga por `cantidad` llantas, con IVA. `base` es el precio de hoy por llanta. */
export function totalConPromocion(regla: ReglaPorCantidad, base: number, cantidad: number): number {
  const q = Math.max(0, Math.round(cantidad));
  switch (regla.t) {
    case "por_llanta": {
      let total = 0;
      for (let i = 0; i < q; i++) total += regla.precios[i % regla.precios.length];
      return round2(total);
    }
    case "nxm": {
      const gratis = Math.floor(q / regla.lleva) * (regla.lleva - regla.paga);
      return round2((q - gratis) * base);
    }
    case "enesima": {
      const rebajadas = Math.floor(q / regla.posicion);
      return round2((q - rebajadas) * base + rebajadas * round2(base * (1 - regla.porcentaje / 100)));
    }
    case "juego": {
      // Paquetes más grandes primero; lo que sobra va a precio normal.
      let resto = q;
      let total = 0;
      if (regla.juego4 !== null) { total += Math.floor(resto / 4) * regla.juego4; resto %= 4; }
      if (regla.juego2 !== null) { total += Math.floor(resto / 2) * regla.juego2; resto %= 2; }
      return round2(total + resto * base);
    }
    case "escalonado": {
      const escalon = [...regla.escalones].sort((a, b) => b.desde - a.desde).find((e) => q >= e.desde);
      return round2(q * base * (1 - (escalon?.porcentaje ?? 0) / 100));
    }
  }
}

/**
 * El precio POR LLANTA con que se firma una cotización de `cantidad` llantas, o
 * null si con esa cantidad la promo no rebaja nada (una sola llanta en un 4x3).
 * Hacia abajo al centavo: precio × cantidad nunca supera la cuenta de la promo.
 */
export function unidadConPromocion(regla: ReglaPorCantidad, base: number, cantidad: number): number | null {
  const q = Math.round(cantidad);
  if (!(q >= 1) || !(base > 0)) return null;
  const unidad = Math.floor((totalConPromocion(regla, base, q) * 100) / q + 1e-6) / 100;
  return unidad > 0 && unidad < base ? unidad : null;
}

/** La regla dicha en una frase, para el cliente y para los hechos del bot. */
export function reglaEnPalabras(regla: ReglaPorCantidad, _base?: number): string {
  switch (regla.t) {
    case "por_llanta":
      return regla.precios.map((p, i) => `${ordinal(i + 1)} ${p <= 0 ? "gratis" : dinero(p)}`).join(" · ");
    case "nxm":
      return `${regla.lleva}x${regla.paga}: lleva ${regla.lleva} y paga ${regla.paga}`;
    case "enesima":
      return regla.porcentaje >= 100
        ? `la ${ordinal(regla.posicion)} llanta gratis`
        : `${regla.porcentaje} % menos en la ${ordinal(regla.posicion)} llanta`;
    case "juego":
      return [
        regla.juego2 !== null ? `el par por ${dinero(regla.juego2)}` : null,
        regla.juego4 !== null ? `el juego de 4 por ${dinero(regla.juego4)}` : null,
      ].filter(Boolean).join(" · ");
    case "escalonado":
      return [...regla.escalones].sort((a, b) => a.desde - b.desde)
        .map((e) => `${e.desde} llanta${e.desde === 1 ? "" : "s"} o más: ${e.porcentaje} % menos`).join(" · ");
  }
}

/** Lo que una promoción le hace a una llanta. */
export type EfectoDePromocion =
  | { clase: "pareja"; precio: number }
  | { clase: "cantidad"; regla: ReglaPorCantidad }
  | { clase: "regalo"; texto: string };

export type ResultadoDeFila =
  | { ok: true; efecto: EfectoDePromocion; advertencias: string[] }
  | { ok: false; motivo: string };

const entre = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

/** ¿Los parámetros del tipo están completos y tienen sentido? Null = sí. */
export function errorDeParametros(tipo: TipoDePromocion, p: ParametrosDePromocion): string | null {
  if (tipo === "nxm") {
    if (!Number.isInteger(p.lleva) || !Number.isInteger(p.paga)) return "Falta decir cuántas lleva y cuántas paga.";
    if (!(p.lleva! >= 2 && p.lleva! <= 12)) return "«Lleva» tiene que ser entre 2 y 12.";
    if (!(p.paga! >= 1 && p.paga! < p.lleva!)) return "«Paga» tiene que ser menor que «lleva».";
  }
  if (tipo === "enesima") {
    if (!Number.isInteger(p.posicion) || !(p.posicion! >= 2 && p.posicion! <= 12)) return "Diga qué llanta lleva el descuento (2.ª, 3.ª, 4.ª…).";
    if (!entre(p.porcentaje, 1, 100)) return "El porcentaje tiene que estar entre 1 y 100.";
  }
  if (tipo === "escalonado") {
    const e = p.escalones ?? [];
    if (!e.length) return "Agregue al menos un escalón (por ejemplo: desde 4 llantas, 10 %).";
    if (e.some((x) => !Number.isInteger(x.desde) || x.desde < 1 || x.desde > 40 || !entre(x.porcentaje, 1, 99))) {
      return "Cada escalón necesita desde cuántas llantas (1 a 40) y un porcentaje entre 1 y 99.";
    }
    if (new Set(e.map((x) => x.desde)).size !== e.length) return "Hay dos escalones para la misma cantidad.";
  }
  if (tipo === "regalo" && !(p.regalo ?? "").trim()) return "Escriba qué se lleva de regalo.";
  if (tipo === "porcentaje" && p.todas && !entre(p.porcentaje, 1, 99)) return "El porcentaje tiene que estar entre 1 y 99.";
  return null;
}

/** Sobre este % de rebaja se avisa «revise que no sea un error de tipeo» (no se bloquea). */
export const DESCUENTO_QUE_SE_AVISA = 50;

/**
 * La fila del Excel contra la llanta de hoy: el efecto, o por qué no entra.
 * `base` es el precio de hoy por llanta con IVA, antes de cualquier promoción.
 */
export function efectoDeLaFila(
  tipo: TipoDePromocion,
  parametros: ParametrosDePromocion,
  fila: FilaDePromocion,
  base: number,
): ResultadoDeFila {
  if (!(base > 0)) return { ok: false, motivo: "la llanta no tiene precio hoy" };
  const advertencias: string[] = [];
  const avisarSiEsMucho = (precio: number) => {
    const pct = Math.round((1 - precio / base) * 100);
    if (pct > DESCUENTO_QUE_SE_AVISA) advertencias.push(`${pct} % de descuento: revise que no sea un error de tipeo`);
  };
  const pareja = (precio: number): ResultadoDeFila => {
    const p = round2(precio);
    if (!(p > 0)) return { ok: false, motivo: "el precio de promoción queda en cero o menos" };
    if (p >= base) return { ok: false, motivo: `${dinero(p)} no es menor que el precio de hoy (${dinero(base)})` };
    avisarSiEsMucho(p);
    return { ok: true, efecto: { clase: "pareja", precio: p }, advertencias };
  };
  const porCantidad = (regla: ReglaPorCantidad): ResultadoDeFila => {
    // Tiene que rebajar con ALGUNA cantidad razonable (hasta 8 llantas).
    const mejor = [1, 2, 3, 4, 5, 6, 8].map((q) => unidadConPromocion(regla, base, q)).filter((u): u is number => u !== null);
    if (!mejor.length) return { ok: false, motivo: "con estos valores la promoción no rebaja nada" };
    avisarSiEsMucho(Math.min(...mejor));
    return { ok: true, efecto: { clase: "cantidad", regla }, advertencias };
  };

  switch (tipo) {
    case "precio_nuevo":
      if (typeof fila.precio !== "number") return { ok: false, motivo: "sin precio de promoción" };
      return pareja(fila.precio);
    case "porcentaje":
      if (!entre(fila.porcentaje, 0.01, 99.99)) return { ok: false, motivo: "el porcentaje tiene que estar entre 1 y 99" };
      return pareja(base * (1 - fila.porcentaje / 100));
    case "monto":
      if (!(typeof fila.monto === "number" && fila.monto > 0)) return { ok: false, motivo: "sin monto de descuento" };
      return pareja(base - fila.monto);
    case "por_llanta": {
      const crudos = fila.porLlanta ?? [];
      if (!crudos.some((p) => typeof p === "number")) return { ok: false, motivo: "sin ningún precio por llanta" };
      const precios = [0, 1, 2, 3].map((i) => (typeof crudos[i] === "number" ? round2(crudos[i] as number) : base));
      if (precios.some((p) => p < 0)) return { ok: false, motivo: "un precio por llanta es negativo" };
      const caro = precios.findIndex((p) => p > base);
      if (caro >= 0) return { ok: false, motivo: `la ${ordinal(caro + 1)} llanta (${dinero(precios[caro])}) queda más cara que el precio de hoy (${dinero(base)})` };
      return porCantidad({ t: "por_llanta", precios });
    }
    case "nxm":
      return porCantidad({ t: "nxm", lleva: parametros.lleva!, paga: parametros.paga! });
    case "enesima":
      return porCantidad({ t: "enesima", posicion: parametros.posicion!, porcentaje: parametros.porcentaje! });
    case "juego": {
      const j2 = typeof fila.juego2 === "number" ? round2(fila.juego2) : null;
      const j4 = typeof fila.juego4 === "number" ? round2(fila.juego4) : null;
      if (j2 === null && j4 === null) return { ok: false, motivo: "sin precio de par ni de juego" };
      if (j2 !== null && !(j2 > 0 && j2 < round2(2 * base))) return { ok: false, motivo: `el par a ${dinero(j2)} no es menor que 2 llantas a precio de hoy (${dinero(2 * base)})` };
      if (j4 !== null && !(j4 > 0 && j4 < round2(4 * base))) return { ok: false, motivo: `el juego a ${dinero(j4)} no es menor que 4 llantas a precio de hoy (${dinero(4 * base)})` };
      if (j2 !== null && j4 !== null && j4 > round2(2 * j2)) return { ok: false, motivo: `el juego de 4 (${dinero(j4)}) sale más caro que dos pares (${dinero(2 * j2)})` };
      return porCantidad({ t: "juego", juego2: j2, juego4: j4 });
    }
    case "escalonado":
      return porCantidad({ t: "escalonado", escalones: parametros.escalones! });
    case "regalo":
      return { ok: true, efecto: { clase: "regalo", texto: (parametros.regalo ?? "").trim() }, advertencias };
  }
}

// ── Sobre el catálogo ───────────────────────────────────────────────────────

/** Lo que una llanta lleva cuando tiene una promo por cantidad vigente. */
export interface PromocionPorCantidad {
  promocionId: number;
  nombre: string;
  hasta: string;
  vigenciaLarga: string;
  vigenciaCorta: string;
  /** Texto libre del negocio. */
  textoExtra: string | null;
  /** El precio de hoy sin la promo: la base de las cuentas. */
  base: number;
  regla: ReglaPorCantidad;
}

export interface RegaloDePromocion {
  promocionId: number;
  nombre: string;
  texto: string;
  vigenciaCorta: string;
}

export interface PrecioBase {
  /** Precio de hoy por llanta, con IVA, antes de toda promoción. */
  hoy: number;
  /** Precio de lista (el tachado de siempre). */
  lista: number;
}

export interface InformeDeAplicacion {
  promocionId: number;
  nombre: string;
  aplicadas: number;
  omitidas: Array<{ codigo: string; motivo: string }>;
}

const clave = (codigo: string) => codigo.trim().toLowerCase();

/** ¿Es el descuento para todas las llantas (sin Excel)? */
export const esParaTodas = (p: Pick<Promocion, "tipo" | "parametros">): boolean =>
  p.tipo === "porcentaje" && p.parametros.todas === true;

/**
 * EL DESCUENTO DE SIEMPRE, HOY. El % de la promoción «para todas» vigente (la
 * más nueva si hubiera dos), o 0 si está apagada, vencida o archivada.
 */
export function descuentoParaTodas(promos: readonly Promocion[], ahora: Date = new Date()): number {
  const vigente = promos.find((p) => esParaTodas(p) && promocionVigente(p, ahora));
  return vigente && entre(vigente.parametros.porcentaje, 0, 99) ? vigente.parametros.porcentaje! : 0;
}

/** La foto de precios antes de aplicar promociones (para el Excel y las cuentas). */
export function preciosBaseDe(items: readonly CatalogItem[]): Map<string, PrecioBase> {
  return new Map(items.map((i) => [clave(i.code), { hoy: i.minimumPriceWithTax, lista: Math.max(i.customerPriceWithTax, i.minimumPriceWithTax) }]));
}

/**
 * Aplica las promociones vigentes sobre el catálogo recién armado (lo modifica
 * en el lugar). Varias promos sobre la misma llanta no se suman: en las
 * parejas gana el precio más bajo; por cantidad y regalo, la más nueva.
 * `promos` llega de la más nueva a la más vieja.
 */
export function aplicarPromociones(
  items: CatalogItem[],
  promos: readonly Promocion[],
  ahora: Date = new Date(),
  bases: ReadonlyMap<string, PrecioBase> = preciosBaseDe(items),
): InformeDeAplicacion[] {
  const porCodigo = new Map(items.map((item) => [clave(item.code), item]));
  const informes: InformeDeAplicacion[] = [];
  for (const promo of promos) {
    if (!promocionVigente(promo, ahora)) continue;
    // El descuento para todas ya está dentro del precio de hoy (`descuentoParaTodas`).
    if (esParaTodas(promo)) continue;
    const informe: InformeDeAplicacion = { promocionId: promo.id, nombre: promo.nombre, aplicadas: 0, omitidas: [] };
    const vigencia = vigenciaEnPalabras(promo.hasta);
    const hastaIso = promo.hasta ? finDelDiaIso(promo.hasta) : SIN_FIN_ISO;
    for (const fila of promo.filas) {
      const item = porCodigo.get(clave(fila.codigo));
      const base = bases.get(clave(fila.codigo));
      if (!item || !base) {
        informe.omitidas.push({ codigo: fila.codigo, motivo: "no está en el inventario de hoy" });
        continue;
      }
      if (fila.medida && item.sizeLabel && item.sizeLabel !== fila.medida) {
        informe.omitidas.push({ codigo: fila.codigo, motivo: `la medida cambió: promoción ${fila.medida}, inventario ${item.sizeLabel}` });
        continue;
      }
      const r = efectoDeLaFila(promo.tipo, promo.parametros, fila, base.hoy);
      if (!r.ok) {
        informe.omitidas.push({ codigo: fila.codigo, motivo: r.motivo });
        continue;
      }
      if (r.efecto.clase === "pareja") {
        if (r.efecto.precio >= item.minimumPriceWithTax) {
          informe.omitidas.push({ codigo: fila.codigo, motivo: "otra promoción ya la deja más barata" });
          continue;
        }
        // El de siempre queda como el tachado; el de hoy es el de la promo.
        item.customerPriceWithTax = Math.max(item.customerPriceWithTax, item.minimumPriceWithTax, base.lista);
        item.minimumPriceWithTax = r.efecto.precio;
        item.promocionDePrecio = {
          nombre: promo.nombre,
          hasta: hastaIso,
          vigenciaLarga: vigencia.larga,
          vigenciaCorta: vigencia.corta,
          ...(promo.textoExtra ? { detalle: promo.textoExtra } : {}),
          promocionId: promo.id,
        };
      } else if (r.efecto.clase === "cantidad") {
        if (item.promocionPorCantidad) {
          informe.omitidas.push({ codigo: fila.codigo, motivo: `ya está en la promoción «${item.promocionPorCantidad.nombre}»` });
          continue;
        }
        item.promocionPorCantidad = {
          promocionId: promo.id,
          nombre: promo.nombre,
          hasta: hastaIso,
          vigenciaLarga: vigencia.larga,
          vigenciaCorta: vigencia.corta,
          textoExtra: promo.textoExtra,
          base: base.hoy,
          regla: r.efecto.regla,
        };
      } else {
        item.regalosDePromocion = [
          ...(item.regalosDePromocion ?? []),
          { promocionId: promo.id, nombre: promo.nombre, texto: r.efecto.texto, vigenciaCorta: vigencia.corta },
        ];
      }
      informe.aplicadas += 1;
    }
    informes.push(informe);
  }
  return informes;
}

/**
 * LA LLANTA CON LA CANTIDAD EN LA MANO. Si tiene una promo por cantidad y con
 * esta cantidad sale más barata que su precio de hoy, devuelve una COPIA con el
 * precio por llanta de la promo, el de siempre como tachado y el rótulo — es
 * decir, una llanta con precio de promoción común y corriente, que es lo que
 * la pieza, el PDF, el texto y el Guardián ya saben mostrar. Si no, la misma.
 */
export function productoParaCantidad<T extends CatalogItem>(item: T, cantidad: number | null | undefined): T {
  const promo = item.promocionPorCantidad;
  if (!promo || typeof cantidad !== "number" || !(cantidad >= 1)) return item;
  const unidad = unidadConPromocion(promo.regla, promo.base, cantidad);
  if (unidad === null || unidad >= item.minimumPriceWithTax) return item;
  const regla = reglaEnPalabras(promo.regla, promo.base);
  return {
    ...item,
    customerPriceWithTax: Math.max(item.customerPriceWithTax, item.minimumPriceWithTax, promo.base),
    minimumPriceWithTax: unidad,
    promocionDePrecio: {
      nombre: promo.nombre,
      hasta: promo.hasta,
      vigenciaLarga: promo.vigenciaLarga,
      vigenciaCorta: promo.vigenciaCorta,
      detalle: [regla, promo.textoExtra].filter(Boolean).join(" — "),
      promocionId: promo.promocionId,
    },
  };
}

/** Los precios por llanta que la promo por cantidad da con 1, 2, 3 y 4 llantas (null = sin rebaja). */
export function preciosPorCantidad(promo: PromocionPorCantidad, hasta = 4): Array<{ cantidad: number; unidad: number | null; total: number }> {
  return Array.from({ length: hasta }, (_, i) => {
    const cantidad = i + 1;
    const unidad = unidadConPromocion(promo.regla, promo.base, cantidad);
    return { cantidad, unidad, total: round2((unidad ?? promo.base) * cantidad) };
  });
}

/**
 * El hecho de la promo por cantidad, para el vendedor y el Guardián: la regla y
 * la cifra exacta con cada cantidad. Lo que el revisor no ve en los hechos, lo
 * borra (26-ago); por eso van todas las cifras que el texto puede decir.
 */
export function hechoDePromocionPorCantidad(promo: PromocionPorCantidad): string {
  const cuentas = preciosPorCantidad(promo)
    .filter((c) => c.unidad !== null)
    .map((c) => `con ${c.cantidad} llanta${c.cantidad === 1 ? "" : "s"}: $${c.unidad!.toFixed(2)} c/u ($${c.total.toFixed(2)} en total)`);
  return `promoción «${promo.nombre}»${promo.vigenciaCorta ? ` ${promo.vigenciaCorta}` : ""}: ${reglaEnPalabras(promo.regla, promo.base)}`
    + `${promo.textoExtra ? ` (${promo.textoExtra})` : ""} — ${cuentas.join("; ")}; con otra cantidad, el precio normal de $${promo.base.toFixed(2)} c/u. `
    + "Es real y la cotización la aplica sola según la cantidad: nombrarla y decir esas cifras NO es error";
}

/** Los regalos de la llanta, como líneas de beneficio para la pieza y el texto de la cotización. */
export function textosDeRegalos(item: Pick<CatalogItem, "regalosDePromocion"> | null | undefined): string[] {
  return (item?.regalosDePromocion ?? []).map((r) => `${r.texto} (${[r.nombre, r.vigenciaCorta].filter(Boolean).join(" ")})`);
}

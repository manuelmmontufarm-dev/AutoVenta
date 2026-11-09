/**
 * LA PROMOCIÓN DE TEMPORADA — las cuentas, en un solo lugar.
 *
 * Joaquín, 5-nov-2026: «el Black Friday se vive TODO NOVIEMBRE». Los datos
 * (fechas, marcas, tablas de servicios y aceites) viven en la política del
 * cliente (`negocio/politicas/<id>.ts` → `promocionDeTemporada`); este módulo
 * solo hace las cuentas, para que la cotización, la pieza, el PDF, el texto,
 * el vendedor y el guardián digan exactamente la misma cifra.
 *
 * LA REGLA DE LAS LLANTAS (Manuel, 6-nov, corrige la del 5-nov): en Falken y
 * Kenda el 60 % de las llantas PARES —la 2.ª, la 4.ª…— REEMPLAZA el −25 % del
 * catálogo: las pares van al precio de LISTA × 0,4 y las impares al precio de
 * LISTA, sin rebaja. Lista $100 (hoy $75): 2 × $100 + 2 × $40 = $280. Las otras
 * marcas siguen con su −25 % (4 × $75 = $300). Una sola llanta no lleva nada, y
 * si la promo saliera más cara que el −25 % (3 llantas: $240 contra $225) no se
 * aplica: nadie paga más por la promo. Sin precio de lista, la base es el de hoy.
 *
 * Puro: sin base, sin catálogo. `ahora` entra por parámetro para las pruebas.
 */
import type { PromocionDeTemporada } from "../negocio/politica.js";

export type { PromocionDeTemporada };

/** Ecuador no tiene horario de verano: siempre UTC−5. */
const OFFSET_ECUADOR_MS = 5 * 60 * 60 * 1000;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** El día de hoy en Ecuador, «YYYY-MM-DD». */
export function diaEnEcuador(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - OFFSET_ECUADOR_MS).toISOString().slice(0, 10);
}

/**
 * LA COMPUERTA (Manuel, 5-nov): antes de que la vea todo el mundo, la promo se
 * prueba con un número. Quién la ve lo decide Ajustes (`temporada_config`:
 * apagada / solo números de prueba / todos) y el teléfono del turno; eso vive
 * en `services/temporadaDelTurno.ts`, que instala la compuerta al arrancar el
 * servidor. Sin instalar (pruebas puras), la promo corre por fechas y nada más.
 */
let compuerta: () => boolean = () => true;
export function fijarCompuertaDeTemporada(fn: () => boolean): void {
  compuerta = fn;
}

/**
 * ¿La promoción corre hoy, para este turno? Null, fuera de fechas o cerrada
 * por la compuerta = no existe. Todo lo que habla de la promo pasa por acá.
 */
export function promocionVigente(
  promo: PromocionDeTemporada | null | undefined,
  ahora: Date = new Date(),
): promo is PromocionDeTemporada {
  if (!promo) return false;
  const hoy = diaEnEcuador(ahora);
  return hoy >= promo.desde && hoy <= promo.hasta && compuerta();
}

/** «30 de noviembre»: el último día, para «válido hasta…». */
export function hastaEnPalabras(promo: PromocionDeTemporada): string {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [, mes, dia] = promo.hasta.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]}`;
}

// ===========================================================================
// Llantas: el 60 % en las pares
// ===========================================================================

/** Lo que una línea de cotización lleva cuando la promo de la 2.ª llanta aplica. */
export interface SegundaLlanta {
  /** 60: el porcentaje que se resta a cada llanta par. */
  porcentaje: number;
  /** Cuántas llantas lo llevan: floor(cantidad / 2). */
  unidades: number;
  /** El precio de LISTA por llanta, con IVA: el que pagan las impares (sin el −25 %). */
  precioNormalConIva: number;
  /** El precio de cada llanta par, con IVA: precio de LISTA × (1 − 60 %). */
  precioConIva: number;
  /** Lo que la promo ahorra contra la lista: (lista − par) × pares, con IVA. */
  ahorroConIva: number;
  /**
   * Igual a `ahorroConIva` desde que el 60 % reemplaza al −25 %. Queda por las
   * piezas que lo leen; las cotizaciones guardadas antes no lo traen.
   */
  ahorroSobreListaConIva?: number;
  /** El total de la línea con IVA: impares a precio normal + pares rebajadas. */
  totalConIva: number;
  /** «Black Friday»: para el rótulo. */
  nombre: string;
}

/** ¿Esta marca entra en la promo de la 2.ª llanta hoy? Sirve también para la vitrina. */
export function marcaConSegundaLlanta(
  promo: PromocionDeTemporada | null | undefined,
  marca: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!promocionVigente(promo, ahora) || !promo.segundaLlanta || !marca) return false;
  return promo.segundaLlanta.marcas.includes(marca.trim().toUpperCase());
}

/** Los dos precios de la llanta: el de hoy (impares) y el de lista (base del 60 %). */
export interface PreciosDeLaLlanta {
  hoyConIva: number;
  /** El PVP sin la rebaja del catálogo. Null o menor que el de hoy = el de hoy. */
  listaConIva?: number | null;
}

/**
 * La promo de la 2.ª llanta para esta línea, o null si no aplica (otra marca,
 * una sola llanta, fuera de fechas o sin precio). Un número suelto es el
 * precio de hoy sin lista conocida.
 */
export function segundaLlantaDe(
  promo: PromocionDeTemporada | null | undefined,
  marca: string | null | undefined,
  cantidad: number,
  precios: number | PreciosDeLaLlanta,
  ahora: Date = new Date(),
): SegundaLlanta | null {
  if (!marcaConSegundaLlanta(promo, marca, ahora)) return null;
  const { hoyConIva: precioHoyConIva, listaConIva } = typeof precios === "number" ? { hoyConIva: precios } : precios;
  const n = Math.max(0, Math.round(cantidad));
  const unidades = Math.floor(n / 2);
  if (unidades < 1 || !(precioHoyConIva > 0)) return null;
  const porcentaje = promo!.segundaLlanta!.porcentaje;
  const base = round2(listaConIva && listaConIva > precioHoyConIva ? listaConIva : precioHoyConIva);
  const precioConIva = round2(base * (1 - porcentaje / 100));
  const totalConIva = round2((n - unidades) * base + unidades * precioConIva);
  // Nadie paga más por la promo: si el −25 % de siempre sale igual o más
  // barato (pasa con cantidades impares), la línea va como siempre.
  if (totalConIva >= round2(n * precioHoyConIva)) return null;
  const ahorroConIva = round2((base - precioConIva) * unidades);
  const ahorroSobreListaConIva = ahorroConIva;
  return {
    porcentaje,
    unidades,
    precioNormalConIva: base,
    precioConIva,
    ahorroConIva,
    ahorroSobreListaConIva,
    totalConIva,
    nombre: promo!.nombre,
  };
}

/** «2 × $75.00 + 2 × $30.00 = $210.00»: la cuenta a la vista, tal cual. */
export function cuentaDeSegundaLlanta(cantidad: number, s: SegundaLlanta): string {
  const normales = Math.round(cantidad) - s.unidades;
  return `${normales} × $${s.precioNormalConIva.toFixed(2)} + ${s.unidades} × $${s.precioConIva.toFixed(2)} `
    + `= $${s.totalConIva.toFixed(2)}`;
}

/**
 * El campo con que el vendedor recibe el precio por llanta de un ítem que SÍ trae
 * la cuenta de la promo (`precio_para_decir`). Un solo nombre, usado por la
 * herramienta y por la regla del playbook: si uno cambia, el otro lo sigue.
 */
export const CAMPO_PRECIO_POR_LLANTA_SIN_PROMO = "precio_por_llanta_solo_con_1_3_o_5_llantas";

/** Más de esto no es un pedido: es una ficha sucia, y una cuenta de 118 × … no se le dice a nadie. */
export const MAXIMO_PARA_LA_CUENTA = 40;

/** La cantidad con que se hace una cuenta: la dicha si es plausible; si no, `porDefecto` (el juego). */
export function cantidadParaLaCuenta(cantidad: number | null | undefined, porDefecto: number): number {
  const n = Number(cantidad);
  return Number.isInteger(n) && n >= 1 && n <= MAXIMO_PARA_LA_CUENTA ? n : porDefecto;
}

/**
 * ¿La promo de la 2.ª llanta aplica con esta cantidad? Lo decide `segundaLlantaDe`
 * con un precio típico (hoy = lista × 0,75): pares sí; 1, 3 y 5 no (saldría más
 * caro que el −25 %); 7 sí. Para decírselo calculado al Guardián, que no razona la paridad.
 */
export function promoAplicaConLaCantidad(
  promo: PromocionDeTemporada | null | undefined,
  cantidad: number,
  ahora: Date = new Date(),
): boolean {
  const marca = promo?.segundaLlanta?.marcas[0];
  return Boolean(marca) && segundaLlantaDe(promo, marca, cantidad, { hoyConIva: 75, listaConIva: 100 }, ahora) !== null;
}

/** «(−60 % en la 2.ª llanta)»: el rótulo que acompaña a la cuenta. */
export function rotuloDeSegundaLlanta(s: SegundaLlanta): string {
  return `(−${s.porcentaje} % en la 2.ª llanta)`;
}

/**
 * «2 × $75.00 + 2 × $30.00 = $210.00 (−60 % en la 2.ª llanta)»: la cuenta con su
 * rótulo, TAL COMO se le dice al cliente. La lista escrita, la lámina y todo
 * texto que hable del precio de una línea con la promo la escriben con esta.
 */
export function cuentaConRotulo(cantidad: number, s: SegundaLlanta): string {
  return `${cuentaDeSegundaLlanta(cantidad, s)} ${rotuloDeSegundaLlanta(s)}`;
}

/**
 * CÓMO SE DICE EL PRECIO DE UNA LÍNEA — la única fuente (auditoría 9-nov, familia
 * «el texto dice un c/u que contradice la promo»).
 *
 * En Falken y Kenda con Black Friday NO EXISTE un precio por llanta: las impares
 * valen la lista y las pares lista × 0,4. Decir «$202.87 c/u» (el precio de hoy,
 * −25 %) o «$270.49 c/u» (la lista) es falso en las dos puntas. Por eso, con la
 * promo aplicada, el precio se dice con la cuenta; y sin ella (otra marca, una o
 * tres llantas, promo apagada o compuerta cerrada) es el «$P c/u con IVA» de
 * siempre. Nadie más formatea el precio de una línea.
 *
 * `negrita` envuelve el resultado en *…* (los textos que ya iban en negrita).
 */
export function decirPrecioDeLaLinea(
  linea: { hoyConIva: number; cantidad: number; segunda?: SegundaLlanta | null },
  opciones: { negrita?: boolean } = {},
): string {
  const texto = linea.segunda
    ? cuentaConRotulo(linea.cantidad, linea.segunda)
    : `$${linea.hoyConIva.toFixed(2)} c/u con IVA`;
  return opciones.negrita ? `*${texto}*` : texto;
}

/**
 * Resuelve y dice el precio de una línea de catálogo: lo que necesitan los textos
 * armados con un producto en la mano. Sigue el MISMO interruptor que
 * `promocionVigente` (fechas + compuerta) porque pasa por `segundaLlantaDe`.
 * `segunda` viaja para quien necesite la cifra además del texto.
 */
export function precioDeLaLinea(
  promo: PromocionDeTemporada | null | undefined,
  marca: string | null | undefined,
  cantidad: number,
  precios: PreciosDeLaLlanta,
  opciones: { negrita?: boolean; ahora?: Date } = {},
): { texto: string; segunda: SegundaLlanta | null } {
  const segunda = segundaLlantaDe(promo, marca, cantidad, precios, opciones.ahora);
  return {
    segunda,
    texto: decirPrecioDeLaLinea({ hoyConIva: precios.hoyConIva, cantidad, segunda }, opciones),
  };
}

/** `precioDeLaLinea` para quien tiene el producto del catálogo en la mano. */
export function precioDelProducto(
  promo: PromocionDeTemporada | null | undefined,
  producto: { brand: string; minimumPriceWithTax: number; customerPriceWithTax?: number | null },
  cantidad: number,
  opciones: { negrita?: boolean; ahora?: Date } = {},
): { texto: string; segunda: SegundaLlanta | null } {
  return precioDeLaLinea(promo, producto.brand, cantidad,
    { hoyConIva: producto.minimumPriceWithTax, listaConIva: producto.customerPriceWithTax }, opciones);
}

/**
 * Cuántas llantas lleva la línea que esta promo describe: lo que no son pares
 * valen la lista, lo demás ya está en `totalConIva`. Sirve para decir la cuenta
 * desde lo que una pieza o cotización guardó sin volver a preguntar la cantidad.
 */
export function cantidadDeLaSegunda(s: SegundaLlanta): number {
  const normales = Math.round((s.totalConIva - s.unidades * s.precioConIva) / s.precioNormalConIva);
  return normales + s.unidades;
}

/**
 * El precio de una opción tal como la pieza la dejó guardada (`metadata.escalones`):
 * la cuenta si guardó la promo y la temporada sigue vigente, el «c/u» si no.
 * Para los textos que salen de la pieza y no de un producto (hechos del vendedor,
 * «los dos valores de la marca», el texto de la pieza).
 */
export function precioDeLaOpcionGuardada(
  promo: PromocionDeTemporada | null | undefined,
  opcion: { precio_con_iva: number; segunda_llanta?: SegundaLlanta | null },
  opciones: { negrita?: boolean; ahora?: Date } = {},
): string {
  const segunda = segundaGuardadaVigente(promo, opcion.segunda_llanta, opciones.ahora);
  return decirPrecioDeLaLinea(
    { hoyConIva: Number(opcion.precio_con_iva), cantidad: segunda ? cantidadDeLaSegunda(segunda) : 0, segunda },
    opciones,
  );
}

/**
 * La promo que una pieza o cotización GUARDÓ para una línea, si todavía cuenta
 * como promo: la que el cliente vio (no se recalcula con precios de hoy), pero
 * solo mientras la temporada siga vigente. Sin `guardada`, o con la promo ya
 * apagada, es null y el texto vuelve al «c/u». Se usa donde el texto sale de
 * lo que la pieza dejó escrito (`metadata.escalones`) y no de un producto.
 */
export function segundaGuardadaVigente(
  promo: PromocionDeTemporada | null | undefined,
  guardada: SegundaLlanta | null | undefined,
  ahora: Date = new Date(),
): SegundaLlanta | null {
  return guardada && promocionVigente(promo, ahora) ? guardada : null;
}

// ===========================================================================
// Servicios y productos
// ===========================================================================

export interface ServicioEnPromocion {
  servicio: string;
  vehiculo: "auto" | "camioneta";
  /** El precio de noviembre, con IVA (la tabla ya viene rebajada). */
  precioPromoConIva: number;
  /** El precio normal, con IVA: el de noviembre deshecho el porcentaje. */
  precioNormalConIva: number;
  porcentaje: number;
}

export function serviciosEnPromocion(
  promo: PromocionDeTemporada | null | undefined,
  ahora: Date = new Date(),
): ServicioEnPromocion[] {
  if (!promocionVigente(promo, ahora) || !promo.servicios) return [];
  const { porcentaje, lista } = promo.servicios;
  return lista.map((s) => ({
    ...s,
    precioNormalConIva: round2(s.precioPromoConIva / (1 - porcentaje / 100)),
    porcentaje,
  }));
}

export interface ProductoEnPromocion {
  nombre: string;
  pvpConIva: number;
  /** PVP × (1 − 40 %), con IVA. */
  precioPromoConIva: number;
  porcentaje: number;
}

export function productosEnPromocion(
  promo: PromocionDeTemporada | null | undefined,
  ahora: Date = new Date(),
): ProductoEnPromocion[] {
  if (!promocionVigente(promo, ahora) || !promo.productos) return [];
  const { porcentaje, lista } = promo.productos;
  return lista.map((p) => ({
    ...p,
    precioPromoConIva: round2(p.pvpConIva * (1 - porcentaje / 100)),
    porcentaje,
  }));
}

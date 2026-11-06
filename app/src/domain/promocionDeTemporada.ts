/**
 * LA PROMOCIÓN DE TEMPORADA — las cuentas, en un solo lugar.
 *
 * Joaquín, 5-nov-2026: «el Black Friday se vive TODO NOVIEMBRE». Los datos
 * (fechas, marcas, tablas de servicios y aceites) viven en la política del
 * cliente (`negocio/politicas/<id>.ts` → `promocionDeTemporada`); este módulo
 * solo hace las cuentas, para que la cotización, la pieza, el PDF, el texto,
 * el vendedor y el guardián digan exactamente la misma cifra.
 *
 * LA REGLA DE LAS LLANTAS (Manuel, 6-nov, corrige la del 5-nov): las llantas
 * PARES de la cotización —la 2.ª, la 4.ª…— llevan SOLO el 60 % sobre el precio
 * de LISTA, no el 60 % encima del −25 % del catálogo. Las impares pagan el
 * precio de hoy. Lista $100, hoy $75: 2 × $75 + 2 × $40 = $230. Solo Falken y
 * Kenda; una sola llanta no lleva nada. Sin precio de lista, la base es el de hoy.
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
  /** El precio de hoy por llanta, con IVA: el que pagan las impares. */
  precioNormalConIva: number;
  /** El precio de cada llanta par, con IVA: precio de LISTA × (1 − 60 %). */
  precioConIva: number;
  /** Lo que la promo ahorra además del precio de hoy: (hoy − par) × pares, con IVA. */
  ahorroConIva: number;
  /**
   * Lo que el 60 % ahorra contra el precio de LISTA en las pares: (lista − par)
   * × pares. Es lo que dice el sello «−60 %»; las impares ahorran aparte el
   * descuento del catálogo. Opcional: las cotizaciones guardadas antes del
   * 6-nov no lo traen (se cae a `ahorroConIva`).
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
  const base = listaConIva && listaConIva > precioHoyConIva ? listaConIva : precioHoyConIva;
  // Nunca más cara que el precio de hoy (un catálogo con más del 60 % de rebaja).
  const precioConIva = Math.min(round2(base * (1 - porcentaje / 100)), round2(precioHoyConIva));
  const ahorroConIva = round2((precioHoyConIva - precioConIva) * unidades);
  const totalConIva = round2((n - unidades) * precioHoyConIva + unidades * precioConIva);
  const ahorroSobreListaConIva = round2((base - precioConIva) * unidades);
  return {
    porcentaje,
    unidades,
    precioNormalConIva: round2(precioHoyConIva),
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

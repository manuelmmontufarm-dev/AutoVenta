/**
 * EL PRECIO SEGÚN CÓMO PAGA — puro: qué pregunta lo pide y cómo se dice.
 *
 * Manuel, 18-nov-2026 (Competimotor): «dejar precio A, pero si preguntan los
 * descuentos o si cuesta menos con efectivo o cuánto cuesta con tarjeta, que
 * pueda responder y que simplemente dé el precio con cada uno de los métodos
 * de pago en un mensaje». Jenny: A = normal, B = con tarjeta de crédito, C =
 * efectivo; Manuel: transferencia = efectivo. El mayorista (D) no se nombra.
 *
 * Los números llegan hechos (`CatalogItem.preciosPorPago`, del Excel): acá no
 * se calcula ningún precio, solo se multiplican por la cantidad cotizada.
 */
import { preguntaPorElPago } from "./datosDelNegocio.js";

const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * ¿El cliente pregunta cuánto sale según cómo paga? Las de pago de siempre
 * (tarjeta, efectivo, transferencia, cuotas…) y las de descuento sin forma de
 * pago («tienen algún descuento?», «sale más barato de contado?»).
 */
export function preguntaPorPrecioSegunPago(texto: string | null | undefined): boolean {
  if (preguntaPorElPago(texto)) return true;
  const n = normal(texto ?? "");
  return /\bdescuentos?\b|\brebaja\w*\b|\bmas barat\w*\b|\b(?:sale|cuesta|queda)\s+menos\b|\bprecio especial\b|\bde contado\b/.test(n);
}

export interface LineaPorPago {
  /** «HAIDA AT HD818 LN 235/75R15» */
  nombre: string;
  cantidad: number;
  /** Con IVA, por llanta. */
  normal: number;
  tarjeta: number;
  efectivo: number;
}

const dinero = (n: number) => `$${n.toFixed(2)}`;
const llantas = (n: number) => `${n} ${n === 1 ? "llanta" : "llantas"}`;

/** «Estos son los precios según cómo pague:» y, por llanta cotizada, sus tres precios. */
export function mensajeDePreciosPorPago(lineas: readonly LineaPorPago[]): string {
  const precio = (unitario: number, cantidad: number) =>
    cantidad > 1
      ? `*${dinero(unitario)}* c/u · *${dinero(Math.round(unitario * cantidad * 100) / 100)}* las ${llantas(cantidad)}`
      : `*${dinero(unitario)}*`;
  return [
    TITULO_PRECIOS_POR_PAGO,
    ...lineas.flatMap((l) => [
      `*${llantas(l.cantidad)} ${l.nombre}*`,
      `🧾 Precio normal: ${precio(l.normal, l.cantidad)}`,
      `💳 Con tarjeta de crédito: ${precio(l.tarjeta, l.cantidad)}`,
      `💵 En efectivo o transferencia: ${precio(l.efectivo, l.cantidad)}`,
    ]),
  ].join("\n");
}

/** El título del bloque: con él se reconoce que ya se mandó en esta conversación. */
export const TITULO_PRECIOS_POR_PAGO = "Estos son los precios según cómo pague:";

/**
 * ¿Por cuál pago pregunta? Tarjeta (o cuotas), efectivo/transferencia (o
 * descuento, rebaja, contado), o null si nombra los dos o ninguno.
 */
export function pagoPreguntado(texto: string | null | undefined): "tarjeta" | "efectivo" | null {
  const n = normal(texto ?? "");
  const tarjeta = /\btarjeta\b|\bcredito\b|\bcuotas?\b|\bdiferi\w*\b/.test(n);
  const efectivo = /\befectivo\b|\btransferencia\b|\bcontado\b|\bcash\b|\bdescuentos?\b|\brebaja\w*\b|\bmas barat\w*\b|\bmenos\b/.test(n);
  if (tarjeta === efectivo) return null;
  return tarjeta ? "tarjeta" : "efectivo";
}

/**
 * La respuesta de UN pago, para cuando el bloque completo ya salió: repetirlo
 * entero es un calco (el candado lo quita y el turno queda sin respuesta).
 * «Pagando en efectivo o por transferencia le queda en *$118.00* c/u · …».
 */
export function mensajeDeUnPago(lineas: readonly LineaPorPago[], pago: "tarjeta" | "efectivo"): string {
  const cabeza = pago === "tarjeta" ? "Con tarjeta de crédito le queda en" : "Pagando en efectivo o por transferencia le queda en";
  const una = (l: LineaPorPago) => {
    const unitario = pago === "tarjeta" ? l.tarjeta : l.efectivo;
    return l.cantidad > 1
      ? `*${dinero(unitario)}* c/u · *${dinero(Math.round(unitario * l.cantidad * 100) / 100)}* las ${llantas(l.cantidad)}`
      : `*${dinero(unitario)}*`;
  };
  if (lineas.length === 1) return `${cabeza} ${una(lineas[0])}.`;
  return [`${cabeza}:`, ...lineas.map((l) => `• ${l.nombre}: ${una(l)}`)].join("\n");
}

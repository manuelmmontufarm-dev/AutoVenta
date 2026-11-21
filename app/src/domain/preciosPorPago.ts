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
  /** El número de la opción en la lámina («1 · TOWNHALL TH-161»); sin él, la cotizada. */
  numero?: number;
  cantidad: number;
  /**
   * Con IVA, por llanta. Null: el negocio cotiza con el precio con tarjeta
   * (Competimotor, 20-nov-2026) y el «precio normal» (Precio A) no se dice.
   */
  normal: number | null;
  /** «Black Friday hasta el lunes 30-nov»: la llanta lleva precio de promoción. */
  promocion?: string | null;
  /** Null: esta llanta no trae Precio B/C (o no pasó el control) y la confirma un asesor. */
  tarjeta: number | null;
  efectivo: number | null;
}

/**
 * Las líneas de precio de UNA llanta. Con tarjeta y efectivo iguales (Black
 * Friday más barato que el precio en efectivo) va una sola: decir dos veces la
 * misma cifra con dos rótulos se lee como si fueran precios distintos.
 */
function lineasDePrecio(l: LineaPorPago, precio: (unitario: number, cantidad: number) => string): string[] {
  return [
    ...(l.normal === null ? [] : [`🧾 Precio normal: ${precio(l.normal, l.cantidad)}`]),
    ...(l.tarjeta === null || l.efectivo === null
      ? [SIN_PRECIO_POR_PAGO]
      : l.tarjeta === l.efectivo
        // Corto a propósito: con 6 palabras o más, dos opciones al mismo precio
        // las toma por la misma idea el quitador de repetidas del turno.
        ? [`💳 Tarjeta, efectivo o transferencia: ${precio(l.tarjeta, l.cantidad)}`]
        : [
            `💳 Con tarjeta de crédito: ${precio(l.tarjeta, l.cantidad)}`,
            `💵 En efectivo o transferencia: ${precio(l.efectivo, l.cantidad)}`,
          ]),
  ];
}

/**
 * LA PROMOCIÓN SE NOMBRA UNA VEZ (simulador, 20-nov): con «· Black Friday
 * hasta el lunes 30-nov» en el título de cada opción, «*1 · WINRUN MAXCLAW
 * A/T* · Black Friday…» y «*2 · WINRUN MAXCLAW R/T* · Black Friday…» eran la
 * misma idea para `estructurarTurno` y el segundo título se borraba: quedaba un
 * precio sin su llanta. Cada llanta con promo lleva 🖤 y la vigencia va al pie.
 */
const conPromocion = (titulo: string, l: LineaPorPago) => (l.promocion ? `${titulo} 🖤` : titulo);
const pieDePromocion = (lineas: readonly LineaPorPago[]): string[] =>
  [...new Set(lineas.map((l) => l.promocion).filter((p): p is string => Boolean(p)))].map((p) => `🖤 ${p}`);

/** La frase para la opción que no trae precio por forma de pago: solo ella va al asesor. */
export const SIN_PRECIO_POR_PAGO = "El precio con tarjeta y en efectivo de esta se lo confirma un asesor.";

const dinero = (n: number) => `$${n.toFixed(2)}`;
const llantas = (n: number) => `${n} ${n === 1 ? "llanta" : "llantas"}`;

/** «Estos son los precios según cómo pague:» y, por llanta cotizada, sus tres precios. */
export function mensajeDePreciosPorPago(lineas: readonly LineaPorPago[]): string {
  // VARIAS OPCIONES DE LA LÁMINA: la cantidad va UNA vez, arriba, y cada línea
  // queda corta. Con «… las 4 llantas» en cada una, el quitador de frases
  // repetidas del turno (`estructurarTurno`) tomaba la tarjeta de la 2.ª opción
  // por la misma idea que la de la 1.ª y la borraba (simulador, 19-nov).
  if (lineas.some((l) => l.numero)) return mensajeDeLaLamina(lineas);
  const precio = (unitario: number, cantidad: number) =>
    cantidad > 1
      ? `*${dinero(unitario)}* c/u · *${dinero(Math.round(unitario * cantidad * 100) / 100)}* las ${llantas(cantidad)}`
      : `*${dinero(unitario)}*`;
  return [
    TITULO_PRECIOS_POR_PAGO,
    ...lineas.flatMap((l) => [
      conPromocion(l.numero ? `*${l.numero} · ${l.nombre}*` : `*${llantas(l.cantidad)} ${l.nombre}*`, l),
      ...lineasDePrecio(l, precio),
    ]),
    ...pieDePromocion(lineas),
  ].join("\n");
}

function mensajeDeLaLamina(lineas: readonly LineaPorPago[]): string {
  const cantidad = lineas[0]?.cantidad ?? 1;
  const mismaCantidad = lineas.every((l) => l.cantidad === cantidad);
  const precio = (unitario: number, n: number) =>
    n > 1 ? `*${dinero(unitario)}* · *${dinero(Math.round(unitario * n * 100) / 100)}*` : `*${dinero(unitario)}*`;
  const titulo = mismaCantidad && cantidad > 1
    ? `${TITULO_PRECIOS_POR_PAGO.slice(0, -1)} (c/u · las ${llantas(cantidad)}):`
    : TITULO_PRECIOS_POR_PAGO;
  return [
    titulo,
    ...lineas.flatMap((l) => [
      conPromocion(mismaCantidad ? `*${l.numero ? `${l.numero} · ` : ""}${l.nombre}*` : `*${l.numero ? `${l.numero} · ` : ""}${l.nombre}* (${llantas(l.cantidad)})`, l),
      ...lineasDePrecio(l, precio),
    ]),
    ...pieDePromocion(lineas),
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
    if (unitario === null) return "se lo confirma un asesor";
    return l.cantidad > 1
      ? `*${dinero(unitario)}* c/u · *${dinero(Math.round(unitario * l.cantidad * 100) / 100)}* las ${llantas(l.cantidad)}`
      : `*${dinero(unitario)}*`;
  };
  if (lineas.length === 1 && lineas[0].efectivo !== null && lineas[0].tarjeta !== null) return `${cabeza} ${una(lineas[0])}.`;
  return [`${cabeza}:`, ...lineas.map((l) => `• ${l.numero ? `${l.numero} · ` : ""}${l.nombre}: ${una(l)}`)].join("\n");
}

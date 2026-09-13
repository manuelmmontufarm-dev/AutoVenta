/**
 * Cuánta plata se está ahorrando el cliente con la cotización que ya tiene.
 *
 * Joaquín, 26-ago-2026: «que le pregunte qué día cree que va a poder ir para
 * aplicarle el descuento y contactar al asesor, el del 25 % mostrado en la
 * cotización, y que calcule ese monto y lo muestre. Un mensaje corto pero
 * valioso, porque es más probable que lo den si pueden ver el número de plata».
 *
 * No cambia ninguna regla comercial: el descuento es el mismo con o sin día de
 * visita —ya está dentro del precio que la pieza imprime—. Lo único que cambia
 * es que el número se dice en vez de quedarse dibujado en la imagen.
 *
 * Puro y sin base ni catálogo: sale de los `items` que la cotización ya guardó,
 * que son los mismos que se imprimieron. Leerlo de otro lado sería arriesgarse a
 * anunciar un ahorro que la pieza no muestra.
 */

export interface LineaCotizada {
  quantity?: number | null;
  /** Precio de lista con IVA: el «antes» tachado en la pieza. */
  listPriceWithTax?: number | null;
  /** Precio de venta con IVA: el que el cliente paga. */
  salePriceWithTax?: number | null;
}

export interface AhorroDeLaCotizacion {
  /** Lo que deja de pagar en TODA la compra, no por llanta. */
  monto: number;
  /** El mismo porcentaje que la pieza muestra en su sello. */
  porcentaje: number;
  cantidad: number;
  /** Lo que deja de pagar por cada llanta: el «ahorras $X c/u» de la pieza. */
  porLlanta: number;
  /** El precio por llanta que paga, con el descuento ya aplicado. */
  precioConDescuento: number;
  /** El precio de lista por llanta: el «antes» tachado. */
  precioAntes: number;
}

/**
 * `null` cuando no hay nada que presumir: sin cotización, sin precio de lista
 * más alto, o con un redondeo que daría «0 %». Anunciar un ahorro de cero
 * —o de un centavo— desperdicia el mensaje y le resta credibilidad al resto.
 */
export function ahorroDeLaCotizacion(
  items: readonly LineaCotizada[] | null | undefined,
): AhorroDeLaCotizacion | null {
  const linea = (items ?? [])[0];
  if (!linea) return null;
  const lista = Number(linea.listPriceWithTax ?? 0);
  const venta = Number(linea.salePriceWithTax ?? 0);
  const cantidad = Math.max(1, Math.round(Number(linea.quantity ?? 1)));
  if (!Number.isFinite(lista) || !Number.isFinite(venta)) return null;
  if (lista <= 0 || venta <= 0 || venta >= lista) return null;

  const monto = Math.round((lista - venta) * cantidad * 100) / 100;
  const porcentaje = Math.round((1 - venta / lista) * 100);
  if (monto < 1 || porcentaje < 1) return null;
  const porLlanta = Math.round((lista - venta) * 100) / 100;
  return { monto, porcentaje, cantidad, porLlanta, precioConDescuento: venta, precioAntes: lista };
}

/**
 * «*25 %* de descuento ya aplicado, *$277.44* menos» — la mitad de la frase que se le dice
 * al cliente. Quien llama pone el resto según el turno, porque no es lo mismo
 * pedirle el día que confirmarle la visita.
 *
 * Punto decimal y no coma, igual que la pieza y que la cotización: el formato
 * es-EC («$277,44») fue 4 de los 8 `precio_incorrecto` ALTA del informe del
 * guardián del 15-ago, porque el revisor lee dos números distintos.
 */
export function fraseDeAhorro(ahorro: Pick<AhorroDeLaCotizacion, "porcentaje" | "monto">): string {
  return `*${ahorro.porcentaje} %* de descuento ya aplicado, *$${ahorro.monto.toFixed(2)}* menos`;
}

/**
 * ¿El cliente habla del descuento de SU cotización?
 *
 * Caso 1 de las pruebas del 12-sep (conv 3, 17:16): «La promoción del 25% q son
 * 103$.64 menos» recibió el local recomendado, «¿qué día podría pasar?» y el
 * mapa. Nadie le contestó lo que dijo. Pide cifras o una pregunta sobre el
 * descuento: «¿tienen alguna promoción?» es otra cosa (`preguntaPorBeneficios`).
 */
export function hablaDelDescuento(texto: string | null | undefined): boolean {
  const n = (texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/\bdescuentos?\b|\bpromo(?:cion)?\b|\brebaja\b|\bahorr\w*\b/.test(n)) return false;
  return /\d|%|\bcuanto\b|\bmenos\b|\baplica\w*\b|\bincluid\w*\b|\bdescontad\w*\b/.test(n);
}

/** ¿El texto ya dice el porcentaje y que está descontado? */
export function respondeElDescuento(texto: string, ahorro: AhorroDeLaCotizacion): boolean {
  const n = texto.toLowerCase();
  const porcentaje = n.includes(`${ahorro.porcentaje} %`) || n.includes(`${ahorro.porcentaje}%`);
  return porcentaje && /aplicad|incluid|descontad/.test(n);
}

/**
 * Las cifras que escribió el cliente: los montos y los porcentajes, aparte.
 * «103$.64» (conv 16982) es 103.64: el signo pegado en medio no parte la cifra.
 */
export function cifrasDelCliente(texto: string | null | undefined): { montos: number[]; porcentajes: number[] } {
  const t = (texto ?? "").replace(/(\d)\s*\$\s*([.,]\d)/g, "$1$2").replace(/\$/g, " ");
  const porcentajes = [...t.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(",", ".")));
  const sinPorcentajes = t.replace(/\d{1,3}(?:[.,]\d+)?\s*%/g, " ");
  const montos = [...sinPorcentajes.matchAll(/(?<![\d/])(\d+(?:[.,]\d{1,2})?)(?![\d/])/g)]
    .map((m) => Number(m[1].replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n >= 1);
  return { montos, porcentajes };
}

const cerca = (dicho: number, real: number) => Math.abs(dicho - real) <= Math.max(0.6, real * 0.02);
const dinero = (n: number) => `*$${n.toFixed(2)}*`;

/**
 * LA RESPUESTA SOBRE EL DESCUENTO, CONTRA LA CIFRA QUE DIJO EL CLIENTE.
 *
 * Manuel, 12-sep 21:42 (conv 3): 4 × WINRUN R330 a $58.25, antes $77.66. Él
 * escribió «La promoción del 25% q son 58 menos» y el bot contestó «Así es:
 * … $77.64 menos». Dos errores: confirmó una cifra que no es el descuento
 * ($58.25 es lo que paga por llanta) y dio solo el total de las cuatro, que se
 * confunde con el precio de antes. La pieza dice «ahorras $19.41 c/u»: la
 * respuesta tiene que hablar en esa misma unidad, y además dar el total.
 *
 * Solo dice «Así es» cuando la cifra del cliente ES el descuento. Si es el
 * precio o el total a pagar, lo aclara con todas las letras.
 */
export function respuestaDelDescuento(ahorro: AhorroDeLaCotizacion, textoDelCliente?: string | null): string {
  const cuanto = ahorro.cantidad > 1
    ? `${dinero(ahorro.porLlanta)} por llanta, ${dinero(ahorro.monto)} en las ${ahorro.cantidad} llantas`
    : dinero(ahorro.monto);
  const base = `su cotización ya trae el *${ahorro.porcentaje} %* de descuento, que son ${cuanto}. `
    + "Ya está descontado del total que le envié; no se resta otra vez.";
  const { montos, porcentajes } = cifrasDelCliente(textoDelCliente);
  const otroPorcentaje = porcentajes.some((p) => Math.abs(p - ahorro.porcentaje) >= 1);
  const totalAPagar = Math.round(ahorro.precioConDescuento * ahorro.cantidad * 100) / 100;
  const esElPrecio = montos.find((n) => cerca(n, ahorro.precioConDescuento));
  const esElTotal = montos.find((n) => cerca(n, totalAPagar));
  const esElDescuento = montos.length > 0 && montos.every((n) => cerca(n, ahorro.monto) || cerca(n, ahorro.porLlanta));
  if (esElPrecio !== undefined) {
    return `Le aclaro: ${dinero(ahorro.precioConDescuento)} es el precio por llanta, ya con el descuento `
      + `(antes ${dinero(ahorro.precioAntes)}). El descuento del *${ahorro.porcentaje} %* son ${cuanto}. `
      + "Ya está descontado del total que le envié; no se resta otra vez.";
  }
  if (esElTotal !== undefined) {
    return `Le aclaro: ${dinero(totalAPagar)} es el total a pagar, ya con el descuento. Y ${base}`;
  }
  if (esElDescuento && !otroPorcentaje) return `Así es: ${base}`;
  if (montos.length || otroPorcentaje) return `Le aclaro: ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * ¿Esta frase del borrador habla del descuento? Para quitarla cuando el turno
 * ya lleva la respuesta de arriba: «Sí, esa es la idea: el precio ya le quedó
 * en $58.25 c/u…» (21:42) no nombra el descuento, pero confirma una cifra.
 */
export function esFraseDelDescuento(frase: string): boolean {
  const n = frase.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\bdescuent|\bpromo|\bahorr|\brebaja|\bdescontad|\baplicad/.test(n)
    || /\$\s*\d|\d\s*\$|(?<![\d.,])\d+[.,]\d{2}(?![\d.,])/.test(frase)
    || /^(?:as[ii] es|exacto|correcto|si, esa es la idea|esa es la idea)\b/.test(n);
}

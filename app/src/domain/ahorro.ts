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
  return { monto, porcentaje, cantidad };
}

/**
 * «*25 %* de descuento, *$277.44* menos» — la mitad de la frase que se le dice
 * al cliente. Quien llama pone el resto según el turno, porque no es lo mismo
 * pedirle el día que confirmarle la visita.
 *
 * Punto decimal y no coma, igual que la pieza y que la cotización: el formato
 * es-EC («$277,44») fue 4 de los 8 `precio_incorrecto` ALTA del informe del
 * guardián del 15-ago, porque el revisor lee dos números distintos.
 */
export function fraseDeAhorro(ahorro: AhorroDeLaCotizacion): string {
  return `*${ahorro.porcentaje} %* de descuento, *$${ahorro.monto.toFixed(2)}* menos`;
}

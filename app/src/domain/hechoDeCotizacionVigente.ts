/**
 * LA LÍNEA DE LA COTIZACIÓN VIGENTE, COMO SE LA DAMOS AL GUARDIÁN.
 *
 * Caso 39909 (7-nov-2026): la cotización era 2 × $251.59 + 2 × $100.64 = $704.46,
 * pero el Guardián recibía «4 × KENDA KR50 265/60R18 a $251.59 c/u, total
 * $704.46» (`salePriceWithTax` con Black Friday es el precio de LISTA, el de
 * las impares). El borrador decía «$188.69 c/u» (el de hoy), el revisor obedeció
 * «los precios de la cotización mandan» y lo cambió por «$251.59 c/u»: +$301.90
 * contra lo que cuesta. Con Black Friday la línea no tiene un «c/u»; se la
 * damos con la cuenta, la misma que dice la lámina.
 *
 * Solo mientras la temporada siga vigente (`segundaGuardadaVigente`): una
 * cotización de noviembre leída el 2-dic, o con la compuerta cerrada, vuelve
 * al «a $P c/u». Aquí va el HECHO; la regla («un c/u para esta marca es
 * precio_incorrecto») vive en el hecho de temporada (`hechosDeTemporada.ts`).
 */
import {
  cuentaConRotulo, segundaGuardadaVigente, type PromocionDeTemporada, type SegundaLlanta,
} from "./promocionDeTemporada.js";

export interface ItemDeCotizacion {
  brand?: string;
  design?: string;
  sizeLabel?: string;
  quantity?: number;
  salePriceWithTax?: number;
  segundaLlanta?: SegundaLlanta | null;
}

export function lineaDeLaCotizacionVigente(
  item: ItemDeCotizacion | undefined,
  promo: PromocionDeTemporada | null | undefined,
  ahora: Date = new Date(),
): string {
  if (!item) return "";
  const nombre = ` · ${item.quantity ?? "?"} × ${item.brand ?? ""} ${item.design ?? ""} ${item.sizeLabel ?? ""}`;
  const segunda = segundaGuardadaVigente(promo, item.segundaLlanta, ahora);
  if (segunda && Number(item.quantity) >= 2) {
    return `${nombre}: ${cuentaConRotulo(Number(item.quantity), segunda)} (con Black Friday no hay un precio por llanta: ni $${segunda.precioNormalConIva.toFixed(2)} ni el de catálogo de hoy)`;
  }
  return nombre + (item.salePriceWithTax ? ` a $${Number(item.salePriceWithTax).toFixed(2)} c/u` : "");
}

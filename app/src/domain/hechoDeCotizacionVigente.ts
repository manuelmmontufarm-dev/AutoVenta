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
 */
import { cuentaConRotulo, type SegundaLlanta } from "./promocionDeTemporada.js";

export interface ItemDeCotizacion {
  brand?: string;
  design?: string;
  sizeLabel?: string;
  quantity?: number;
  salePriceWithTax?: number;
  segundaLlanta?: SegundaLlanta | null;
}

export function lineaDeLaCotizacionVigente(item: ItemDeCotizacion | undefined): string {
  if (!item) return "";
  const nombre = ` · ${item.quantity ?? "?"} × ${item.brand ?? ""} ${item.design ?? ""} ${item.sizeLabel ?? ""}`;
  if (item.segundaLlanta && Number(item.quantity) >= 2) {
    return `${nombre}: ${cuentaConRotulo(Number(item.quantity), item.segundaLlanta)} — con Black Friday NO existe un precio por llanta: ni «$${item.segundaLlanta.precioNormalConIva.toFixed(2)} c/u» (es la lista de las impares) ni el precio de catálogo de hoy; se dice la cuenta o el total`;
  }
  return nombre + (item.salePriceWithTax ? ` a $${Number(item.salePriceWithTax).toFixed(2)} c/u` : "");
}

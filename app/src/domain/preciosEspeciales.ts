/**
 * PRECIOS ESPECIALES POR CÓDIGO — puro: qué llanta lleva qué precio y hasta cuándo.
 *
 * Competimotor, 20-nov-2026: Black Friday con una lista de precios por llanta
 * (`negocio/politicas/mundillantasBlackFriday.ts`, generada por
 * `scripts/competimotor/black-friday.ts`). Manuel: rige desde ya hasta el lunes
 * 30-nov-2026 a las 23:59 de Ecuador, y después se apaga solo.
 *
 * Se monta sobre el MISMO mecanismo que ya dibuja el precio tachado: el precio
 * de hoy (`minimumPriceWithTax`) pasa a ser el de la promo y el de siempre
 * (`customerPriceWithTax`, que en Competimotor es el P2) queda como el tachado.
 * Así la pieza, el PDF, el texto, las cuotas, el guardián y la cotización
 * firmada dicen la misma cifra sin que ninguno la recalcule.
 *
 * Tres candados, para no cagarla con los precios:
 *   - la medida de la lista tiene que ser la de la llanta (un código reusado en
 *     Fénix para otra medida no hereda el precio);
 *   - el precio de la promo tiene que ser MENOR que el de hoy (si no, no es
 *     promo: la llanta sigue igual y sin rótulo);
 *   - fuera de `desde`–`hasta` no se toca nada.
 */
import type { CatalogItem } from "./catalog.js";
import type { PreciosEspeciales } from "../negocio/politica.js";

export type { PreciosEspeciales };

/** Lo que una llanta del catálogo lleva cuando la promo le aplica. */
export interface PromocionDePrecio {
  nombre: string;
  /** El último instante vigente, ISO. */
  hasta: string;
  vigenciaLarga: string;
  vigenciaCorta: string;
}

/** ¿La lista rige en este instante? */
export function preciosEspecialesVigentes(
  lista: PreciosEspeciales | null | undefined,
  ahora: Date = new Date(),
): lista is PreciosEspeciales {
  if (!lista) return false;
  const t = ahora.getTime();
  return t >= Date.parse(lista.desde) && t <= Date.parse(lista.hasta);
}

/**
 * Milisegundos hasta el próximo cambio (que empiece o que termine), o null si
 * ya no habrá ninguno. Con eso el catálogo se vuelve a armar en el instante
 * justo, sin esperar la sincronización de cada 5 minutos.
 */
export function msHastaElProximoCambio(lista: PreciosEspeciales | null | undefined, ahora: Date = new Date()): number | null {
  if (!lista) return null;
  const t = ahora.getTime();
  const desde = Date.parse(lista.desde);
  const hasta = Date.parse(lista.hasta) + 1000;
  if (t < desde) return desde - t;
  if (t < hasta) return hasta - t;
  return null;
}

export interface ResultadoDePreciosEspeciales {
  aplicadas: number;
  /** Las que no se aplicaron y por qué (para el log y las pruebas). */
  omitidas: Array<{ codigo: string; motivo: string }>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aplica la lista sobre el catálogo recién armado (lo modifica en el lugar,
 * como `applyInterbotPrices`). Fuera de fechas no toca nada, así que llamar
 * con una lista vencida deja el catálogo como venía.
 */
export function aplicarPreciosEspeciales(
  items: CatalogItem[],
  lista: PreciosEspeciales | null | undefined,
  ahora: Date = new Date(),
): ResultadoDePreciosEspeciales {
  const resultado: ResultadoDePreciosEspeciales = { aplicadas: 0, omitidas: [] };
  if (!preciosEspecialesVigentes(lista, ahora)) return resultado;
  const porCodigo = new Map(items.map((item) => [item.code.trim().toLowerCase(), item]));
  for (const llanta of lista.llantas) {
    const item = porCodigo.get(llanta.codigo.trim().toLowerCase());
    if (!item) {
      resultado.omitidas.push({ codigo: llanta.codigo, motivo: "no está en el inventario de hoy" });
      continue;
    }
    if (item.sizeLabel !== llanta.medida) {
      resultado.omitidas.push({ codigo: llanta.codigo, motivo: `la medida cambió: lista ${llanta.medida}, inventario ${item.sizeLabel}` });
      continue;
    }
    const promo = round2(llanta.precioConIva);
    if (!(promo > 0) || promo >= item.minimumPriceWithTax) {
      resultado.omitidas.push({ codigo: llanta.codigo, motivo: `$${promo.toFixed(2)} no es menor que el precio de hoy $${item.minimumPriceWithTax.toFixed(2)}` });
      continue;
    }
    // El de siempre queda como el tachado; el de hoy es el de la promo.
    item.customerPriceWithTax = Math.max(item.customerPriceWithTax, item.minimumPriceWithTax);
    item.minimumPriceWithTax = promo;
    item.promocionDePrecio = {
      nombre: lista.nombre,
      hasta: lista.hasta,
      vigenciaLarga: lista.vigenciaLarga,
      vigenciaCorta: lista.vigenciaCorta,
    };
    resultado.aplicadas += 1;
  }
  return resultado;
}

/** «Black Friday hasta el lunes 30-nov»: la línea del texto de la cotización. */
export function lineaDePromocionDePrecio(promo: PromocionDePrecio | null | undefined): string | null {
  return promo ? `🖤 *${promo.nombre}* ${promo.vigenciaCorta}` : null;
}

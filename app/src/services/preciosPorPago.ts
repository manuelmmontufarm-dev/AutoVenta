/**
 * EL PRECIO SEGÚN CÓMO PAGA, de las llantas de ESTA conversación.
 *
 * Lo que se cotizó (la última cotización del ciclo; sin cotización, la llanta
 * elegida) con los precios por forma de pago que trae el catálogo
 * (`CatalogItem.preciosPorPago`, Precio B y C del Excel de Fénix). Devuelve
 * null —y el bot sigue como hoy: lo confirma un asesor— si no hay llanta, si
 * alguna no trae B y C, o si la cotización lleva una promoción por par: ahí la
 * cuenta por llanta ya no es «precio × cantidad» y no se inventa otra.
 */
import { sql } from "../db/client.js";
import {
  TITULO_PRECIOS_POR_PAGO,
  mensajeDeUnPago,
  mensajeDePreciosPorPago,
  pagoPreguntado,
  type LineaPorPago,
} from "../domain/preciosPorPago.js";
import { findByCode } from "./catalog.js";

interface LineaGuardada {
  code?: string | null;
  quantity?: number | null;
  brand?: string | null;
  design?: string | null;
  sizeLabel?: string | null;
  salePriceWithTax?: number | null;
  segundaLlanta?: unknown;
}

export async function preciosPorPagoDeLaConversacion(
  conversationId: number,
  cycle: number,
  textoDelCliente?: string | null,
): Promise<string | null> {
  const [cotizacion] = await sql<{ items: LineaGuardada[] | null }[]>`
    select items from quotes
    where conversation_id=${conversationId} and cycle=${cycle}
    order by created_at desc limit 1
  `;
  let lineas: LineaGuardada[] = cotizacion?.items ?? [];
  if (!lineas.length) {
    const [ficha] = await sql<{ selected_product_code: string | null; selected_quantity: number | null }[]>`
      select selected_product_code, selected_quantity from conversations where id=${conversationId}
    `;
    if (ficha?.selected_product_code) {
      lineas = [{ code: ficha.selected_product_code, quantity: ficha.selected_quantity }];
    }
  }
  if (!lineas.length) return null;
  const porPago: LineaPorPago[] = [];
  for (const linea of lineas) {
    if (linea.segundaLlanta) return null;
    const item = linea.code ? findByCode(linea.code) : undefined;
    if (!item?.preciosPorPago) return null;
    // El «normal» es el de la cotización firmada; sin cotización, el del catálogo.
    const normal = Number(linea.salePriceWithTax) || item.customerPriceWithTax;
    const { tarjetaConIva, efectivoConIva } = item.preciosPorPago;
    // Nunca un «con tarjeta» o «en efectivo» más caro que lo cotizado.
    if (tarjetaConIva > normal || efectivoConIva > normal) return null;
    const cantidad = Math.max(1, Math.round(Number(linea.quantity) || 1));
    const nombre = [linea.brand ?? item.brand, linea.design ?? item.design, linea.sizeLabel ?? item.sizeLabel]
      .filter(Boolean).join(" ");
    porPago.push({ nombre, cantidad, normal, tarjeta: tarjetaConIva, efectivo: efectivoConIva });
  }
  // El bloque completo ya salió en este ciclo hace poco: se contesta SOLO el
  // pago que preguntó (simulador, 18-nov: el segundo bloque idéntico lo quitó
  // el candado de calcos y el turno quedó sin respuesta).
  const pago = pagoPreguntado(textoDelCliente);
  if (pago) {
    const [yaSalio] = await sql<{ x: number }[]>`
      select 1 as x from messages
      where conversation_id=${conversationId} and cycle=${cycle}
        and direction='outbound' and author_kind='bot'
        and created_at > now() - interval '30 minutes'
        and content like ${`${TITULO_PRECIOS_POR_PAGO}%`}
      limit 1
    `;
    if (yaSalio) return mensajeDeUnPago(porPago, pago);
  }
  return mensajeDePreciosPorPago(porPago);
}

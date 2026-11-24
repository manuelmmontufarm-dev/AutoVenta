/**
 * EL PRECIO SEGÚN CÓMO PAGA, de las llantas de ESTA conversación.
 *
 * Lo que se cotizó (la última cotización del ciclo; sin cotización, la llanta
 * elegida; y si lo último que vio fue la lámina, sus opciones numeradas) con
 * los precios por forma de pago que trae el catálogo (`CatalogItem.
 * preciosPorPago`, Precio B y C del Excel de Fénix). Una llanta sin B y C (o con
 * promoción por par) sale con su precio normal y «la confirma un asesor»; si
 * ninguna los trae, null y el bot sigue como hoy.
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
import { listaDeLaPieza } from "../domain/listaDeOpciones.js";
import { politica } from "../negocio/politica.js";

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
  const [cotizacion] = await sql<{ items: LineaGuardada[] | null; created_at: Date }[]>`
    select items, created_at from quotes
    where conversation_id=${conversationId} and cycle=${cycle}
    order by created_at desc limit 1
  `;
  // LA LÁMINA TAMBIÉN CUENTA (producción, 19-nov 03:32, Manuel): con «1 ·
  // TOWNHALL TH-161 · 2 · KENDA KR203» y nadie eligió, «Cuánto en efectivo?»
  // cayó en «eso se lo confirma un asesor»: solo se miraba la cotización y la
  // llanta elegida. Lo último que vio el cliente manda: si la lámina es más
  // nueva que la cotización (o no hay cotización), se contestan sus opciones.
  const [lamina] = await sql<{ metadata: Record<string, unknown> | null; created_at: Date }[]>`
    select metadata, created_at from messages
    where conversation_id=${conversationId} and cycle=${cycle}
      and direction='outbound' and metadata->>'piece' = 'options'
    order by created_at desc limit 1
  `;
  const laminaManda = lamina && (!cotizacion || new Date(lamina.created_at) > new Date(cotizacion.created_at));
  let lineas: Array<LineaGuardada & { numero?: number; nombreVisto?: string }> = [];
  if (laminaManda) {
    const vista = listaDeLaPieza(lamina.metadata);
    lineas = (vista?.lista ?? []).map((l) => ({
      code: l.codigo ?? null, quantity: vista!.cantidad, salePriceWithTax: l.precio,
      segundaLlanta: l.segundaLlanta ?? null, numero: l.n, nombreVisto: l.nombre,
    }));
  } else {
    lineas = cotizacion?.items ?? [];
  }
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
  // COTIZA CON TARJETA (Competimotor, Carlos Romero, 20-nov-2026): el precio
  // con tarjeta ES el de la cotización (Precio B, o el de Black Friday si es
  // menor) y en efectivo o transferencia el C, nunca más caro que con tarjeta.
  // El Precio A no se dice. Se leen del catálogo DE HOY: una cotización vieja
  // firmada con el A, o una de Black Friday ya vencido, no arrastra su precio.
  const conTarjeta = politica.precioDeCotizacion === "tarjeta";
  for (const linea of lineas) {
    const item = linea.code ? findByCode(linea.code) : undefined;
    if (conTarjeta) {
      const precios = item?.preciosPorPago;
      const cantidad = Math.max(1, Math.round(Number(linea.quantity) || 1));
      const nombre = linea.nombreVisto
        ?? [linea.brand ?? item?.brand, linea.design ?? item?.design, linea.sizeLabel ?? item?.sizeLabel].filter(Boolean).join(" ");
      const tarjeta = precios && item && !linea.segundaLlanta ? Math.min(precios.tarjetaConIva, item.minimumPriceWithTax) : null;
      porPago.push({
        nombre, numero: linea.numero, cantidad, normal: null,
        tarjeta,
        efectivo: tarjeta !== null && precios ? Math.min(precios.efectivoConIva, tarjeta) : null,
        promocion: item?.promocionDePrecio ? [item.promocionDePrecio.nombre, item.promocionDePrecio.vigenciaCorta].filter(Boolean).join(" ") : null,
      });
      continue;
    }
    // El «normal» es el que el cliente vio (cotización o lámina); sin eso, el del catálogo.
    const normal = Number(linea.salePriceWithTax) || item?.customerPriceWithTax;
    if (!normal) return null;
    const cantidad = Math.max(1, Math.round(Number(linea.quantity) || 1));
    const nombre = linea.nombreVisto
      ?? [linea.brand ?? item?.brand, linea.design ?? item?.design, linea.sizeLabel ?? item?.sizeLabel].filter(Boolean).join(" ");
    const precios = item?.preciosPorPago;
    // Sin B/C, con promoción por par (la cuenta ya no es precio × cantidad) o
    // con un B/C más caro que lo que vio: ESA llanta la confirma un asesor.
    const usable = precios && !linea.segundaLlanta
      && precios.tarjetaConIva <= normal && precios.efectivoConIva <= normal;
    porPago.push({
      nombre, numero: linea.numero, cantidad, normal,
      tarjeta: usable ? precios.tarjetaConIva : null,
      efectivo: usable ? precios.efectivoConIva : null,
    });
  }
  // Si NINGUNA trae precio por pago no hay nada que decir: sigue lo de siempre.
  if (!porPago.some((l) => l.tarjeta !== null && l.efectivo !== null)) return null;
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
        and content like ${`${TITULO_PRECIOS_POR_PAGO.replace(/:$/, "")}%`}
      limit 1
    `;
    if (yaSalio) return mensajeDeUnPago(porPago, pago);
  }
  return mensajeDePreciosPorPago(porPago);
}

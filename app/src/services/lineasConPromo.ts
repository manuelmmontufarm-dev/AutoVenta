/**
 * LAS LÍNEAS CON BLACK FRIDAY QUE EL CLIENTE TIENE A LA VISTA.
 *
 * Las dos cosas que le enseñaron plata en este ciclo y que guardaron la promo
 * junto con la línea: la última cotización firmada (`quotes.items[].segundaLlanta`)
 * y la última pieza de opciones (`messages.metadata.escalones[].segunda_llanta`).
 * De aquí las lee el candado `sin_precio_por_llanta_con_promo` y el texto que
 * acompaña a una cotización recién firmada: se lee lo guardado, nunca se
 * parsea el texto del bot (regla 9 de las sesiones de arreglo).
 *
 * Una cotización más nueva que la pieza la reemplaza: si el cliente cambió la
 * cantidad, las líneas de la pieza vieja ya no describen lo que tiene.
 */
import { sql } from "../db/client.js";
import { cantidadDeLaSegunda, promocionVigente, segundaGuardadaVigente, type SegundaLlanta } from "../domain/promocionDeTemporada.js";
import { politica } from "../negocio/politica.js";
import type { LineaConPromo } from "../domain/sinPrecioPorLlantaConPromo.js";

export interface LineaDeCotizacion {
  code?: string;
  brand?: string;
  design?: string;
  quantity?: number;
  salePriceWithTax?: number;
  precioSinPromoConIva?: number;
  segundaLlanta?: SegundaLlanta | null;
}

/** Las líneas de la última cotización del ciclo, o null si no hay. */
export async function lineasDeLaUltimaCotizacion(
  conversationId: number,
  cycle: number,
): Promise<{ lineas: LineaDeCotizacion[]; creada: Date } | null> {
  const [fila] = await sql<{ items: unknown; created_at: Date }[]>`
    select items, created_at from quotes
    where conversation_id = ${conversationId} and cycle = ${cycle}
    order by created_at desc, id desc limit 1
  `;
  if (!fila || !Array.isArray(fila.items)) return null;
  return { lineas: fila.items as LineaDeCotizacion[], creada: new Date(fila.created_at) };
}

function deLaCotizacion(lineas: readonly LineaDeCotizacion[]): LineaConPromo[] {
  return lineas.flatMap((l) => {
    const s = l.segundaLlanta;
    if (!s || !(Number(s.precioNormalConIva) > 0)) return [];
    const cantidad = Number(l.quantity) >= 1 ? Math.round(Number(l.quantity)) : cantidadDeLaSegunda(s);
    // Con promo `salePriceWithTax` es la lista y `precioSinPromoConIva` el de hoy.
    const hoy = Number(l.precioSinPromoConIva) > 0 ? Number(l.precioSinPromoConIva) : Number(l.salePriceWithTax);
    return [{
      nombre: `${l.brand ?? ""} ${l.design ?? ""}`.trim() || (l.code ?? "línea"),
      hoyConIva: hoy,
      listaConIva: s.precioNormalConIva,
      cantidad,
      segunda: s,
    }];
  });
}

interface EscalonGuardado {
  nombre?: string;
  precio_con_iva?: number;
  segunda_llanta?: SegundaLlanta | null;
}

function deLaPieza(escalones: unknown): LineaConPromo[] {
  const vistos = new Set<string>();
  return Object.values((escalones ?? {}) as Record<string, EscalonGuardado | null>).flatMap((o) => {
    const s = o?.segunda_llanta;
    if (!o || !s || !(Number(s.precioNormalConIva) > 0) || !(Number(o.precio_con_iva) > 0)) return [];
    const llave = `${o.nombre}|${o.precio_con_iva}`;
    if (vistos.has(llave)) return [];
    vistos.add(llave);
    return [{
      nombre: o.nombre ?? "opción",
      hoyConIva: Number(o.precio_con_iva),
      listaConIva: s.precioNormalConIva,
      cantidad: cantidadDeLaSegunda(s),
      segunda: s,
    }];
  });
}

/**
 * Todas las líneas con promo que el cliente tiene a la vista en este ciclo Y que
 * siguen valiendo hoy:
 *
 *  · Solo mientras la temporada corra (fechas + compuerta, `promocionVigente`): una
 *    cotización de noviembre leída el 2-dic, o con la promo apagada en Ajustes, ya
 *    no se cobra con el 60 %, y reescribir un «c/u» correcto con esa cuenta sería
 *    prometer un descuento que no existe.
 *  · Solo si la cantidad de la línea es la que el ESTADO dice: la ficha
 *    (`conversations.selected_quantity`) manda sobre lo que la lámina calculó. Si el
 *    cliente ya pidió 3 («tres llantas por favor», conv 40137) y la lámina trae la
 *    cuenta de 4, esa línea no describe lo que quiere y no se reescribe nada con ella.
 *    Sin cantidad en la ficha rige la de la cotización o la pieza guardadas, que
 *    también son estado. Nunca se lee una cantidad del texto del bot ni del cliente.
 */
export async function lineasConPromoDelCiclo(
  conversationId: number,
  cycle: number,
  ahora: Date = new Date(),
): Promise<LineaConPromo[]> {
  if (!promocionVigente(politica.promocionDeTemporada, ahora)) return [];
  const cotizacion = await lineasDeLaUltimaCotizacion(conversationId, cycle);
  const [pieza] = await sql<{ escalones: unknown; created_at: Date }[]>`
    select metadata->'escalones' as escalones, created_at from messages
    where conversation_id = ${conversationId} and cycle = ${cycle}
      and metadata->>'piece' = 'options'
    order by created_at desc, id desc limit 1
  `;
  const [ficha] = await sql<{ selected_quantity: number | null }[]>`
    select selected_quantity from conversations where id = ${conversationId}
  `;
  const cantidadDelCliente = Number(ficha?.selected_quantity) >= 1 ? Number(ficha!.selected_quantity) : null;
  const piezaVigente = pieza && (!cotizacion || new Date(pieza.created_at) > cotizacion.creada);
  return [
    ...(cotizacion ? deLaCotizacion(cotizacion.lineas) : []),
    ...(piezaVigente ? deLaPieza(pieza.escalones) : []),
  ].filter((l) => segundaGuardadaVigente(politica.promocionDeTemporada, l.segunda, ahora) !== null
    && (cantidadDelCliente === null || cantidadDelCliente === l.cantidad));
}

/**
 * Cómo se dice el precio de una línea recién cotizada, leído de la cotización
 * guardada: la cuenta si la línea lleva la promo, `null` si no (el llamador cae
 * al «c/u»). Devuelve también el precio firmado cuando no hay promo.
 */
export async function lineaCotizadaDe(
  conversationId: number,
  cycle: number,
  codigo: string,
): Promise<LineaDeCotizacion | null> {
  const cotizacion = await lineasDeLaUltimaCotizacion(conversationId, cycle);
  return cotizacion?.lineas.find((l) => l.code === codigo) ?? null;
}

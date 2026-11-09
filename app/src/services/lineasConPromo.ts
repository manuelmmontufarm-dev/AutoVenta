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
import { cantidadValidaDeLaFicha } from "../domain/cantidadGrande.js";
import { cantidadDelTexto } from "../domain/salesIntent.js";
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
 * LA CANTIDAD QUE DIJO EL CLIENTE (no el bot): su mensaje de este turno, la ficha
 * (`selected_quantity`) y, solo si la ficha está vacía, lo último que dijo de cantidad
 * en el ciclo (sus mensajes entrantes). En producción la ficha de 40137 quedó vacía
 * aunque escribió «tres llantas por favor me cotizas». Usa el lector que ya existe
 * (`cantidadDelTexto`, que no se toca aquí); es texto del CLIENTE, nunca del bot.
 *
 * `cantidad` es la que se usa para hacer una cuenta (lo que dice en este turno manda
 * sobre una ficha vieja); `vetos` son todas las que, si difieren de una línea, impiden
 * reescribirla con la cuenta de esa línea.
 */
export async function cantidadDelCliente(
  conversationId: number,
  textoDelTurno?: string | null,
  mensajeCitado?: string | null,
): Promise<{ cantidad: number | null; ficha: number | null; turno: number | null; historial: number | null; vetos: number[] }> {
  const [fila] = await sql<{ selected_quantity: number | null; current_cycle: number }[]>`
    select selected_quantity, current_cycle from conversations where id = ${conversationId}
  `.catch(() => []);
  const ficha = cantidadValidaDeLaFicha(fila?.selected_quantity);
  // Los mensajes del ciclo en las DOS direcciones, del más nuevo al más viejo: para leer lo que dijo
  // el cliente hay que saber a qué CONTESTABA. Sin el saliente anterior, el «3» que elige la 3 del
  // menú «¿Le cotizo la 1, la 2 o la 3?» se lee como 3 llantas (ronda 3: reabría la familia original).
  type Fila = { direction: string; author_kind: string | null; content: string | null; clase: string | null };
  const filas = fila
    ? await sql<Fila[]>`
        select direction, author_kind, content, metadata->'oferta'->>'clase' as clase from messages
        where conversation_id = ${conversationId} and cycle = ${fila.current_cycle}
        order by created_at desc, id desc limit 60
      `.catch(() => [] as Fila[])
    : [];
  const esDelCliente = (m: Fila) => m.direction === "inbound" && (m.author_kind ?? "customer") === "customer";
  /** Lo que el bot dijo justo ANTES del mensaje en la posición `i` (la 0 es el más nuevo). */
  const previoDe = (i: number) => {
    let inmediato: Fila | null = null;
    let menu = false;
    let vistos = 0;
    for (let j = i + 1; j < filas.length && vistos < 4; j++) {
      // Un mensaje del cliente en medio: lo anterior ya fue contestado, no es de este.
      if (filas[j].direction === "inbound") break;
      if (filas[j].direction !== "outbound") continue;
      vistos++;
      inmediato ??= filas[j];
      // Hasta 4 burbujas del bot entre el menú y la respuesta (mapas, «Quedo atento…»).
      if (filas[j].clase === "menu") menu = true;
    }
    return { content: inmediato?.content ?? null, menu };
  };
  // Un entrante del CLIENTE (nunca del asesor ni del bot), con lo que lo precedió.
  const entrantes = filas
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => esDelCliente(m))
    .slice(0, 12)
    .map(({ m, i }) => ({ texto: m.content, previo: previoDe(i) }));
  // El mensaje de ESTE turno: si ya está guardado es el último entrante y se lee contra lo que lo
  // precedió (NO contra el saliente más nuevo: para cuando corre el candado, `generar_cotizacion` ya
  // guardó «Cotización … enviada»). Si todavía no está guardado, lo anterior es lo último que se dijo.
  const ultimo = filas.findIndex(esDelCliente);
  const previoDelTurno = ultimo >= 0 && (filas[ultimo].content ?? "").trim() === (textoDelTurno ?? "").trim()
    ? previoDe(ultimo)
    : previoDe(-1);
  // Contestar el menú es elegir, no pedir llantas: lo dice el HECHO guardado en el saliente
  // (`oferta.clase = "menu"`), aunque el cliente escriba «quiero la 2»; la excepción es que
  // nombre la unidad («mejor quiero 3 llantas»). Además rige el freno de texto del lector, que
  // también mira el mensaje que el cliente citó, si lo hay.
  const leer = (texto: string | null | undefined, previo: { content: string | null; menu: boolean }, citado: string | null = null): number | null => {
    if (!texto) return null;
    if (previo.menu && !/\b(?:llantas?|unidad(?:es)?)\b/i.test(texto)) return null;
    return cantidadDelTexto(texto, previo.content, citado);
  };
  // Lo último que dijo el cliente manda siempre (su mensaje de este turno o, si el llamador no lo
  // pasa, el más reciente de la base). El resto del ciclo se mira solo con la ficha vacía.
  const turno = textoDelTurno
    ? leer(textoDelTurno, previoDelTurno, mensajeCitado)
    : entrantes[0] ? leer(entrantes[0].texto, entrantes[0].previo) : null;
  // Lo último que el cliente DIJO en el ciclo se lee siempre, no solo con la ficha vacía: la ficha puede
  // traer el 4 que el modelo declaró por defecto y el cliente, después, escribió «tres llantas»
  // (40137 en el orden real: medida sola → menú → «tres llantas…» → «La 2» cotizaba 4). Lo dicho
  // por él manda sobre la ficha; sin nada dicho, manda la ficha.
  let historial: number | null = null;
  for (const e of entrantes) {
    const n = leer(e.texto, e.previo);
    if (n !== null) { historial = n; break; }
  }
  return {
    cantidad: turno ?? historial ?? ficha,
    ficha, turno, historial,
    vetos: [ficha, turno, historial].filter((n): n is number => n !== null),
  };
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
  textoDelCliente?: string | null,
): Promise<LineaConPromo[]> {
  if (!promocionVigente(politica.promocionDeTemporada, ahora)) return [];
  const cotizacion = await lineasDeLaUltimaCotizacion(conversationId, cycle);
  const [pieza] = await sql<{ escalones: unknown; created_at: Date }[]>`
    select metadata->'escalones' as escalones, created_at from messages
    where conversation_id = ${conversationId} and cycle = ${cycle}
      and metadata->>'piece' = 'options'
    order by created_at desc, id desc limit 1
  `;
  const { vetos } = await cantidadDelCliente(conversationId, textoDelCliente);
  const piezaVigente = pieza && (!cotizacion || new Date(pieza.created_at) > cotizacion.creada);
  return [
    ...(cotizacion ? deLaCotizacion(cotizacion.lineas) : []),
    ...(piezaVigente ? deLaPieza(pieza.escalones) : []),
  ].filter((l) => segundaGuardadaVigente(politica.promocionDeTemporada, l.segunda, ahora) !== null
    && vetos.every((n) => n === l.cantidad));
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

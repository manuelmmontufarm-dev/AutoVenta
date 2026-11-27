/**
 * «ESTÁ CARO», CON LOS DATOS DE ESTA CONVERSACIÓN (Sprint 2, Competimotor).
 *
 * Lo que el cliente vio sale de lo que la lámina o la cotización GUARDARON
 * (metadata de la pieza, `quotes.items`), nunca del texto del bot; el efectivo
 * y la más barata de su medida, del catálogo de hoy. La respuesta la arma
 * `domain/objecionDePrecio.ts`. Sin la perilla `politica.ventaConDosPrecios`
 * (Depot) no se llama.
 */
import { sql } from "../db/client.js";
import { findByCode, searchBySize } from "./catalog.js";
import { parseTireSize } from "../domain/tireSize.js";
import { efectivoDeLaLlanta } from "../domain/preciosPorPago.js";
import { cantidadDichaConTolerancia, respuestaAObjecionDePrecio, type OpcionMasBarata, type OpcionVista } from "../domain/objecionDePrecio.js";
import { buildBenefitsBlock } from "./benefits.js";
import { MAX_NUMERADA } from "../domain/listaDeOpciones.js";
import { extractExplicitQuantity } from "../domain/salesIntent.js";

interface Guardada { codigo?: string; nombre?: string; precio_con_iva?: number; efectivo_con_iva?: number | null }

/** Lo que el cliente tiene a la vista: la lámina o la cotización, la más nueva del ciclo. */
export async function loQueVioElCliente(conversationId: number, cycle: number): Promise<{
  vistas: Array<OpcionVista & { codigo: string | null }>; cantidad: number; medida: string | null;
} | null> {
  const [lamina] = await sql<{ metadata: Record<string, unknown> | null; created_at: Date }[]>`
    select metadata, created_at from messages
    where conversation_id=${conversationId} and cycle=${cycle}
      and direction='outbound' and metadata->>'piece' = 'options'
    order by created_at desc, id desc limit 1
  `;
  const [cotizacion] = await sql<{ items: Array<Record<string, unknown>> | null; created_at: Date }[]>`
    select items, created_at from quotes
    where conversation_id=${conversationId} and cycle=${cycle}
    order by created_at desc limit 1
  `;
  const [ficha] = await sql<{ selected_quantity: number | null }[]>`
    select selected_quantity from conversations where id=${conversationId}
  `;
  // La cantidad que el cliente DIJO después de ver la lámina («Nesecito dos cuanto es
  // el valor», 1321): de SUS mensajes, nunca del texto del bot.
  const dichos = lamina
    ? await sql<{ content: string | null }[]>`
        select content from messages
        where conversation_id=${conversationId} and cycle=${cycle} and direction='inbound'
          and created_at > ${lamina.created_at}
        order by created_at desc limit 6
      `
    : [];
  const dicha = dichos
    .map((m) => extractExplicitQuantity(m.content ?? "") ?? cantidadDichaConTolerancia(m.content))
    .find((n): n is number => n !== null && n >= 1) ?? null;
  const efectivoDe = (codigo: string | null, guardado: unknown) => {
    if (Number(guardado) > 0) return Number(guardado);
    const item = codigo ? findByCode(codigo) : undefined;
    return item ? efectivoDeLaLlanta(item) : null;
  };
  if (cotizacion?.items?.length && (!lamina || new Date(cotizacion.created_at) > new Date(lamina.created_at))) {
    const linea = cotizacion.items[0];
    const codigo = typeof linea.code === "string" ? linea.code : null;
    const tarjeta = Number(linea.salePriceWithTax);
    if (!(tarjeta > 0)) return null;
    const item = codigo ? findByCode(codigo) : undefined;
    return {
      vistas: [{
        codigo,
        nombre: [linea.brand, linea.design].filter(Boolean).join(" ") || item?.name || "la cotizada",
        tarjeta,
        efectivo: efectivoDe(codigo, null),
      }],
      cantidad: Math.max(1, Math.round(Number(linea.quantity) || 1)),
      medida: typeof linea.sizeLabel === "string" ? linea.sizeLabel : item?.sizeLabel ?? null,
    };
  }
  if (!lamina?.metadata) return null;
  const md = lamina.metadata;
  const guardadas: Guardada[] = Array.isArray(md.lista)
    ? (md.lista as Guardada[])
    : Object.values((md.escalones ?? {}) as Record<string, Guardada | null>).filter((o): o is Guardada => Boolean(o));
  const vistos = new Set<string>();
  const unicas = guardadas
    .filter((o) => o?.nombre && Number(o.precio_con_iva) > 0)
    .filter((o) => {
      const llave = String(o.codigo ?? o.nombre).toLowerCase();
      if (vistos.has(llave)) return false;
      vistos.add(llave);
      return true;
    })
    .sort((a, b) => Number(a.precio_con_iva) - Number(b.precio_con_iva));
  if (!unicas.length) return null;
  const numeradas = unicas.length >= 2 && unicas.length <= MAX_NUMERADA;
  const cantidadDeLaPieza = Number.isInteger(md.cantidad) && Number(md.cantidad) >= 1 ? Number(md.cantidad) : 4;
  const medidaDeLaPieza = typeof md.sizeLabel === "string" && md.sizeLabel ? md.sizeLabel : null;
  return {
    vistas: unicas.map((o, i) => ({
      ...(numeradas ? { n: i + 1 } : {}),
      codigo: o.codigo ?? null,
      nombre: o.nombre!.trim(),
      tarjeta: Number(o.precio_con_iva),
      efectivo: efectivoDe(o.codigo ?? null, o.efectivo_con_iva),
    })),
    // Lo que el cliente DIJO después de la lámina manda sobre la ficha: la ficha trae el
    // juego de 4 que se asume por defecto (1321: ficha 4, cliente «Nesecito dos»).
    cantidad: dicha ?? (ficha?.selected_quantity && ficha.selected_quantity >= 1 ? ficha.selected_quantity : cantidadDeLaPieza),
    medida: medidaDeLaPieza ?? (unicas.length === 1 && unicas[0].codigo ? findByCode(unicas[0].codigo)?.sizeLabel ?? null : null),
  };
}

/** La más barata de la medida que alcanza para la cantidad, si es más barata que todo lo que vio. */
function masBarataDeLaMedida(medida: string | null, cantidad: number, vistas: readonly (OpcionVista & { codigo: string | null })[]): OpcionMasBarata | null {
  const size = medida ? parseTireSize(medida) : null;
  if (!size) return null;
  const minimo = Math.min(...vistas.map((v) => v.tarjeta));
  const codigos = new Set(vistas.map((v) => v.codigo).filter(Boolean));
  const candidata = searchBySize(size)
    .filter((i) => i.sizeLabel === medida && !codigos.has(i.code) && i.stock >= cantidad && i.minimumPriceWithTax > 0 && i.minimumPriceWithTax < minimo)
    .sort((a, b) => a.minimumPriceWithTax - b.minimumPriceWithTax)[0];
  if (!candidata) return null;
  return { nombre: `${candidata.brand} ${candidata.design}`.trim(), tarjeta: candidata.minimumPriceWithTax, efectivo: efectivoDeLaLlanta(candidata) };
}

/** La respuesta al «está caro» de esta conversación, o null (no hay qué decir: sigue el turno del modelo). */
export async function respuestaAObjecionDeLaConversacion(conversationId: number, cycle: number): Promise<string | null> {
  const vio = await loQueVioElCliente(conversationId, cycle);
  if (!vio) return null;
  const masBarata = masBarataDeLaMedida(vio.medida, vio.cantidad, vio.vistas);
  const marcas = [...vio.vistas.map((v) => v.nombre.split(" ")[0]), ...(masBarata ? [masBarata.nombre.split(" ")[0]] : [])];
  const incluye = await buildBenefitsBlock({ brands: marcas, quantity: vio.cantidad }).catch(() => "");
  return respuestaAObjecionDePrecio({ vistas: vio.vistas, cantidad: vio.cantidad, medida: vio.medida, masBarata, incluye: incluye || null });
}

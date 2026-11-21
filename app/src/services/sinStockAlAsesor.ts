/**
 * EL AVISO AL ASESOR CUANDO LO PEDIDO NO TIENE STOCK (Competimotor, 21-nov-2026).
 *
 * Carlos: «en ese caso sería una notificación para que el vendedor vea una
 * solución». Siempre que el cliente pida una medida, un tipo o una marca sin
 * stock, el vendedor recibe qué pidió (medida, tipo, marca, cantidad), qué
 * opciones le mostró el bot y el enlace al ticket (lo pone `buildAdvisorMessage`).
 *
 * Se entera de dos formas, en este orden:
 *  1. La marca `sin_stock_en_lo_pedido` que las búsquedas dejan en la huella
 *     (`agent/tools.ts` → `conSinNoHay`).
 *  2. El borrador del vendedor que niega el stock aunque ninguna búsqueda lo
 *     haya marcado (una marca que no se vende, la cantidad…): el pedido sale de
 *     la ficha y de lo que escribió el cliente.
 * Una vez por pedido y ciclo (la llave lleva medida, tipo y marca).
 */
import { sql } from "../db/client.js";
import { politica } from "../negocio/politica.js";
import { describirPedido, diceNoHay, pedidoSinStockDelResultado, type PedidoSinStock } from "../domain/sinNoHay.js";
import { MARCAS_DE_LLANTA_CONOCIDAS } from "../domain/marcasDeLlanta.js";
import { tipoSolicitadoEn } from "../domain/opcionesCandados.js";
import { normalizeCatalogText } from "../domain/catalog.js";
import { extractTireSizes, formatTireSize } from "../domain/tireSize.js";
import type { HuellaHerramienta } from "./guardian.js";
import { findByCode } from "./catalog.js";
import { cantidadDelCliente } from "./lineasConPromo.js";
import { notifyAdvisor } from "./advisorNotifications.js";
import { createBotAlert } from "./followUps.js";

/** Los códigos que el turno mandó en la lámina (`preparar_opciones`). */
export function codigosMostrados(huella: readonly HuellaHerramienta[]): string[] {
  const codigos: string[] = [];
  for (const h of huella) {
    if (h.herramienta !== "preparar_opciones") continue;
    if (/"error"\s*:/.test(h.resultado.slice(0, 40))) continue;
    const m = /"codes"\s*:\s*\[([^\]]*)\]/.exec(h.argumentos);
    for (const c of m?.[1].match(/"([^"]+)"/g) ?? []) codigos.push(c.slice(1, -1));
  }
  return [...new Set(codigos)];
}

/** La marca de llanta que nombró el cliente, si nombró una. */
function marcaNombrada(texto: string | null | undefined): string | null {
  const n = ` ${normalizeCatalogText(texto ?? "")} `;
  return MARCAS_DE_LLANTA_CONOCIDAS.find((m) => n.includes(` ${m} `))?.toUpperCase() ?? null;
}

export interface ResultadoDelAviso {
  avisado: boolean;
  pedido: PedidoSinStock | null;
  opciones: string[];
}

export async function avisarPedidoSinStock(input: {
  conversation: { id: number; current_cycle: number };
  huella: readonly HuellaHerramienta[];
  textoDelCliente: string | null | undefined;
  borrador: string;
}): Promise<ResultadoDelAviso> {
  const nada: ResultadoDelAviso = { avisado: false, pedido: null, opciones: [] };
  if (!politica.nuncaDecirNoHay) return nada;
  const marcados = input.huella
    .map((h) => pedidoSinStockDelResultado(h.resultado))
    .filter((p): p is PedidoSinStock => p !== null);
  // Lo que va a salir también cuenta: si el texto le dice «no me sale en
  // stock» (lo escribió el Guardián o una ruta directa, sin búsqueda que lo
  // marcara), el aviso tiene que existir — si no, el «un asesor ya le está
  // revisando» es mentira (simulador 21-nov, 325/30R21 por ruta directa).
  const loDice = /no me sale en stock/i.test(input.borrador);
  if (!marcados.length && !diceNoHay(input.borrador) && !loDice) return nada;

  const [ficha] = await sql<{ tire_size: string | null }[]>`
    select tire_size from conversations where id=${input.conversation.id}
  `;
  // Sin marca de la búsqueda, la medida que ESCRIBIÓ el cliente le gana a la ficha.
  const escrita = extractTireSizes(input.textoDelCliente ?? "")[0];
  const base = marcados.at(-1)
    ?? { medida: escrita ? formatTireSize(escrita) : ficha?.tire_size ?? null, tipo: null, marca: null, aro: escrita?.rim ?? null };
  const pedido: PedidoSinStock = {
    ...base,
    tipo: base.tipo ?? tipoSolicitadoEn([input.textoDelCliente ?? ""]),
    marca: base.marca ?? marcaNombrada(input.textoDelCliente),
  };
  const cantidad = (await cantidadDelCliente(input.conversation.id, input.textoDelCliente).catch(() => null))?.cantidad ?? null;
  const opciones = codigosMostrados(input.huella).map((code) => {
    const p = findByCode(code);
    return p ? `${p.brand} ${p.design} ${p.sizeLabel}` : code;
  });
  const lineaPedido = describirPedido(pedido, cantidad);
  const lineaOpciones = opciones.length
    ? `Se le mostró: ${opciones.join("; ")}`
    : "No había ninguna parecida: no se le mostró ninguna opción.";
  const llave = [pedido.medida ?? pedido.aro ?? "", pedido.tipo ?? "", pedido.marca ?? ""].join("|").toLowerCase();
  const dedupeKey = `${input.conversation.id}:${input.conversation.current_cycle}:pedido_sin_stock:${llave}`;
  const motivo = `Pidió: ${lineaPedido}. ${lineaOpciones}. Cliente: «${(input.textoDelCliente ?? "").slice(0, 160)}»`;

  await createBotAlert({
    conversationId: input.conversation.id,
    cycle: input.conversation.current_cycle,
    type: "pedido_sin_stock",
    priority: "medium",
    summary: `Pidió algo sin stock: ${lineaPedido}`,
    exactReason: motivo,
    suggestedAction: "Ver si se puede pedir o conseguir y escribirle al cliente.",
    dedupeKey,
  });
  const envio = await notifyAdvisor({
    conversationId: input.conversation.id,
    cycle: input.conversation.current_cycle,
    eventType: "pedido_sin_stock",
    dedupeKey,
    title: `Pidió: ${lineaPedido}`,
    details: [lineaOpciones],
    reason: `Al cliente no se le dijo «no hay»: se le dijo que no sale en stock en este momento${opciones.length ? " y se le mostraron las parecidas" : " y que un asesor le revisa cómo conseguirla"}.`,
    action: "Busca una solución (pedirla, conseguirla) y escríbele al cliente.",
  });
  console.log(`🔎 Conv ${input.conversation.id}: pedido sin stock (${lineaPedido}); aviso al asesor ${envio.sent ? "enviado" : envio.skipped ? "sin destinatario o ya enviado" : `falló: ${envio.error}`}.`);
  return { avisado: true, pedido, opciones };
}

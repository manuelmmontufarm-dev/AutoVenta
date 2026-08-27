/**
 * CAMBIÓ LA CANTIDAD → SALE OTRA COTIZACIÓN. No una promesa de que saldrá.
 *
 * Producción, 27-ago-2026, conv 3 ciclo 7. El bot cotizó 4 × FALKEN ZE310R
 * 225/65R17 por $637.96 y el cliente escribió «deme solo 3»:
 *
 *   BOT: «Sí, le queda por *3* de la misma *FALKEN ZE310R* que ya tiene
 *         cotizada. Si quiere, le ajusto la cotización al toque.»
 *   CLIENTE: «dale»
 *   BOT: «Perfecto, queda anotado que necesita *3 unidades*. Seguimos con el
 *         local: ¿a cuál de los dos le queda mejor ir?»
 *
 * Nunca salió una pieza por 3. Manuel: «el cliente ni sabe cuánto le va a salir
 * con 3 llantas». Y en los DOS turnos el modelo no llamó ninguna herramienta
 * (`ai_runs`: `routine_stage`, `tools: []`): solo escribió. El Ángel Guardián sí
 * lo vio —`promesa_incumplible` en alta, «promete dejar listo el ajuste para 3
 * llantas pero no existe una cotización ajustada a 3»— pero él solo reescribe
 * texto: le quitó la mentira y siguió sin la cotización.
 *
 * Por eso esto es una RUTA DETERMINÍSTICA y no una línea de prompt. Es la misma
 * lección que ya se pagó tres veces esta semana: lo que tiene que pasar sí o sí
 * no se le pide al modelo. Cuando el cliente dice un número distinto al que
 * tiene cotizado, la cotización nueva se genera acá, sin pasar por el agente.
 *
 * Y se genera con la MISMA herramienta que usa el agente (`generar_cotizacion`),
 * no con una copia: el precio del Interbot, el descuento vivo, el aviso de stock
 * corto, la alerta al asesor y el artefacto salen de un solo lugar. Una segunda
 * implementación de «cotizar» es la forma garantizada de que dentro de un mes
 * las dos digan cosas distintas.
 */
import { sql } from "../db/client.js";
import { ahorroDeLaCotizacion } from "../domain/ahorro.js";
import { esRespuestaDelMenuDePreferencia, extractExplicitQuantity } from "../domain/salesIntent.js";
import { buildTools, type AgentContext } from "../agent/tools.js";
import { buildStoreLinksBlockOnce } from "./storeLinks.js";
import { PREGUNTA_DE_LOCAL, preguntamosElLocal } from "../domain/storeSelection.js";
import { buildVisitPlanQuestion, composeBlocks } from "./quoteMessages.js";
import { business, config } from "../config.js";
import { logFunnelEvent } from "./conversations.js";

interface LineaCotizada {
  code?: string;
  quantity?: number;
  listPriceWithTax?: number;
  salePriceWithTax?: number;
}

export interface RecotizarContext {
  conversation: AgentContext["conversation"];
  customerPhone: string;
  customerName?: string;
  /** Lo último que le dijimos: distingue el «2» del menú de dos llantas. */
  previousOutbound: string | null;
}

/**
 * Devuelve el texto que acompaña a la pieza nueva, o `null` si no había nada
 * que recotizar (y entonces sigue el agente, como siempre).
 */
export async function tryRecotizarPorCantidad(
  ctx: RecotizarContext,
  text: string,
): Promise<string | null> {
  if (!config.openai.directSalesRoutesEnabled) return null;
  // El «2» del menú de preferencia no es una cantidad.
  if (esRespuestaDelMenuDePreferencia(text, ctx.previousOutbound)) return null;
  const nueva = extractExplicitQuantity(text);
  if (!nueva) return null;

  const [vigente] = await sql<{ items: LineaCotizada[] | null }[]>`
    select items from quotes
    where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
    order by created_at desc limit 1
  `;
  const linea = (vigente?.items ?? [])[0];
  // Sin cotización viva no hay nada que ajustar: cotizar por primera vez es
  // trabajo del agente, que además tiene que elegir la llanta.
  if (!linea?.code) return null;
  if (Number(linea.quantity ?? 0) === nueva) return null;

  // La MISMA herramienta del agente, con el MISMO producto y la cantidad nueva.
  const tools = buildTools({
    conversation: ctx.conversation,
    customerPhone: ctx.customerPhone,
    customerName: ctx.customerName,
    currentUserText: text,
  });
  const tool = tools.find((t) => t.function.name === "generar_cotizacion");
  if (!tool) return null;

  let salida: { enviada?: boolean; error?: string } & Record<string, unknown>;
  try {
    salida = JSON.parse(await tool.execute({
      items: [{ code: linea.code, cantidad: nueva }],
      nombre_cliente: null,
    }));
  } catch (error) {
    console.error("❌ Recotizar por cantidad falló; sigue el agente:", error);
    return null;
  }
  // Si la herramienta se negó (stock agotado, candado de medida, el cliente
  // estaba comparando), NO se inventa una respuesta: contesta el agente, que
  // sabe explicar el motivo.
  if (!salida.enviada || salida.error) return null;

  console.log(
    `🔁 Cotización rehecha por cantidad en la conv ${ctx.conversation.id}: `
    + `${linea.quantity} → ${nueva} de ${linea.code}`,
  );
  await logFunnelEvent(ctx.conversation.id, "respuesta_directa", { route: "recotizar_cantidad" })
    .catch(() => undefined);

  // El texto NO repite lo que la pieza ya muestra (Joaquín, 26-ago): la foto
  // nueva trae la cantidad, el unitario y el total. Acá solo va el paso que
  // falta del cierre, y los mapas únicamente si todavía no se enviaron.
  const [facts] = await sql<{ nearest_store: string | null }[]>`
    select nearest_store from conversations where id=${ctx.conversation.id}
  `;
  const localElegido = facts?.nearest_store ?? null;
  const [nuevaCotizacion] = await sql<{ items: LineaCotizada[] | null }[]>`
    select items from quotes
    where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
    order by created_at desc limit 1
  `;
  const ahorro = ahorroDeLaCotizacion(nuevaCotizacion?.items ?? null);
  if (localElegido) {
    return composeBlocks(buildVisitPlanQuestion({
      conDescuentoAutorizado: false,
      locales: business.stores.map((store) => store.name),
      localElegido,
      ahorro,
    }));
  }
  // El acuse es corto y NO repite la cotización: la foto nueva ya trae la
  // cantidad, el unitario y el total. Existe porque sin él el turno se quedaba
  // mudo — la pregunta del local, idéntica a la de 30 segundos antes, la
  // bloqueaba el guardián determinístico por duplicada (visto en el simulador),
  // y el cliente recibía una foto sin una sola palabra.
  const yaPreguntamosElLocal = preguntamosElLocal(ctx.previousOutbound);
  const mapas = yaPreguntamosElLocal ? "" : await buildStoreLinksBlockOnce(ctx.conversation.id);
  return composeBlocks(
    `Listo, se la ajusté a ${nueva} 👍`,
    mapas ? `Puede pasar sin compromiso a verlas y probarlas en su vehículo.\n${mapas}` : null,
    yaPreguntamosElLocal ? null : `${PREGUNTA_DE_LOCAL} 📍`,
  );
}

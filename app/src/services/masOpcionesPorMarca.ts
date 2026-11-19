/**
 * Ruta directa: «QUÉ MÁS TIENE» CON LA LÁMINA POR MARCA EN PANTALLA (Competimotor).
 *
 * Con la regla por marca (`politica.recomendacionPorMarca`) la primera lámina
 * trae Falken, Winrun, Kenda + la de mayor inventario, y «qué más tiene» /
 * «otra marca» / «algo más barato» tiene que traer las que el cliente todavía
 * no vio. La regla estaba en el manual y en la herramienta, pero en el
 * simulador (18-nov, 205/55R16, tres corridas de tres) el modelo contestó en
 * texto —«Sí, también hay más alternativas…»— sin llamar herramientas, o no
 * contestó nada: la segunda lámina nunca salió.
 *
 * Así que, como `recomendarConLaPieza.ts`, el agente no entra: se llama
 * `preparar_opciones` con los códigos de la lámina en pantalla y la herramienta
 * (que sabe que el cliente pidió más) arma la siguiente. Si se niega, contesta
 * el agente, que sabe explicar el motivo.
 *
 * Sin la regla (Depot) devuelve null y nada cambia.
 */
import { sql } from "../db/client.js";
import { buildTools } from "../agent/tools.js";
import { politica } from "../negocio/politica.js";
import { pideMasOpciones } from "../domain/recomendacionPorMarca.js";
import { logFunnelEvent, type Conversation } from "./conversations.js";

export interface MasOpcionesContext {
  conversation: Conversation;
  customerPhone: string;
  customerName?: string;
}

export async function tryMasOpcionesPorMarca(ctx: MasOpcionesContext, text: string): Promise<string | null> {
  if (!politica.recomendacionPorMarca || !pideMasOpciones(text)) return null;
  const [pieza] = await sql<{ metadata: { codes?: unknown; sizeLabel?: unknown; seleccion?: unknown; recomendado?: unknown } | null }[]>`
    select metadata from messages
    where conversation_id=${ctx.conversation.id}
      and cycle=${ctx.conversation.current_cycle}
      and type='image' and metadata->>'piece'='options'
      and coalesce(status, 'sent') <> 'failed'
    order by created_at desc limit 1
  `;
  const m = pieza?.metadata;
  // Solo sobre una lámina armada por la regla y de UNA medida: es la que sabe
  // qué falta mostrar. Otra lámina (equivalentes, por aro) la sigue el agente.
  if (!m?.seleccion || typeof m.sizeLabel !== "string" || !Array.isArray(m.codes) || !m.codes.length) return null;
  const codes = m.codes.map(String);

  const tools = buildTools({
    conversation: ctx.conversation,
    customerPhone: ctx.customerPhone,
    customerName: ctx.customerName,
    currentUserText: text,
  });
  const opciones = tools.find((t) => t.function.name === "preparar_opciones");
  if (!opciones) return null;
  let salida: { error?: string; mensaje_para_enviar?: string };
  try {
    salida = JSON.parse(await opciones.execute({
      codes,
      recomendado: typeof m.recomendado === "string" ? m.recomendado : codes[0],
      motivo: "es la que más stock tiene en su medida",
      nombre_cliente: ctx.customerName ?? "Cliente",
      cantidad: null,
    }));
  } catch (error) {
    console.error("❌ «Qué más tiene» por marca falló; sigue el agente:", error);
    return null;
  }
  if (salida.error || !salida.mensaje_para_enviar) return null;
  console.log(`🧭 «Qué más tiene» por marca en la conv ${ctx.conversation.id} (${m.sizeLabel}).`);
  await logFunnelEvent(ctx.conversation.id, "respuesta_directa", { route: "mas_opciones_por_marca" }).catch(() => undefined);
  return salida.mensaje_para_enviar;
}

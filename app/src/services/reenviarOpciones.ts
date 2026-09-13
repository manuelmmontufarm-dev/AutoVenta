/**
 * «DÉJEME VER LAS OPCIONES OTRA VEZ» → LA LÁMINA DE OPCIONES. NO LA COTIZACIÓN.
 *
 * Pruebas de Manuel, 12-sep-2026 (conv 3, 17:21):
 *
 *   CLIENTE: «dejeme ver las opciones otra vez»
 *   BOT:     [la imagen de la COTIZACIÓN] «Se la envié nuevamente 👆»
 *
 * No había una ruta para volver a mandar la lámina, y el modelo tenía a mano
 * la herramienta de reenviar la cotización. Acá se reenvía la última lámina
 * del ciclo con la MISMA herramienta que la armó (`preparar_opciones`), con
 * sus mismos códigos y su recomendada: nada se recalcula por otro camino.
 */
import { sql } from "../db/client.js";
import { buildTools, type AgentContext } from "../agent/tools.js";
import { pideVerLasOpcionesOtraVez } from "../domain/salesIntent.js";
import { config } from "../config.js";
import { logFunnelEvent } from "./conversations.js";

export interface ReenviarOpcionesContext {
  conversation: AgentContext["conversation"];
  customerPhone: string;
  customerName?: string;
}

export async function tryReenviarOpciones(ctx: ReenviarOpcionesContext, texto: string): Promise<string | null> {
  if (!config.openai.directSalesRoutesEnabled) return null;
  if (!pideVerLasOpcionesOtraVez(texto)) return null;
  const [pieza] = await sql<{ metadata: Record<string, unknown> | null }[]>`
    select metadata from messages
    where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
      and metadata->>'piece'='options'
    order by created_at desc limit 1
  `;
  const codes = Array.isArray(pieza?.metadata?.codes) ? pieza.metadata.codes.map(String) : [];
  if (!codes.length) return null;
  const guardado = pieza?.metadata?.recomendado;
  const recomendado = typeof guardado === "string" && codes.includes(guardado)
    ? guardado
    : codes[Math.min(1, codes.length - 1)];
  const tools = buildTools({
    conversation: ctx.conversation,
    customerPhone: ctx.customerPhone,
    customerName: ctx.customerName,
    currentUserText: texto,
  });
  const preparar = tools.find((t) => t.function.name === "preparar_opciones");
  if (!preparar) return null;
  let salida: { mensaje_para_enviar?: string; error?: string };
  try {
    salida = JSON.parse(await preparar.execute({
      codes,
      nombre_cliente: ctx.customerName ?? "Cliente",
      recomendado,
      motivo: "Equilibra precio y rendimiento para el uso diario",
      cantidad: null,
    }));
  } catch (error) {
    console.error("❌ Reenviar las opciones falló; sigue el agente:", error);
    return null;
  }
  if (salida.error || !salida.mensaje_para_enviar) return null;
  console.log(`🖼️ Opciones reenviadas en la conv ${ctx.conversation.id}: ${codes.join(", ")}`);
  await logFunnelEvent(ctx.conversation.id, "respuesta_directa", { route: "options_resend" }).catch(() => undefined);
  return salida.mensaje_para_enviar;
}

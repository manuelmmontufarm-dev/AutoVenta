/**
 * Loop del agente con OpenAI Chat Completions y function calling.
 * Ejecuta las tools locales y devuelve los resultados al modelo hasta obtener
 * una respuesta final para WhatsApp.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { config } from "../config.js";
import { getHistory, logAiRun } from "../services/conversations.js";
import { getAiConfig, getPublishedStagePrompt } from "../services/settings.js";
import { getPhaseFlags, toolEnabled } from "../services/phases.js";
import { buildSystemPrompt } from "./prompts.js";
import { buildTools, type AgentContext } from "./tools.js";
import { getActiveDiscountOffer } from "../services/discountOffers.js";
import {
  discountOfferMessage,
  getPendingDiscountRule,
  pendingDiscountNoticeMessage,
} from "../services/discountOffers.js";
import { sql } from "../db/client.js";
import { extractVehicleYear } from "../domain/salesIntent.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function runAgent(ctx: AgentContext, userText: string): Promise<string> {
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  const usedTools: string[] = [];
  // El estilo se edita en /configuracion/ia; getAiConfig cachea 30 s en memoria.
  const [aiConfig, stagePrompt, activeDiscount, pendingDiscount, salesFacts, phaseFlags] =
    await Promise.all([
      getAiConfig(),
      getPublishedStagePrompt(ctx.conversation.stage),
      getActiveDiscountOffer(ctx.conversation.id),
      getPendingDiscountRule(ctx.conversation.id),
      getAgentSalesFacts(ctx.conversation.id),
      getPhaseFlags(),
    ]);
  const systemPrompt = buildSystemPrompt(aiConfig, {
    name: stagePrompt.stage,
    objective: stagePrompt.objective,
    prompt: stagePrompt.prompt,
    version: stagePrompt.version,
  });
  const history = await getHistory(ctx.conversation.id);
  if (history.at(-1)?.role === "user" && history.at(-1)?.content === userText) history.pop();
  ctx.currentUserText = userText;
  const allTools = buildTools(ctx);
  const allowed = new Set(stagePrompt.allowedTools);
  // Gate de fases: aunque el prompt permita una tool, si está gateada solo se
  // ofrece con su fase encendida. Las no gateadas pasan siempre.
  const localTools =
    allowed.size === 0
      ? []
      : allTools.filter(
          (tool) => allowed.has(tool.function.name) && toolEnabled(tool.function.name, phaseFlags),
        );
  const tools: ChatCompletionTool[] = localTools.map(({ execute: _execute, ...tool }) => ({
    type: "function",
    function: tool.function,
  }));
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: salesFactsPrompt(salesFacts, ctx.resumedFromHuman) },
    ...(activeDiscount ? [{ role: "system" as const, content: `OFERTA AUTORIZADA Y VIGENTE (fuente determinística): descuento adicional $${(activeDiscount.discountAmountCents / 100).toFixed(2)}, total final $${(activeDiscount.finalTotalCents / 100).toFixed(2)}, condición: ${activeDiscount.condition}. Motivo interno: ${activeDiscount.reason}. No cambies estos valores ni inventes otra oferta.` }] : []),
    ...(pendingDiscount ? [{ role: "system" as const, content: `DESCUENTO AUTORIZADO PENDIENTE DE COTIZACIÓN (fuente determinística): ${pendingDiscount.kind === "percentage" ? `${pendingDiscount.valueCents / 100}%` : `$${(pendingDiscount.valueCents / 100).toFixed(2)}`}, condición: ${pendingDiscount.condition}. No digas que no existe descuento. Se aplicará determinísticamente al generar la próxima cotización; antes de conocer el total no inventes ahorro ni total final.` }] : []),
    ...history,
    { role: "user", content: userText },
  ];

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
      max_tokens: config.openai.maxTokens,
    });
    inputTokens += response.usage?.prompt_tokens ?? 0;
    outputTokens += response.usage?.completion_tokens ?? 0;
    const message = response.choices[0]?.message;
    if (!message) break;
    messages.push(message);

    if (!message.tool_calls?.length) {
      const text = message.content?.trim();
      await logAiRun({
        conversationId: ctx.conversation.id,
        stage: ctx.conversation.stage,
        promptVersionId: stagePrompt.id,
        model: config.openai.model,
        latencyMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        tools: usedTools,
      });
      return withDiscountNotice(text || "Disculpa, ¿me repites por favor?", ctx, activeDiscount, pendingDiscount);
    }

    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      usedTools.push(call.function.name);
      const tool = localTools.find((candidate) => candidate.function.name === call.function.name);
      const result = tool
        ? await tool.execute(parseArguments(call.function.arguments))
        : JSON.stringify({ error: `Tool desconocida: ${call.function.name}` });
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      if (call.function.name === "enviar_comparacion") ctx.comparedThisTurn = true;
      const exact = exactToolReply(result);
      if (exact) {
        await logAiRun({
          conversationId: ctx.conversation.id,
          stage: ctx.conversation.stage,
          promptVersionId: stagePrompt.id,
          model: config.openai.model,
          latencyMs: Date.now() - startedAt,
          inputTokens,
          outputTokens,
          tools: usedTools,
        });
        return withDiscountNotice(exact, ctx, activeDiscount, pendingDiscount);
      }
    }
  }

  await logAiRun({
    conversationId: ctx.conversation.id,
    stage: ctx.conversation.stage,
    promptVersionId: stagePrompt.id,
    model: config.openai.model,
    latencyMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    tools: usedTools,
    error: "max_iterations_or_empty_response",
  });
  return "Disculpa, tuve un problema procesando tu mensaje. ¿Me lo repites por favor?";
}

interface AgentSalesFacts {
  tireSize: string | null;
  vehicle: string | null;
  vehicleYear: number | null;
  selectedProductCode: string | null;
  selectedQuantity: number | null;
}

async function getAgentSalesFacts(conversationId: number): Promise<AgentSalesFacts> {
  const [row] = await sql<{
    tire_size: string | null; vehicle: string | null; vehicle_year: number | null;
    selected_product_code: string | null; selected_quantity: number | null;
    inbound_messages: string[];
  }[]>`
    select c.tire_size, c.vehicle, c.vehicle_year, c.selected_product_code,
      c.selected_quantity,
      coalesce(array_agg(m.content order by m.created_at desc) filter (where m.id is not null), '{}') as inbound_messages
    from conversations c
    left join messages m on m.conversation_id=c.id and m.cycle=c.current_cycle
      and m.direction='inbound'
    where c.id=${conversationId}
    group by c.id
  `;
  const inferredYear = row?.vehicle_year ?? row?.inbound_messages
    .map(extractVehicleYear).find((value): value is number => value !== null) ?? null;
  return {
    tireSize: row?.tire_size ?? null,
    vehicle: row?.vehicle ?? null,
    vehicleYear: inferredYear,
    selectedProductCode: row?.selected_product_code ?? null,
    selectedQuantity: row?.selected_quantity ?? null,
  };
}

function salesFactsPrompt(facts: AgentSalesFacts, resumedFromHuman = false): string {
  const lines = [
    facts.tireSize ? `Medida confirmada: ${facts.tireSize}` : null,
    facts.vehicle ? `Vehículo mencionado: ${facts.vehicle}` : null,
    facts.vehicleYear ? `Año ya informado por el cliente: ${facts.vehicleYear}` : null,
    facts.selectedProductCode ? `Producto elegido: ${facts.selectedProductCode}` : null,
    facts.selectedQuantity ? `Cantidad ya confirmada: ${facts.selectedQuantity}` : null,
  ].filter(Boolean);
  return [
    "HECHOS COMERCIALES CONFIRMADOS (fuente determinística):",
    ...(lines.length ? lines : ["Todavía no hay datos estructurados confirmados."]),
    "No vuelvas a preguntar un dato listado aquí. Pregunta únicamente lo que falte.",
    "Si modelo y cantidad ya están confirmados, genera la cotización inmediatamente y después pregunta si está bien; no pidas otra confirmación.",
    "Para compatibilidad vehicular usa fitment_vehiculo. Si el resultado es referencia o ambiguo, muestra la fuente, reconoce claramente el límite y haz UNA sola pregunta nueva; no repitas la misma lista de versión/país/etiqueta en turnos consecutivos.",
    resumedFromHuman ? "El asesor devolvió la conversación al bot con un mensaje del cliente pendiente. Responde directamente ese último mensaje y retoma el hilo; nunca lo dejes sin contestar." : null,
  ].filter(Boolean).join("\n");
}

function withDiscountNotice(
  text: string,
  ctx: AgentContext,
  active: Awaited<ReturnType<typeof getActiveDiscountOffer>>,
  pending: Awaited<ReturnType<typeof getPendingDiscountRule>>,
): string {
  const target = active?.notificationMode === "next_message" && !active.notifiedAt
    ? { source: "offer" as const, id: active.id, message: discountOfferMessage(active) }
    : pending?.notificationMode === "next_message" && !pending.notifiedAt
      ? { source: "pending" as const, id: pending.id, message: pendingDiscountNoticeMessage(pending) }
      : null;
  if (!target) return text;
  ctx.discountNotice = { source: target.source, id: target.id };
  return /descuento|cotizaci[oó]n .*−|ahorras/i.test(text)
    ? text
    : `${text.trim()}\n\nY adicionalmente: ${target.message}`;
}

function exactToolReply(result: string): string | null {
  try {
    const parsed = JSON.parse(result) as { mensaje_para_enviar?: unknown };
    return typeof parsed.mensaje_para_enviar === "string"
      ? parsed.mensaje_para_enviar.trim()
      : null;
  } catch {
    return null;
  }
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

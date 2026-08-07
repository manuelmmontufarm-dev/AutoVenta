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

/** Rondas del loop antes de rendirse; el rescate es la ronda siguiente. */
const MAX_ITERACIONES = 8;
/**
 * El rescate no es una iteración más del loop: se numera fuera del rango para
 * que modeloDelTurno le dé SIEMPRE el modelo superior (ver abajo el porqué).
 */
const ITERACION_RESCATE = MAX_ITERACIONES;

/**
 * Qué modelo atiende cada ronda del turno.
 *
 * PORQUÉ escalar por número de iteración: un turno sano se resuelve en 2-3
 * iteraciones (busca → cotiza → responde), así que las primeras cuatro van con
 * el modelo principal, que es el barato y el que atiende el 99 % del tráfico.
 * Llegar a la iteración 4 ya no es "va lento": es que el principal está dando
 * vueltas (repite la misma tool, no cierra). Insistir con él es la causa #1 del
 * «tuve un problema procesando» — 8 rondas y un rescate con el MISMO modelo que
 * acababa de atascarse 8 veces. Desde la iteración 4 entra el modelo superior
 * con TODO el contexto ya acumulado (mensajes + resultados de las tools de este
 * turno), que es justo lo que necesita para cerrar, y suele cerrar en una.
 *
 * Con OPENAI_ESCALATION_MODEL sin definir, config lo iguala al principal: sin
 * variable de entorno esto no cambia absolutamente nada.
 */
function modeloDelTurno(iteration: number): string {
  return iteration < 4 ? config.openai.model : config.openai.escalationModel;
}

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

  // Modelo que produjo la respuesta que se devuelve al cliente. Se actualiza
  // ANTES de cada llamada (no después) para que la auditoría vea quién atendió
  // incluso si esa llamada revienta: interesa saber que ya se había escalado.
  let modeloUsado = modeloDelTurno(0);

  for (let iteration = 0; iteration < MAX_ITERACIONES; iteration += 1) {
    modeloUsado = modeloDelTurno(iteration);
    const response = await openai.chat.completions.create({
      model: modeloUsado,
      messages,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
      max_completion_tokens: config.openai.maxTokens,
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
        model: modeloUsado,
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
          model: modeloUsado,
          latencyMs: Date.now() - startedAt,
          inputTokens,
          outputTokens,
          tools: usedTools,
        });
        return withDiscountNotice(exact, ctx, activeDiscount, pendingDiscount);
      }
    }
  }

  // RESCATE (5-ago): agotar las 8 rondas era la causa #1 del «tuve un problema
  // procesando» (7 casos en producción — el modelo se quedaba en bucle con una
  // herramienta que fallaba). Antes de rendirse, una última llamada SIN
  // herramientas lo obliga a responder al cliente con lo que ya averiguó.
  // ESCALACIÓN (7-ago): el rescate corría con el mismo modelo que acababa de
  // atascarse 8 veces; ahora es el turno del superior, con todo el contexto.
  try {
    modeloUsado = modeloDelTurno(ITERACION_RESCATE);
    const rescate = await openai.chat.completions.create({
      model: modeloUsado,
      messages: [
        ...messages,
        {
          role: "system",
          content:
            "Se acabaron los intentos con herramientas. Responde AHORA al cliente con lo que ya sabes de esta conversación: si tienes opciones o precios de las herramientas, dilos; si algo falló, avanza por otro camino (pide el dato que falte o deriva al asesor). Prohibido disculparte por 'problemas procesando' y prohibido pedir que repita el mensaje.",
        },
      ],
      max_completion_tokens: config.openai.maxTokens,
    });
    inputTokens += rescate.usage?.prompt_tokens ?? 0;
    outputTokens += rescate.usage?.completion_tokens ?? 0;
    const texto = rescate.choices[0]?.message?.content?.trim();
    if (texto) {
      await logAiRun({
        conversationId: ctx.conversation.id,
        stage: ctx.conversation.stage,
        promptVersionId: stagePrompt.id,
        model: modeloUsado,
        latencyMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        tools: usedTools,
        error: "max_iterations_salvaged",
      });
      return withDiscountNotice(texto, ctx, activeDiscount, pendingDiscount);
    }
  } catch (error) {
    console.warn("⚠️ Rescate sin herramientas falló:", error instanceof Error ? error.message : error);
  }

  await logAiRun({
    conversationId: ctx.conversation.id,
    stage: ctx.conversation.stage,
    promptVersionId: stagePrompt.id,
    model: modeloUsado,
    latencyMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    tools: usedTools,
    error: "max_iterations_or_empty_response",
  });
  return "Disculpa, tuve un problema procesando tu mensaje. ¿Me lo repites por favor?";
}

export interface AgentSalesFacts {
  tireSize: string | null;
  vehicle: string | null;
  vehicleYear: number | null;
  selectedProductCode: string | null;
  selectedQuantity: number | null;
  /** Última cotización del ciclo — evita mandar dos números para la misma compra. */
  lastQuote: { number: string; total: number; minutesAgo: number } | null;
}

/** Exportada para pruebas: los hechos determinísticos que frenan al modelo (anti-duplicado, medida, cantidad). */
export async function getAgentSalesFacts(conversationId: number): Promise<AgentSalesFacts> {
  const [row] = await sql<{
    tire_size: string | null; vehicle: string | null; vehicle_year: number | null;
    selected_product_code: string | null; selected_quantity: number | null;
    inbound_messages: string[];
    last_quote_number: string | null; last_quote_total: string | number | null;
    last_quote_at: Date | null;
  }[]>`
    select c.tire_size, c.vehicle, c.vehicle_year, c.selected_product_code,
      c.selected_quantity,
      q.quote_number as last_quote_number, q.total as last_quote_total,
      q.created_at as last_quote_at,
      coalesce(array_agg(m.content order by m.created_at desc) filter (where m.id is not null), '{}') as inbound_messages
    from conversations c
    left join lateral (
      select quote_number, total, created_at from quotes
      where conversation_id=c.id and cycle=c.current_cycle
      order by created_at desc limit 1
    ) q on true
    left join messages m on m.conversation_id=c.id and m.cycle=c.current_cycle
      and m.direction='inbound'
    where c.id=${conversationId}
    group by c.id, q.quote_number, q.total, q.created_at
  `;
  const inferredYear = row?.vehicle_year ?? row?.inbound_messages
    .map(extractVehicleYear).find((value): value is number => value !== null) ?? null;
  return {
    tireSize: row?.tire_size ?? null,
    vehicle: row?.vehicle ?? null,
    vehicleYear: inferredYear,
    selectedProductCode: row?.selected_product_code ?? null,
    selectedQuantity: row?.selected_quantity ?? null,
    lastQuote: row?.last_quote_number && row.last_quote_at
      ? {
          number: row.last_quote_number,
          total: Number(row.last_quote_total ?? 0),
          minutesAgo: Math.round((Date.now() - row.last_quote_at.getTime()) / 60_000),
        }
      : null,
  };
}

/** Exportada para pruebas: el bloque de sistema que aplica venta-primero sobre hechos de la base. */
export function salesFactsPrompt(facts: AgentSalesFacts, resumedFromHuman = false): string {
  const lines = [
    facts.tireSize ? `Medida confirmada: ${facts.tireSize}` : null,
    facts.vehicle ? `Vehículo mencionado: ${facts.vehicle}` : null,
    facts.vehicleYear ? `Año ya informado por el cliente: ${facts.vehicleYear}` : null,
    facts.selectedProductCode ? `Producto elegido: ${facts.selectedProductCode}` : null,
    facts.selectedQuantity ? `Cantidad ya confirmada: ${facts.selectedQuantity}` : null,
    facts.lastQuote
      ? `Cotización YA ENVIADA en este ciclo: ${facts.lastQuote.number} por $${facts.lastQuote.total.toFixed(2)}, hace ${facts.lastQuote.minutesAgo} min`
      : null,
  ].filter(Boolean);
  return [
    "HECHOS COMERCIALES CONFIRMADOS (fuente determinística):",
    ...(lines.length ? lines : ["Todavía no hay datos estructurados confirmados."]),
    "No vuelvas a preguntar un dato listado aquí. Pregunta únicamente lo que falte.",
    "Si modelo y cantidad ya están confirmados, genera la cotización inmediatamente y después pregunta si está bien; no pidas otra confirmación.",
    // Sin este freno el modelo volvía a cotizar lo mismo cuando el cliente
    // reafirmaba la medida o la cantidad, y el cliente terminaba con dos
    // números distintos para una sola compra.
    facts.lastQuote && facts.lastQuote.minutesAgo < 30
      ? `Ya cotizaste hace ${facts.lastQuote.minutesAgo} min. NO generes otra cotización por el mismo pedido: si el cliente reafirma la medida, el modelo o la cantidad, remítelo a ${facts.lastQuote.number} y avanza al cierre (ubicación, visita, asesor). Solo cotiza de nuevo si cambia el producto o la cantidad.`
      : null,
    "Si el cliente ya dio una medida, cotiza con esa medida. No pidas versión, año ni etiqueta del vehículo, y nunca condiciones la cotización a confirmar el auto.",
    // Desde el 6-ago el bot SÍ lee fotos (visión); la instrucción vieja
    // («nunca pidas fotos: no puedes leerlas») ya era falsa y le quitaba un
    // camino para conseguir la medida.
    "Si falta la medida: pídela escrita (ej. 225/65R17) o pide una foto del costado de la llanta — sí puedes leer fotos. Siempre ofreciendo algo concreto en la misma respuesta.",
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

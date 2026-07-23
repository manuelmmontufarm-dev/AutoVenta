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
import { getPhaseFlags, enabledTools } from "../services/phases.js";
import { buildSystemPrompt } from "./prompts.js";
import { buildTools, type AgentContext } from "./tools.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function runAgent(ctx: AgentContext, userText: string): Promise<string> {
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  const usedTools: string[] = [];
  // El estilo se edita en /configuracion/ia; getAiConfig cachea 30 s en memoria.
  const [aiConfig, stagePrompt, phaseFlags] = await Promise.all([
    getAiConfig(),
    getPublishedStagePrompt(ctx.conversation.stage),
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
  // Gate de fases: aunque el prompt permita una tool, solo se ofrece si su fase
  // está encendida. El backend siempre trae todas; las fases deciden qué actúa.
  const phaseTools = enabledTools(phaseFlags);
  const localTools =
    allowed.size === 0
      ? []
      : allTools.filter(
          (tool) => allowed.has(tool.function.name) && phaseTools.has(tool.function.name),
        );
  const tools: ChatCompletionTool[] = localTools.map(({ execute: _execute, ...tool }) => ({
    type: "function",
    function: tool.function,
  }));
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
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
      return text || "Disculpa, ¿me repites por favor?";
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
        return exact;
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

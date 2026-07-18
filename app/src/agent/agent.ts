/**
 * Loop del agente con OpenAI Chat Completions y function calling.
 * Ejecuta las tools locales y devuelve los resultados al modelo hasta obtener
 * una respuesta final para WhatsApp.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { config } from "../config.js";
import { getHistory } from "../services/conversations.js";
import { getAiConfig } from "../services/settings.js";
import { buildSystemPrompt } from "./prompts.js";
import { buildTools, type AgentContext } from "./tools.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function runAgent(ctx: AgentContext, userText: string): Promise<string> {
  // El estilo se edita en /configuracion/ia; getAiConfig cachea 30 s en memoria.
  const systemPrompt = buildSystemPrompt(await getAiConfig());
  const history = await getHistory(ctx.conversation.id);
  const localTools = buildTools(ctx);
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
      tools,
      tool_choice: "auto",
      max_tokens: config.openai.maxTokens,
    });
    const message = response.choices[0]?.message;
    if (!message) break;
    messages.push(message);

    if (!message.tool_calls?.length) {
      const text = message.content?.trim();
      return text || "Disculpa, ¿me repites por favor?";
    }

    for (const call of message.tool_calls) {
      if (call.type !== "function") continue;
      const tool = localTools.find((candidate) => candidate.function.name === call.function.name);
      const result = tool
        ? await tool.execute(parseArguments(call.function.arguments))
        : JSON.stringify({ error: `Tool desconocida: ${call.function.name}` });
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return "Disculpa, tuve un problema procesando tu mensaje. ¿Me lo repites por favor?";
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

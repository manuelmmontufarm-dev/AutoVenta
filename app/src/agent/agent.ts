/**
 * Loop del agente: tool runner oficial del SDK de Anthropic.
 * El runner ejecuta las tools y re-consulta al modelo hasta terminar.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { getHistory } from "../services/conversations.js";
import { buildSystemPrompt } from "./prompts.js";
import { buildTools, type AgentContext } from "./tools.js";

const anthropic = new Anthropic();
const systemPrompt = buildSystemPrompt();

export async function runAgent(ctx: AgentContext, userText: string): Promise<string> {
  const history = await getHistory(ctx.conversation.id);

  const finalMessage = await anthropic.beta.messages.toolRunner({
    model: config.anthropic.model,
    max_tokens: config.anthropic.maxTokens,
    system: [
      {
        type: "text",
        text: systemPrompt,
        // Prompt estable → cache hit en cada mensaje de cada cliente
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: buildTools(ctx),
    messages: [...history, { role: "user", content: userText }],
    max_iterations: 8,
  });

  const text = finalMessage.content
    .filter((block): block is { type: "text"; text: string } & typeof block => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text || "Disculpa, ¿me repites por favor?";
}

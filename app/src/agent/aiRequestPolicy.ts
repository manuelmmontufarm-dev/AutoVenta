export type ChatReasoningEffort = "none" | "low" | "medium";

/**
 * GPT-5.5 Chat Completions rechaza function tools con reasoning_effort distinto
 * de `none`. Las llamadas sin tools sí pueden usar razonamiento explícito.
 */
export function chatReasoningEffort(
  model: string,
  hasTools: boolean,
  rescue = false,
): ChatReasoningEffort | null {
  if (!model.startsWith("gpt-5")) return null;
  if (hasTools) return "none";
  return rescue ? "medium" : "low";
}

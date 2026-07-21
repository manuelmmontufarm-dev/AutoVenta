import OpenAI from "openai";
import { config } from "../config.js";
import type { FollowUpMessageContext } from "../domain/followUpMessages.js";
import { buildContextualFollowUpMessage } from "../domain/followUpMessages.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

function isSafeCopy(value: unknown, context: FollowUpMessageContext): value is string {
  if (typeof value !== "string" || value.trim().length < 12 || value.length > 420) return false;
  if (/\b(?:stock|disponibles?|últimas?|se agota|ahorras?|descuento|oferta)\b/i.test(value) && !context.activeDiscountAmount) return false;
  if (/%|\$\s*\d/.test(value) && !context.activeDiscountAmount) return false;
  if (/\b(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo|hoy|mañana)\b/i.test(value) && !context.customerCommitment) return false;
  return true;
}

export async function generateFollowUpCopies(
  context: FollowUpMessageContext & { summary?: string | null },
  stagePrompt?: string,
): Promise<{ first: string; second: string }> {
  const fallback = {
    first: buildContextualFollowUpMessage(context, "in_window_first"),
    second: buildContextualFollowUpMessage(context, "in_window_second"),
  };
  if (!stagePrompt?.trim() || process.env.NODE_ENV === "test" || process.env.VITEST) return fallback;
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      temperature: 0.65,
      max_tokens: 260,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Redactas seguimientos de WhatsApp para una llantera en Ecuador. Devuelve JSON con first y second. Ambos deben sonar humanos, amables, persuasivos, breves y distintos. Usa máximo 2 emojis por mensaje. No reinicies con saludo dentro de la conversación activa. Nunca inventes descuentos, precios, stock, disponibilidad, fechas, ahorro, escasez ni compromisos. Solo usa los hechos suministrados. Haz una pregunta fácil de responder." },
        { role: "user", content: JSON.stringify({ instructionForStage: stagePrompt, facts: context, deterministicFallback: fallback }) },
      ],
    });
    const parsed = JSON.parse(response.choices[0]?.message.content ?? "{}") as Record<string, unknown>;
    return {
      first: isSafeCopy(parsed.first, context) ? parsed.first.trim() : fallback.first,
      second: isSafeCopy(parsed.second, context) && parsed.second.trim() !== parsed.first?.toString().trim() ? parsed.second.trim() : fallback.second,
    };
  } catch (error) {
    console.warn("⚠️ Redacción IA de seguimiento no disponible; se usa copy determinístico:", error instanceof Error ? error.message : error);
    return fallback;
  }
}

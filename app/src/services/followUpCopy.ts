import OpenAI from "openai";
import { config } from "../config.js";
import type { FollowUpMessageContext, FollowUpMessageKind } from "../domain/followUpMessages.js";
import { buildContextualFollowUpMessage } from "../domain/followUpMessages.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

function isSafeCopy(value: unknown, context: FollowUpMessageContext): value is string {
  if (typeof value !== "string" || value.trim().length < 12 || value.length > 420) return false;
  if (/\b(?:stock|disponibles?|últimas?|se agota|ahorras?|descuento|oferta)\b/i.test(value) && !context.activeDiscountAmount) return false;
  if (/%|\$\s*\d/.test(value) && !context.activeDiscountAmount) return false;
  if (/\b(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo|hoy|mañana)\b/i.test(value) && !context.customerCommitment) return false;
  return true;
}

const KIND_INSTRUCTION: Record<FollowUpMessageKind, string> = {
  in_window_first: "Es el PRIMER recordatorio tras el silencio del cliente: retoma el hilo con naturalidad.",
  in_window_second: "Es el SEGUNDO recordatorio: cambia el ángulo respecto al primero y baja la insistencia.",
  post_window: "Es un recontacto tardío: puedes saludar por el nombre porque pasó más de un día.",
  advisor_review: "Es una nota interna para el asesor, no se envía al cliente.",
};

/**
 * Redacta UN seguimiento con IA. Se llama de forma perezosa —justo antes de
 * enviar o cuando el asesor aplasta «Generar»— para no quemar tokens en
 * mensajes que el portón de relevancia terminará cancelando.
 */
export async function generateFollowUpCopy(
  context: FollowUpMessageContext & { summary?: string | null },
  kind: FollowUpMessageKind,
  stagePrompt?: string,
): Promise<{ text: string; source: "ai" | "fallback" }> {
  const fallback = buildContextualFollowUpMessage(context, kind);
  if (!stagePrompt?.trim() || process.env.NODE_ENV === "test" || process.env.VITEST) {
    return { text: fallback, source: "fallback" };
  }
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      temperature: 0.65,
      max_tokens: 160,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Redactas seguimientos de WhatsApp para una llantera en Ecuador. Devuelve JSON con una sola clave `text`. Debe sonar humano, amable, persuasivo y breve. Usa máximo 2 emojis. No reinicies con saludo dentro de la conversación activa. Nunca inventes descuentos, precios, stock, disponibilidad, fechas, ahorro, escasez ni compromisos. Solo usa los hechos suministrados. Haz una pregunta fácil de responder." },
        { role: "user", content: JSON.stringify({ instructionForStage: stagePrompt, instructionForKind: KIND_INSTRUCTION[kind], facts: context, deterministicFallback: fallback }) },
      ],
    });
    const parsed = JSON.parse(response.choices[0]?.message.content ?? "{}") as Record<string, unknown>;
    if (isSafeCopy(parsed.text, context)) return { text: parsed.text.trim(), source: "ai" };
    return { text: fallback, source: "fallback" };
  } catch (error) {
    console.warn("⚠️ Redacción IA de seguimiento no disponible; se usa copy determinístico:", error instanceof Error ? error.message : error);
    return { text: fallback, source: "fallback" };
  }
}

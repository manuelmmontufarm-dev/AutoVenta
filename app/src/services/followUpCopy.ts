import OpenAI from "openai";
import { config } from "../config.js";
import type { FollowUpMessageContext, FollowUpMessageKind } from "../domain/followUpMessages.js";
import { buildContextualFollowUpMessage } from "../domain/followUpMessages.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * El filtro determinístico sobre lo que redactó el modelo. Se exporta para
 * poder probarlo: desde que el seguimiento de una visita agendada SÍ sale, este
 * filtro es lo único que impide que una redacción con IA vuelva a preguntar el
 * día por su cuenta.
 */
export function isSafeCopy(value: unknown, context: FollowUpMessageContext): value is string {
  if (typeof value !== "string" || value.trim().length < 12 || value.length > 420) return false;
  if (/\b(?:stock|disponibles?|últimas?|se agota|ahorras?|descuento|oferta)\b/i.test(value) && !context.activeDiscountAmount) return false;
  if (/%|\$\s*\d/.test(value) && !context.activeDiscountAmount) return false;
  // Nombrar un día solo se permite si el cliente dio uno. `visitDate` entra a
  // la condición desde el 26-ago: sin él, al seguimiento que CONFIRMA la visita
  // se le prohibía decir «el jueves» —justo la palabra que lo hace útil— y
  // caía al texto determinístico por una regla pensada para lo contrario.
  if (
    /\b(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo|hoy|mañana)\b/i.test(value) &&
    !context.customerCommitment && !context.visitDate
  ) return false;
  // Con la visita ya registrada, cualquier redacción que la vuelva a proponer
  // contradice el estado: gana el texto determinístico, que confirma. La lista
  // sale de los dos mensajes que de verdad salieron el 24-ago —«¿te ayudo a
  // dejar lista la visita?» y «¿qué día te quedaría más cómodo?»—; ninguno de
  // los dos decía «qué día» a secas, así que un filtro más estrecho los habría
  // dejado pasar igual.
  if (
    context.visitDate &&
    /qu[eé]\s+d[ií]a|cu[aá]ndo\s+(?:te|le|puede|podr|vendr|pasar)|(?:te|le)\s+queda\s+m[eá]s\s+c[oó]modo|coordinar|agendar|reservar?\b|dejar\s+lista|(?:te|le)\s+ayudo\s+a|cu[aá]l\s+local|qu[eé]\s+local/i.test(value)
  ) return false;
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
  /**
   * EL RELOJ DEL TRABAJO, NO EL DE LA PARED.
   *
   * `redactarSeguimiento` decide con esta fecha si la visita YA PASÓ («quedamos
   * el jueves y no alcanzaste a pasar») o si todavía viene («le esperamos el
   * jueves»). Hasta hoy este llamador no lo pasaba, así que el redactor caía a
   * `new Date()`: el texto se elegía con la hora en que se GENERA la copia, no
   * con la del seguimiento que se está armando. En producción las dos suelen
   * estar cerca y por eso no se notaba; en `visitaJuebes.integration` el
   * seguimiento se arma con un `now` del 24-ago para una visita del 27, y el
   * 27 de agosto de verdad el test empezó a leer «no alcanzaste a pasar».
   * Un mensaje que le dice a alguien que no vino a una cita que todavía no
   * llegó es el peor de los dos errores posibles.
   */
  now = new Date(),
): Promise<{ text: string; source: "ai" | "fallback" }> {
  const fallback = buildContextualFollowUpMessage(context, kind, now);
  if (!stagePrompt?.trim() || process.env.NODE_ENV === "test" || process.env.VITEST) {
    return { text: fallback, source: "fallback" };
  }
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      temperature: 0.65,
      max_completion_tokens: 160,
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

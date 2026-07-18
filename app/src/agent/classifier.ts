/**
 * Clasificador de etapa del funnel (post-turno, no bloquea la respuesta).
 * Modelo barato + salida JSON estricta. Doble red junto con las tools:
 * la tool notificar_vendedor es la señal precisa; esto persiste el funnel.
 */
import OpenAI from "openai";
import { config } from "../config.js";
import { setStage, type Conversation, type Stage } from "../services/conversations.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const STAGES: Stage[] = ["nuevo", "conversando", "cotizado", "alerta", "cerrado", "perdido"];

// Solo puede avanzar (o marcar perdido) — nunca retrocede de cotizado a conversando.
const ORDER: Record<Stage, number> = {
  nuevo: 0,
  conversando: 1,
  cotizado: 2,
  alerta: 3,
  cerrado: 4,
  perdido: 4,
};

export async function classifyStage(
  conversation: Conversation,
  userText: string,
  assistantText: string,
): Promise<void> {
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.classifierModel,
      max_tokens: 128,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Clasifica la etapa de esta conversación de venta de llantas.
Etapas: nuevo (recién escribe), conversando (pregunta/busca), cotizado (recibió cotización), alerta (confirmó compra o pidió humano), cerrado (compra concretada), perdido (dijo que no o abandonó explícitamente).

Devuelve únicamente JSON válido con esta forma: {"stage":"una_etapa"}.

Etapa actual: ${conversation.stage}
Cliente: ${userText}
Bot: ${assistantText}`,
        },
      ],
    });

    const text = response.choices[0]?.message.content;
    if (!text) return;
    const { stage } = JSON.parse(text) as { stage: Stage };

    if (ORDER[stage] > ORDER[conversation.stage] || stage === "perdido") {
      await setStage(conversation.id, stage);
    }
  } catch (err) {
    // El clasificador nunca debe tumbar el flujo principal
    console.error("⚠️ Clasificador de etapa falló:", err);
  }
}

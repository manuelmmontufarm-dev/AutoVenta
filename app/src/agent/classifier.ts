/**
 * Clasificador de etapa del funnel (post-turno, no bloquea la respuesta).
 * Modelo barato + salida estructurada estricta. Doble red junto con las tools:
 * la tool notificar_vendedor es la señal precisa; esto persiste el funnel.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { setStage, type Conversation, type Stage } from "../services/conversations.js";

const anthropic = new Anthropic();

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
    const response = await anthropic.messages.create({
      model: config.anthropic.classifierModel,
      max_tokens: 128,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              stage: { type: "string", enum: STAGES },
            },
            required: ["stage"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `Clasifica la etapa de esta conversación de venta de llantas.
Etapas: nuevo (recién escribe), conversando (pregunta/busca), cotizado (recibió cotización), alerta (confirmó compra o pidió humano), cerrado (compra concretada), perdido (dijo que no o abandonó explícitamente).

Etapa actual: ${conversation.stage}
Cliente: ${userText}
Bot: ${assistantText}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return;
    const { stage } = JSON.parse(textBlock.text) as { stage: Stage };

    if (ORDER[stage] > ORDER[conversation.stage] || stage === "perdido") {
      await setStage(conversation.id, stage);
    }
  } catch (err) {
    // El clasificador nunca debe tumbar el flujo principal
    console.error("⚠️ Clasificador de etapa falló:", err);
  }
}

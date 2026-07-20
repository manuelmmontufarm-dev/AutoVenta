/**
 * Clasificador de etapa del funnel (post-turno, no bloquea la respuesta).
 * Modelo barato + salida JSON estricta. Doble red junto con las tools:
 * la tool notificar_vendedor es la señal precisa; esto persiste el funnel.
 */
import OpenAI from "openai";
import { config } from "../config.js";
import { setStage, type Conversation } from "../services/conversations.js";
import { STAGE_ORDER, isStage } from "../domain/pipeline.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function classifyStage(
  conversation: Conversation,
  userText: string,
  assistantText: string,
): Promise<void> {
  if (conversation.stage === "ganado" || conversation.stage === "perdido") return;
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.classifierModel,
      max_tokens: 128,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Clasifica la SECCIÓN COMERCIAL que demuestra el último mensaje DEL CLIENTE en una conversación de venta de llantas.

Etapas:
- nuevo: saludo o consulta sin medida confirmada.
- medida_confirmada: el cliente dio o confirmó la medida/vehículo, pero todavía no reaccionó a opciones.
- seleccionando: el cliente está evaluando opciones, marcas, precios o pide comparar 2–3 modelos. Opciones y comparación son una sola sección.
- cotizacion_enviada: el cliente confirmó un único modelo y cantidad, por lo que se generó la cotización final.
- handoff_visita: el cliente confirmó compra/visita/reserva o pidió un humano.
- perdido: el cliente rechazó explícitamente continuar.

No uses "ganado": solo un humano confirma una venta realizada.
El mensaje del bot nunca mueve la etapa por sí solo. Clasifica únicamente evidencia del mensaje del cliente; si no hay evidencia nueva, conserva la etapa actual.

Devuelve únicamente JSON válido con esta forma: {"stage":"una_etapa"}.

Etapa actual: ${conversation.stage}
Cliente: ${userText}
Bot: ${assistantText}`,
        },
      ],
    });

    const text = response.choices[0]?.message.content;
    if (!text) return;
    const { stage } = JSON.parse(text) as { stage: string };
    if (!isStage(stage) || stage === "ganado") return;

    if (STAGE_ORDER[stage] > STAGE_ORDER[conversation.stage] || stage === "perdido") {
      await setStage(conversation.id, stage, {
        actor: "customer",
        reason: "Clasificación del último mensaje del cliente",
      });
    }
  } catch (err) {
    // El clasificador nunca debe tumbar el flujo principal
    console.error("⚠️ Clasificador de etapa falló:", err);
  }
}

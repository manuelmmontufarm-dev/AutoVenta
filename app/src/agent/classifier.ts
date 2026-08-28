/**
 * Clasificador de etapa del funnel (post-turno, no bloquea la respuesta).
 * Modelo barato + salida JSON estricta. Doble red junto con las tools:
 * la tool notificar_vendedor es la señal precisa; esto persiste el funnel.
 */
import OpenAI from "openai";
import { config } from "../config.js";
import { logAiRun, setStage, type Conversation } from "../services/conversations.js";
import { sql } from "../db/client.js";
import { puedeCerrarComoPerdido } from "../domain/cierrePerdido.js";
import { STAGE_ORDER, isStage, type Stage } from "../domain/pipeline.js";
import { isExplicitPurchaseConfirmation } from "../domain/salesIntent.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function classifyStage(
  conversation: Conversation,
  userText: string,
  assistantText: string,
): Promise<void> {
  const startedAt = Date.now();
  if (conversation.stage === "ganado" || conversation.stage === "perdido") return;
  if (isExplicitPurchaseConfirmation(userText)) {
    await setStage(conversation.id, "ganado", {
      actor: "customer",
      reason: "Cliente confirmó explícitamente que la compra fue realizada",
    });
    return;
  }
  // Conv 11818, 27-ago-2026: «Ya Ise el pedido aquí en Ibarra gracias» es una
  // venta perdida, pero el clasificador leyó «ya hice el pedido» y la marcó
  // como GANADA. Esta frontera ya es determinística para decidir si se puede
  // cerrar y para impedir mapas; también manda sobre el nombre de la etapa. No
  // gastamos una llamada de IA para volver a discutir un cierre rotundo.
  if (puedeCerrarComoPerdido(userText)) {
    await setStage(conversation.id, "perdido", {
      actor: "customer",
      reason: "Cliente rechazó continuar o compró en otro lugar",
    });
    return;
  }
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.classifierModel,
      max_completion_tokens: 128,
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
- seguimiento_venta: visita, ubicación, reserva, handoff o seguimiento comercial hasta concretar la venta.
- perdido: el cliente rechazó explícitamente continuar («no me interesa», «ya compré en otro lado», «no me escriba más»). QUEJARSE DEL PRECIO NO ES PERDIDO: «está carísimo», «uf qué caro», «no me alcanza» son la objeción más común de la venta y la conversación sigue viva. Pedir tiempo para pensarlo tampoco cierra nada.

Usa "ganado" únicamente si el cliente afirma en pasado que ya compró o pagó.
El mensaje del bot nunca mueve la etapa por sí solo. Clasifica únicamente evidencia del mensaje del cliente; si no hay evidencia nueva, conserva la etapa actual.

Devuelve únicamente JSON válido con esta forma: {"stage":"una_etapa"}.

Etapa actual: ${conversation.stage}
Cliente: ${userText}
Bot: ${assistantText}`,
        },
      ],
    });

    await logAiRun({
      conversationId: conversation.id,
      stage: conversation.stage,
      model: config.openai.classifierModel,
      latencyMs: Date.now() - startedAt,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cachedInputTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      reasoningTokens: response.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      tools: [],
      callType: "classifier",
      route: "post_turn_stage",
    });

    const text = response.choices[0]?.message.content;
    if (!text) return;
    const { stage } = JSON.parse(text) as { stage: string };
    if (!isStage(stage)) return;

    // La etapa se relee de la BASE, no del snapshot del inicio del turno
    // (16-ago). `index.ts` carga la conversación una vez y le pasa ESE objeto
    // al clasificador al final, pero durante el turno las tools ya movieron la
    // etapa: generar_cotizacion deja `cotizacion_enviada`, local_mas_cercano y
    // notificar_vendedor dejan `seguimiento_venta`. Comparando contra el valor
    // viejo, la guarda de monotonía se evaluaba contra una referencia caduca y
    // el clasificador podía RETROCEDER el funnel — devolver a «seleccionando»
    // una conversación que ya tenía cotización enviada, con su evento de
    // transición y todo.
    const [fila] = await sql<{ stage: Stage }[]>`
      select stage from conversations where id = ${conversation.id}
    `;
    const etapaActual = fila?.stage ?? conversation.stage;
    // CERRAR COMO PERDIDA BORRA LA CONVERSACIÓN, así que se exige evidencia y
    // no basta con que el modelo lo crea. El 27-ago (conv 3) un «chuta ta
    // carisisimo oe» sobre una cotización de $821.53 cerró la venta, y el
    // mensaje siguiente la reabrió en un ciclo nuevo sin medida, sin producto y
    // sin cotización: el bot terminó pidiendo la medida que ya tenía. Ver
    // `domain/cierrePerdido.ts`.
    if (stage === "perdido" && !puedeCerrarComoPerdido(userText)) {
      console.log(
        `🛟 Cierre como perdida frenado en la conv ${conversation.id}: «${userText.slice(0, 60)}» no es un rechazo`,
      );
      return;
    }
    if (STAGE_ORDER[stage] > STAGE_ORDER[etapaActual] || stage === "perdido") {
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

/**
 * Clasificador de etapa del funnel (post-turno, no bloquea la respuesta).
 * Modelo barato + salida JSON estricta. Doble red junto con las tools:
 * la tool notificar_vendedor es la señal precisa; esto persiste el funnel.
 */
import OpenAI from "openai";
import { nuevoClienteOpenAI } from "./openaiCliente.js";
import { completarChat } from "./chat.js";
import { config } from "../config.js";
import { logAiRun, setStage, type Conversation } from "../services/conversations.js";
import { sql } from "../db/client.js";
import { puedeCerrarComoPerdido } from "../domain/cierrePerdido.js";
import { STAGE_ORDER, isStage, type Stage } from "../domain/pipeline.js";
import { isExplicitPurchaseConfirmation, traePedidoNuevo } from "../domain/salesIntent.js";
import { marcarCompraPorConfirmar } from "../services/registroDeVentas.js";

const openai = nuevoClienteOpenAI();

export async function classifyStage(
  conversation: Conversation,
  userText: string,
  assistantText: string,
): Promise<void> {
  const startedAt = Date.now();
  if (conversation.stage === "ganado" || conversation.stage === "perdido") return;
  // «YA COMPRÉ» NO ES «GANADO» (21-nov-2026, conv 293 de Competimotor:
  // «Gracias ya compré.» sin una cotización firme; casi seguro compró en otro
  // lado). «Ganado» es el asesor confirmando que compró ACÁ, con factura y
  // monto. El bot solo deja el ticket «por confirmar» en la lista de
  // pendientes y el asesor decide ganado o perdido. Ni la regla ni el modelo
  // cierran como ganado solos.
  if (isExplicitPurchaseConfirmation(userText)) {
    await marcarCompraPorConfirmar(conversation.id, userText);
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
    const response = await completarChat(openai, {
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

Usa "ganado" únicamente si el cliente afirma en pasado que ya compró o pagó (no cierra el ticket: queda por confirmar para el asesor).
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
    // «YA COMPRÉ X, AHORA NECESITO Y» (chat 462, 15-oct): el modelo lee la
    // compra pasada igual que la leía la regla. Con un pedido nuevo en el mismo
    // mensaje la venta de hoy sigue viva: cerrar como ganado borra el ciclo y el
    // mensaje siguiente saluda de cero sobre la medida vieja.
    if (stage === "ganado" && traePedidoNuevo(userText)) {
      console.log(
        `🛟 Cierre como ganado frenado en la conv ${conversation.id}: «${userText.slice(0, 60)}» trae un pedido nuevo`,
      );
      return;
    }
    // El modelo tampoco cierra como ganado: queda por confirmar (ver arriba).
    if (stage === "ganado") {
      await marcarCompraPorConfirmar(conversation.id, userText);
      return;
    }
    // «COTIZACIÓN ENVIADA» ES UN HECHO, NO UNA LECTURA (simulador Competimotor,
    // 18-nov, CM27): tras «ok esa, 4» el modelo leyó «confirmó un único modelo y
    // cantidad» y dejó la etapa en cotizacion_enviada con CERO cotizaciones en
    // el ciclo. Esa etapa solo la pone `generar_cotizacion` después de crear la
    // cotización; acá se acepta únicamente si la cotización existe.
    if (stage === "cotizacion_enviada") {
      const [cotizacion] = await sql<{ id: number }[]>`
        select q.id from quotes q join conversations c on c.id = q.conversation_id
        where q.conversation_id = ${conversation.id} and q.cycle = c.current_cycle
        limit 1
      `;
      if (!cotizacion) {
        console.log(
          `🛟 Etapa cotizacion_enviada frenada en la conv ${conversation.id}: no hay cotización en el ciclo`,
        );
        return;
      }
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

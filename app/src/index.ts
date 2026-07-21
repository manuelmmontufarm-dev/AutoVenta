/**
 * AutoVenta — bot de ventas de llantas por WhatsApp.
 * Punto de entrada: conecta webhook → pipeline → agente → WhatsApp.
 */
import { config } from "./config.js";
import { createServer } from "./server/webhook.js";
import { wa, sendCustomerText, showTyping } from "./wa/client.js";
import { InboundPipeline } from "./pipeline/inbound.js";
import { runAgent } from "./agent/agent.js";
import { classifyStage } from "./agent/classifier.js";
import { startCatalogSync } from "./services/catalog.js";
import { ensureSchema } from "./db/schema.js";
import {
  appendMessage,
  getOrCreateConversation,
  isBotPaused,
  logFunnelEvent,
  recordMessageStatus,
  setStage,
  updateConversationFacts,
} from "./services/conversations.js";
import { emitLiveEvent } from "./services/liveEvents.js";
import { extractTireSizes, formatTireSize } from "./domain/tireSize.js";
import { getHubMetrics } from "./services/hubData.js";
import {
  handleInboundFollowUpState,
  scheduleConversationFollowUps,
} from "./services/followUps.js";

const pipeline = new InboundPipeline(async ({ from, name, text, waMessageIds, receivedAt }) => {
  const conversation = await getOrCreateConversation(from, name);

  // Idempotencia definitiva: si TODOS los mensajes ya estaban en DB, es un retry.
  let anyNew = false;
  for (const waId of waMessageIds) {
    if (await appendMessage(conversation.id, "user", text, waId, { occurredAt: receivedAt })) anyNew = true;
    break; // el texto ya viene agrupado; un solo registro con el primer id
  }
  if (!anyNew) return;
  const inboundSafety = await handleInboundFollowUpState(conversation.id, text);
  const parsedSize = extractTireSizes(text)[0];
  if (parsedSize) {
    await updateConversationFacts(conversation.id, { tireSize: formatTireSize(parsedSize) });
  }
  emitLiveEvent("message", conversation.id);
  emitLiveEvent("sync", conversation.id);

  // Opt-out o molestia detienen el bot antes de typing, IA o cualquier envío.
  if (inboundSafety.optedOut || inboundSafety.negative || inboundSafety.requestedHuman) return;

  if (conversation.stage === "nuevo") {
    await logFunnelEvent(conversation.id, "primer_mensaje");
    // La tarjeta no avanza porque el bot respondió: avanza únicamente cuando
    // el contenido del cliente demuestra una nueva sección comercial.
    await logFunnelEvent(conversation.id, "cliente_respondio");
  }

  // Handoff: si el dueño está atendiendo este chat a mano, el bot calla — pero
  // lo del cliente ya quedó guardado arriba para que el dueño lo lea en /mensajes.
  if (await isBotPaused(conversation)) return;

  // Recién aquí se sabe que el bot va a responder: "escribiendo…" honesto.
  void showTyping(waMessageIds[waMessageIds.length - 1]).catch(() => {});

  const reply = await runAgent(
    { conversation, customerPhone: from, customerName: name, currentUserText: text },
    text,
  );

  const sentId = await sendCustomerText(conversation.id, from, reply);
  await appendMessage(conversation.id, "assistant", reply, sentId, {
    authorKind: "bot",
    status: "sent",
  });
  emitLiveEvent("message", conversation.id);
  emitLiveEvent("sync", conversation.id);

  // Post-turno: primero consolida la etapa y luego agenda contra ese estado.
  void classifyStage(conversation, text, reply)
    .then(() => scheduleConversationFollowUps(conversation.id))
    .catch((error) => console.error("⚠️ No se pudo programar seguimiento:", error));
});

wa.on.message = async ({ from, name, message, received }) => {
  // Solo marca como leído. El "escribiendo…" se muestra en el pipeline cuando
  // el bot de verdad va a responder (pausado = ni typing ni respuesta).
  void received().catch(() => {});

  const receivedAt = new Date(Number(message.timestamp) * 1000);
  switch (message.type) {
    case "text":
      pipeline.push(from, message.id, message.text.body, name, receivedAt);
      break;
    case "location":
      pipeline.push(
        from,
        message.id,
        `[El cliente compartió su ubicación: lat ${message.location.latitude}, lng ${message.location.longitude}]`,
        name,
        receivedAt,
      );
      break;
    case "image":
      // Fase 2: bajar la imagen y pasarla a la visión del modelo (leer medida de la foto)
      pipeline.push(
        from,
        message.id,
        "[El cliente envió una foto que todavía no puedes ver]",
        name,
        receivedAt,
      );
      break;
    case "audio":
      pipeline.push(
        from,
        message.id,
        "[El cliente envió un audio que todavía no puedes escuchar]",
        name,
        receivedAt,
      );
      break;
    default:
      // stickers, reacciones, etc. — se ignoran
      break;
  }
};

wa.on.status = async ({ status, id, timestamp, error, conversation, pricing }) => {
  const conversationId = await recordMessageStatus(id, status, {
    error: error ?? null,
    conversation: conversation ?? null,
    pricing: pricing ?? null,
  }, new Date(Number(timestamp) * 1000));
  emitLiveEvent("status", conversationId ?? undefined);
  if (conversationId) emitLiveEvent("message", conversationId);
};

// Aplica el esquema al arrancar (idempotente) → deploy sin paso manual de migración.
await ensureSchema();
await getHubMetrics(7);
console.log("✅ Esquema de base de datos listo");

startCatalogSync();

const app = createServer();
app.listen(config.port, () => {
  console.log(`🚀 AutoVenta escuchando en :${config.port}`);
});

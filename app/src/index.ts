/**
 * AutoVenta — bot de ventas de llantas por WhatsApp.
 * Punto de entrada: conecta webhook → pipeline → agente → WhatsApp.
 */
import { config } from "./config.js";
import { createServer } from "./server/webhook.js";
import { initWa, setWaHandlers, sendText, showTyping } from "./wa/client.js";
import { getPublicChannelConfig } from "./services/channel.js";
import { getPhaseFlags, activeLevel } from "./services/phases.js";
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

const pipeline = new InboundPipeline(async ({ from, name, text, waMessageIds }) => {
  const conversation = await getOrCreateConversation(from, name);

  // Idempotencia definitiva: si TODOS los mensajes ya estaban en DB, es un retry.
  let anyNew = false;
  for (const waId of waMessageIds) {
    if (await appendMessage(conversation.id, "user", text, waId)) anyNew = true;
    break; // el texto ya viene agrupado; un solo registro con el primer id
  }
  if (!anyNew) return;
  const parsedSize = extractTireSizes(text)[0];
  if (parsedSize) {
    await updateConversationFacts(conversation.id, { tireSize: formatTireSize(parsedSize) });
  }
  emitLiveEvent("message", conversation.id);
  emitLiveEvent("sync", conversation.id);

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

  // Envío con red de seguridad: si Meta rechaza, la respuesta queda guardada
  // como "failed" y visible en el hub — nunca se pierde en silencio.
  try {
    const sentId = await sendText(from, reply);
    await appendMessage(conversation.id, "assistant", reply, sentId, {
      authorKind: "bot",
      status: "sent",
    });
  } catch (sendError) {
    await appendMessage(conversation.id, "assistant", reply, undefined, {
      authorKind: "bot",
      status: "failed",
    });
    console.error(`❌ No se pudo enviar la respuesta a ${from}:`, sendError);
  }
  emitLiveEvent("message", conversation.id);
  emitLiveEvent("sync", conversation.id);

  // Post-turno, sin bloquear: clasifica etapa para el dashboard.
  void classifyStage(conversation, text, reply);
});

// Handlers del webhook: se registran una vez y se re-aplican solos cada vez que
// la instancia de WhatsApp se reconstruye (token pegado desde el panel).
setWaHandlers({
  message: async ({ from, name, message, received }) => {
    // Solo marca como leído. El "escribiendo…" se muestra en el pipeline cuando
    // el bot de verdad va a responder (pausado = ni typing ni respuesta).
    void received().catch(() => {});

    switch (message.type) {
      case "text":
        pipeline.push(from, message.id, message.text.body, name);
        break;
      case "location":
        pipeline.push(
          from,
          message.id,
          `[El cliente compartió su ubicación: lat ${message.location.latitude}, lng ${message.location.longitude}]`,
          name,
        );
        break;
      case "image":
        // Fase 2: bajar la imagen y pasarla a la visión del modelo (leer medida de la foto)
        pipeline.push(
          from,
          message.id,
          "[El cliente envió una foto que todavía no puedes ver]",
          name,
        );
        break;
      case "audio":
        pipeline.push(
          from,
          message.id,
          "[El cliente envió un audio que todavía no puedes escuchar]",
          name,
        );
        break;
      default:
        // stickers, reacciones, etc. — se ignoran
        break;
    }
  },
  status: async ({ status, id, error, conversation, pricing }) => {
    const conversationId = await recordMessageStatus(id, status, {
      error: error ?? null,
      conversation: conversation ?? null,
      pricing: pricing ?? null,
    });
    emitLiveEvent("status", conversationId ?? undefined);
    if (conversationId) emitLiveEvent("message", conversationId);
  },
});

// Aplica el esquema al arrancar (idempotente) → deploy sin paso manual de migración.
await ensureSchema();
await getHubMetrics(7);
console.log("✅ Esquema de base de datos listo");

// El canal se resuelve desde DB (settings) con respaldo del entorno. Sin
// credenciales completas, el webhook queda inactivo y se activa en caliente al
// guardar el canal desde el panel (PUT /api/channel → reloadWa).
const wa = await initWa();
const channel = await getPublicChannelConfig();
const phases = await getPhaseFlags();
console.log(
  wa
    ? `✅ Canal de WhatsApp listo (token: ${channel.tokenSource})`
    : "⚠️  Canal de WhatsApp sin configurar — el webhook está inactivo hasta llenarlo desde el panel.",
);
console.log(`✅ Fase activa: ${activeLevel(phases)} (fase2=${phases.fase2}, fase3=${phases.fase3})`);

startCatalogSync();

const app = createServer();
app.listen(config.port, () => {
  console.log(`🚀 AutoVenta escuchando en :${config.port}`);
});

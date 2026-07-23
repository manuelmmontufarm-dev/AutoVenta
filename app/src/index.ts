/**
 * AutoVenta — bot de ventas de llantas por WhatsApp.
 * Punto de entrada: conecta webhook → pipeline → agente → WhatsApp.
 */
import { config } from "./config.js";
import { createServer } from "./server/webhook.js";
import { initWa, setWaHandlers, sendCustomerText, showTyping } from "./wa/client.js";
import { getPublicChannelConfig } from "./services/channel.js";
import { getPhaseFlags, activeLevel } from "./services/phases.js";
import { InboundPipeline } from "./pipeline/inbound.js";
import { runAgent } from "./agent/agent.js";
import type { AgentContext } from "./agent/tools.js";
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
import { extractExplicitQuantity, extractVehicleYear } from "./domain/salesIntent.js";
import { getHubMetrics } from "./services/hubData.js";
import {
  handleInboundFollowUpState,
  scheduleConversationFollowUps,
} from "./services/followUps.js";
import { markDiscountNoticeSent } from "./services/discountOffers.js";
import { extractCustomerCommitment } from "./domain/customerCommitment.js";
import { flagRepetitiveConversation } from "./services/conversationQuality.js";
import { notifyPendingHumanRequests } from "./services/advisorNotifications.js";

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
  const parsedQuantity = extractExplicitQuantity(text);
  const parsedVehicleYear = extractVehicleYear(text);
  const commitment = extractCustomerCommitment(text, receivedAt);
  await updateConversationFacts(conversation.id, {
    ...(parsedSize ? { tireSize: formatTireSize(parsedSize) } : {}),
    ...(parsedQuantity ? { selectedQuantity: parsedQuantity } : {}),
    ...(parsedVehicleYear ? { vehicleYear: parsedVehicleYear } : {}),
    ...(commitment ? { customerCommitment: commitment.text, visitDate: commitment.visitDate } : {}),
  });
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

  const agentContext: AgentContext = { conversation, customerPhone: from, customerName: name,
    currentUserText: text };
  const reply = await runAgent(agentContext, text);
  await flagRepetitiveConversation(conversation.id, reply);

  // Envío con red de seguridad: si Meta rechaza, la respuesta queda guardada
  // como "failed" y visible en el hub — nunca se pierde en silencio.
  try {
    const sentId = await sendCustomerText(conversation.id, from, reply);
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
  if (agentContext.discountNotice) {
    await markDiscountNoticeSent(agentContext.discountNotice.source, agentContext.discountNotice.id);
  }
  emitLiveEvent("message", conversation.id);
  emitLiveEvent("sync", conversation.id);

  // Post-turno: primero consolida la etapa y luego agenda contra ese estado.
  // Los seguimientos (Oportunidades) solo se agendan si la Fase 4 está activa.
  void classifyStage(conversation, text, reply)
    .then(async () => {
      const ph = await getPhaseFlags();
      if (ph.fase4) await scheduleConversationFollowUps(conversation.id);
    })
    .catch((error) => console.error("⚠️ No se pudo programar seguimiento:", error));
});

// Handlers del webhook: se registran una vez y se re-aplican solos cada vez que
// la instancia de WhatsApp se reconstruye (token pegado desde el panel).
setWaHandlers({
  message: async ({ from, name, message, received }) => {
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
  },
  status: async ({ status, id, timestamp, error, conversation, pricing }) => {
    const conversationId = await recordMessageStatus(id, status, {
      error: error ?? null,
      conversation: conversation ?? null,
      pricing: pricing ?? null,
    }, new Date(Number(timestamp) * 1000));
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
console.log(
  `✅ Fase activa: ${activeLevel(phases)} (fase2=${phases.fase2}, fase3=${phases.fase3}, fase4=${phases.fase4})`,
);

startCatalogSync();

const app = createServer();
app.listen(config.port, () => {
  console.log(`🚀 AutoVenta escuchando en :${config.port}`);
  void notifyPendingHumanRequests()
    .then((sent) => {
      if (sent) console.log(`📲 ${sent} solicitud(es) humana(s) pendiente(s) notificadas al asesor`);
    })
    .catch((error) => console.error("⚠️ No se pudieron recuperar avisos pendientes al asesor:", error));
});

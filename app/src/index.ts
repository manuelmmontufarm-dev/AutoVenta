/**
 * AutoVenta — bot de ventas de llantas por WhatsApp.
 * Punto de entrada: conecta webhook → pipeline → agente → WhatsApp.
 */
import { config } from "./config.js";
import { createServer } from "./server/webhook.js";
import { wa, sendText, showTyping } from "./wa/client.js";
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
  setStage,
} from "./services/conversations.js";

const pipeline = new InboundPipeline(async ({ from, name, text, waMessageIds }) => {
  const conversation = await getOrCreateConversation(from, name);

  // Idempotencia definitiva: si TODOS los mensajes ya estaban en DB, es un retry.
  let anyNew = false;
  for (const waId of waMessageIds) {
    if (await appendMessage(conversation.id, "user", text, waId)) anyNew = true;
    break; // el texto ya viene agrupado; un solo registro con el primer id
  }
  if (!anyNew) return;

  if (conversation.stage === "nuevo") {
    await logFunnelEvent(conversation.id, "primer_mensaje");
    await setStage(conversation.id, "conversando");
  }

  // Handoff: si el dueño está atendiendo este chat a mano, el bot calla — pero
  // lo del cliente ya quedó guardado arriba para que el dueño lo lea en /mensajes.
  if (await isBotPaused(conversation)) return;

  // Recién aquí se sabe que el bot va a responder: "escribiendo…" honesto.
  void showTyping(waMessageIds[waMessageIds.length - 1]).catch(() => {});

  const reply = await runAgent(
    { conversation, customerPhone: from, customerName: name },
    text,
  );

  await sendText(from, reply);
  await appendMessage(conversation.id, "assistant", reply);

  // Post-turno, sin bloquear: clasifica etapa para el dashboard.
  void classifyStage(conversation, text, reply);
});

wa.on.message = async ({ from, name, message, received }) => {
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
};

// Aplica el esquema al arrancar (idempotente) → deploy sin paso manual de migración.
await ensureSchema();
console.log("✅ Esquema de base de datos listo");

startCatalogSync();

const app = createServer();
app.listen(config.port, () => {
  console.log(`🚀 AutoVenta escuchando en :${config.port}`);
});

/**
 * AutoVenta — bot de ventas de llantas por WhatsApp.
 * Punto de entrada: conecta webhook → pipeline → agente → WhatsApp.
 */
import { config } from "./config.js";
import { createServer } from "./server/webhook.js";
import { initWa, setWaHandlers, sendCustomerText, showTyping, downloadMedia } from "./wa/client.js";
import { describirFotoDeLlanta } from "./services/vision.js";
import { transcribirAudio } from "./services/transcripcion.js";
import { conResumenDeLinks } from "./services/linkPreview.js";
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
  lastOutboundText,
  logFunnelEvent,
  recordMessageStatus,
  setStage,
  updateConversationFacts,
} from "./services/conversations.js";
import { emitLiveEvent } from "./services/liveEvents.js";
import { isBotActive } from "./services/botPower.js";
import {
  extractFlotationSizes, extractTireSizes, formatFlotationSize, formatTireSize,
} from "./domain/tireSize.js";
import { extractExplicitQuantity, extractVehicleYear } from "./domain/salesIntent.js";
import { getHubMetrics } from "./services/hubData.js";
import {
  handleInboundFollowUpState,
  scheduleConversationFollowUps,
} from "./services/followUps.js";
import { markDiscountNoticeSent } from "./services/discountOffers.js";
import { extractCustomerCommitment, preguntamosElDia } from "./domain/customerCommitment.js";
import { avisarVisitaComprometida } from "./services/visitAlerts.js";
import { splitBlocks } from "./services/quoteMessages.js";
import { flagRepetitiveConversation } from "./services/conversationQuality.js";
import { applyOutboundGuard } from "./services/outboundGuard.js";
import { notifyPendingHumanRequests } from "./services/advisorNotifications.js";
import { startEmbeddedFollowUpWorker } from "./workers/embeddedFollowUpWorker.js";

/** Pausa entre bloques: suficiente para que se lean como mensajes seguidos y no como spam. */
const PAUSA_ENTRE_BLOQUES_MS = 900;

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pipeline = new InboundPipeline(async ({ from, name, text, waMessageIds, receivedAt }) => {
  // El mensaje ya quedó guardado en recibirMensaje(), antes de responderle 200
  // a Meta. Aquí solo se elabora la respuesta sobre el texto ya agrupado.
  const conversation = await getOrCreateConversation(from, name);
  const inboundSafety = await handleInboundFollowUpState(conversation.id, text);
  // La medida puede venir métrica (205/55R16) o en pulgadas (30x9.5R15). Sin
  // esta segunda, el bot no registraba nada y terminaba diciendo que no había.
  const parsedSize = extractTireSizes(text)[0];
  const parsedFlotation = parsedSize ? null : extractFlotationSizes(text)[0];
  const parsedQuantity = extractExplicitQuantity(text);
  const parsedVehicleYear = extractVehicleYear(text);
  // El día de la visita llega casi siempre como respuesta seca ("el sábado")
  // a la pregunta que el bot hace tras cotizar. Sin mirar lo que preguntamos
  // antes, esa respuesta no era un compromiso para nadie.
  const commitment = extractCustomerCommitment(text, receivedAt, {
    respondiendoAlDia: preguntamosElDia(await lastOutboundText(conversation.id)),
  });
  await updateConversationFacts(conversation.id, {
    ...(parsedSize ? { tireSize: formatTireSize(parsedSize) } : {}),
    ...(parsedFlotation ? { tireSize: formatFlotationSize(parsedFlotation) } : {}),
    ...(parsedQuantity ? { selectedQuantity: parsedQuantity } : {}),
    ...(parsedVehicleYear ? { vehicleYear: parsedVehicleYear } : {}),
    ...(commitment ? { customerCommitment: commitment.text, visitDate: commitment.visitDate } : {}),
  });
  // El aviso va aunque el bot esté apagado: apagado significa que contesta una
  // persona, y esa persona es justo la que tiene que enterarse de que este
  // cliente dijo cuándo viene. En segundo plano para no demorar la respuesta.
  if (commitment) {
    void avisarVisitaComprometida({
      conversationId: conversation.id,
      cycle: conversation.current_cycle,
      texto: commitment.text,
      visitDate: commitment.visitDate,
    }).catch((error) => console.error("⚠️ No se pudo avisar la visita comprometida:", error));
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

  // Interruptor global (Ajustes → apagar el bot). Va DESPUÉS de guardar el
  // mensaje: apagado el bot no contesta, pero el dueño sigue viendo todo lo que
  // le escriben y puede responder a mano desde el panel.
  if (!(await isBotActive())) return;

  // Handoff: si el dueño está atendiendo este chat a mano, el bot calla — pero
  // lo del cliente ya quedó guardado arriba para que el dueño lo lea en /mensajes.
  if (await isBotPaused(conversation)) return;

  // Recién aquí se sabe que el bot va a responder: "escribiendo…" honesto.
  void showTyping(waMessageIds[waMessageIds.length - 1]).catch(() => {});

  // Los links se abren AQUÍ, no en el webhook.
  //
  // Hacerlo antes de pipeline.push() invertía el orden de la conversación: el
  // debounce es de 5 s y un link se lleva hasta 10, así que el «¿cuánto cuesta?»
  // que el cliente escribe un segundo después entraba al buffer primero, se
  // respondía solo, y el mensaje del link llegaba tarde y provocaba un segundo
  // turno. Aquí el push ya ocurrió con el texto crudo (orden y agrupación
  // intactos) y la espera cae sobre el turno, después del showTyping — el
  // cliente ve "escribiendo…" durante toda la lectura del link.
  //
  // Efecto colateral asumido: en la base queda lo que el cliente escribió de
  // verdad (la URL cruda), no el resumen. El dato que vende —la medida— sí
  // persiste, porque se guarda en los HECHOS de la conversación aquí abajo.
  const textoConLinks = await conResumenDeLinks(text, from);
  if (textoConLinks !== text && !parsedSize && !parsedFlotation) {
    const medidaDelLink = extractTireSizes(textoConLinks)[0];
    const flotacionDelLink = medidaDelLink ? null : extractFlotationSizes(textoConLinks)[0];
    if (medidaDelLink || flotacionDelLink) {
      await updateConversationFacts(conversation.id, {
        tireSize: medidaDelLink
          ? formatTireSize(medidaDelLink)
          : formatFlotationSize(flotacionDelLink!),
      });
    }
  }

  const agentContext: AgentContext = { conversation, customerPhone: from, customerName: name,
    currentUserText: textoConLinks };
  const reply = await runAgent(agentContext, textoConLinks);
  await flagRepetitiveConversation(conversation.id, reply);

  // Guardián de salida (5-ago): determinístico, corre sobre TODO lo que el bot
  // va a decir. Bloquea pedir fotos, la disculpa repetida, el mensaje calcado y
  // el saludo a mitad de conversación — y alerta al asesor. null = no enviar.
  const vetted = await applyOutboundGuard(conversation.id, reply);
  if (!vetted.text) return;

  // Varios mensajes cortos en vez de uno largo: es como escribe el vendedor
  // humano de los chats que el cliente puso de ejemplo. Los bloques los separa
  // el agente con '---'; sin separadores esto envía un solo mensaje, igual que antes.
  //
  // Envío con red de seguridad: si Meta rechaza, la respuesta queda guardada
  // como "failed" y visible en el hub — nunca se pierde en silencio.
  const bloques = splitBlocks(vetted.text);
  for (const [indice, bloque] of bloques.entries()) {
    if (indice > 0) await esperar(PAUSA_ENTRE_BLOQUES_MS);
    try {
      const sentId = await sendCustomerText(conversation.id, from, bloque);
      await appendMessage(conversation.id, "assistant", bloque, sentId, {
        authorKind: "bot",
        status: "sent",
      });
    } catch (sendError) {
      console.error(`❌ No se pudo enviar la respuesta a ${from}:`, sendError);
      // Si un bloque no sale, los siguientes tampoco van a salir (ventana
      // cerrada, token vencido…). Se guardan todos como fallidos para que el
      // hub muestre la respuesta completa que el cliente nunca recibió.
      for (const restante of bloques.slice(indice)) {
        await appendMessage(conversation.id, "assistant", restante, undefined, {
          authorKind: "bot",
          status: "failed",
        });
      }
      break;
    }
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
/**
 * Guarda el mensaje del cliente ANTES de que el webhook responda 200, y recién
 * después lo pasa al agrupador.
 *
 * El orden importa: Meta entrega at-least-once y solo reintenta lo que no
 * recibió 200. Si se responde 200 con el mensaje todavía en un buffer en
 * memoria, un reinicio lo borra y Meta nunca lo reenvía — el cliente escribió y
 * nadie se entera. Persistir primero también le da a cada mensaje su propia
 * fila con su wa_message_id, que es lo que permite que la deduplicación
 * definitiva sea la de la base (unique) y no un Map que muere con el proceso.
 */
async function recibirMensaje(
  from: string,
  name: string | undefined,
  texto: string,
  waMessageId: string,
  receivedAt: Date,
): Promise<void> {
  const conversation = await getOrCreateConversation(from, name);
  const esNuevo = await appendMessage(conversation.id, "user", texto, waMessageId, { occurredAt: receivedAt });
  if (!esNuevo) return; // reentrega de Meta: ya estaba guardado
  emitLiveEvent("message", conversation.id);
  pipeline.push(from, waMessageId, texto, name, receivedAt);
}

setWaHandlers({
  message: async ({ from, name, message, received }) => {
    // Solo marca como leído. El "escribiendo…" se muestra en el pipeline cuando
    // el bot de verdad va a responder (pausado = ni typing ni respuesta).
    void received().catch(() => {});

    const receivedAt = new Date(Number(message.timestamp) * 1000);
    switch (message.type) {
      case "text":
        // El texto entra TAL CUAL y sin esperar a nada: el agrupador (debounce)
        // necesita ver los mensajes en el orden en que llegaron. Los links que
        // traiga se abren después, dentro del pipeline, con el "escribiendo…" ya
        // encendido.
        await recibirMensaje(from, name, message.text.body, message.id, receivedAt);
        break;
      case "location":
        await recibirMensaje(
          from,
          name,
          `[El cliente compartió su ubicación: lat ${message.location.latitude}, lng ${message.location.longitude}]`,
          message.id,
          receivedAt,
        );
        break;
      case "image": {
        // La foto se transcribe y entra como texto normal: el debounce la junta
        // con lo que el cliente escriba alrededor y extractTireSizes le saca la
        // medida sola. El ack a Meta ya salió arriba (received()), así que el
        // await de la descarga+visión no arriesga un reintento del webhook.
        const media = await downloadMedia(message.image.id);
        const leido = media ? await describirFotoDeLlanta(media.bytes, media.mimeType) : null;
        // El caption es lo que el cliente ESCRIBIÓ junto a la foto («Esa llanta
        // mi amigo, a como me da») — perderlo era perder la pregunta.
        const caption = message.image.caption?.trim();
        const cuerpo = leido
          ? `[El cliente mandó una foto. Se lee: ${leido}]`
          : "[El cliente mandó una foto que no se pudo leer. Pídele con amabilidad que escriba lo que dice el costado de la llanta.]";
        await recibirMensaje(
          from,
          name,
          caption ? `${cuerpo}\n${caption}` : cuerpo,
          message.id,
          receivedAt,
        );
        break;
      }
      case "audio": {
        // La nota de voz se transcribe y entra como texto normal: el debounce la
        // junta con lo que el cliente escriba alrededor y extractTireSizes le
        // saca la medida sola. El ack a Meta ya salió arriba (received()), así
        // que el await de la descarga+transcripción no arriesga un reintento del
        // webhook.
        const media = await downloadMedia(message.audio.id);
        const dicho = media ? await transcribirAudio(media.bytes, media.mimeType) : null;
        const cuerpo = dicho
          ? `[El cliente mandó un audio. Dice: ${dicho}]`
          : "[El cliente mandó un audio que no se pudo escuchar. Pídele con amabilidad que escriba su consulta o mande la medida escrita.]";
        await recibirMensaje(from, name, cuerpo, message.id, receivedAt);
        break;
      }
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

// Seguimientos: se levantan aquí salvo que haya un servicio dedicado
// (FOLLOW_UP_WORKER=externo). Sin esto, un deploy sin servicio worker deja los
// seguimientos apagados en silencio.
startEmbeddedFollowUpWorker();

const app = createServer();
app.listen(config.port, () => {
  console.log(`🚀 AutoVenta escuchando en :${config.port}`);
  void notifyPendingHumanRequests()
    .then((sent) => {
      if (sent) console.log(`📲 ${sent} solicitud(es) humana(s) pendiente(s) notificadas al asesor`);
    })
    .catch((error) => console.error("⚠️ No se pudieron recuperar avisos pendientes al asesor:", error));
});

/**
 * Adapter de WhatsApp Cloud API.
 * Reusa: whatsapp-api-js (Secreto31126, MIT) — cliente + verificación de firma
 * del webhook + middleware de Express incluidos.
 */
import { WhatsAppAPI } from "whatsapp-api-js/middleware/express";
import {
  BodyComponent,
  BodyParameter,
  Document,
  Image,
  Template,
  Text,
} from "whatsapp-api-js/messages";
import { config } from "../config.js";
import { assertConversationOutbound } from "../services/whatsappPolicy.js";

export const wa = new WhatsAppAPI({
  token: config.whatsapp.token,
  appSecret: config.whatsapp.appSecret,
  webhookVerifyToken: config.whatsapp.verifyToken,
});

const phoneId = config.whatsapp.phoneId;

export async function sendCustomerText(
  conversationId: number,
  to: string,
  body: string,
  actor: "bot" | "owner" | "worker" = "bot",
): Promise<string | undefined> {
  await assertConversationOutbound({ conversationId, contentType: "text", actor });
  const response = await wa.sendMessage(phoneId, to, new Text(body));
  return messageIdOrThrow(response, "el mensaje");
}

/** Marca leído + "escribiendo…". Llamar solo cuando el bot SÍ va a responder. */
export async function showTyping(messageId: string): Promise<void> {
  await wa.markAsRead(phoneId, messageId, "text");
}

/**
 * Extrae el id del mensaje aceptado por Meta, o lanza con el error real.
 * Antes un envío rechazado pasaba silencioso: el bot creía haber mandado el
 * PDF y el cliente nunca lo recibía (pasó en el demo del 20-jul).
 */
function messageIdOrThrow(response: unknown, what: string): string | undefined {
  if (response instanceof Response) return undefined;
  if (response && typeof response === "object" && "messages" in response) {
    const messages = (response as { messages?: { id?: string }[] }).messages;
    return messages?.[0]?.id;
  }
  const error = (response as { error?: { message?: string } })?.error;
  throw new Error(`WhatsApp rechazó ${what}: ${error?.message ?? JSON.stringify(response)}`);
}

/**
 * Sube media a Meta y devuelve el media_id. Reintenta 1 vez: el upload es el
 * paso más frágil de la Graph API y su fallo dejaba al cliente sin cotización.
 */
async function uploadMedia(buf: Buffer, mime: string, filename: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);
      const uploaded = (await wa.uploadMedia(phoneId, form)) as { id?: string };
      if (uploaded?.id) return uploaded.id;
      lastError = new Error(`Upload sin media_id: ${JSON.stringify(uploaded)}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Sube un PDF a Meta y lo envía como documento. */
export async function sendPdf(
  conversationId: number,
  to: string,
  pdf: Buffer,
  filename: string,
  caption?: string,
): Promise<string | undefined> {
  await assertConversationOutbound({ conversationId, contentType: "pdf", actor: "bot" });
  const mediaId = await uploadMedia(pdf, "application/pdf", filename);
  const response = await wa.sendMessage(
    phoneId,
    to,
    new Document(mediaId, true, caption, filename),
  );
  return messageIdOrThrow(response, "el PDF");
}

/** Sube una imagen PNG a Meta y la envía. */
export async function sendImage(
  conversationId: number,
  to: string,
  png: Buffer,
  caption?: string,
  filename = "cotizacion.png",
): Promise<string | undefined> {
  await assertConversationOutbound({ conversationId, contentType: "image", actor: "bot" });
  const mediaId = await uploadMedia(png, "image/png", filename);
  const response = await wa.sendMessage(phoneId, to, new Image(mediaId, true, caption));
  return messageIdOrThrow(response, "la imagen");
}

export async function sendApprovedTemplate(input: {
  conversationId: number;
  to: string;
  templateName: string;
  language: string;
  variables: string[];
  attemptId: number;
}): Promise<string | undefined> {
  await assertConversationOutbound({
    conversationId: input.conversationId,
    contentType: "template",
    actor: "worker",
  });
  const body = new BodyComponent(
    ...input.variables.map((value) => new BodyParameter(value)) as [BodyParameter, ...BodyParameter[]],
  );
  const response = await wa.sendMessage(
    phoneId,
    input.to,
    new Template(input.templateName, input.language, body),
    undefined,
    `followup_attempt:${input.attemptId}`,
  );
  if (response instanceof Response) return undefined;
  if ("messages" in response) return response.messages[0]?.id;
  throw new Error(`WhatsApp rechazó la plantilla: ${response.error.message}`);
}

/**
 * Adapter de WhatsApp Cloud API.
 * Reusa: whatsapp-api-js (Secreto31126, MIT) — cliente + verificación de firma
 * del webhook + middleware de Express incluidos.
 */
import { WhatsAppAPI } from "whatsapp-api-js/middleware/express";
import { Text } from "whatsapp-api-js/messages";
import { Document } from "whatsapp-api-js/messages";
import { config } from "../config.js";

export const wa = new WhatsAppAPI({
  token: config.whatsapp.token,
  appSecret: config.whatsapp.appSecret,
  webhookVerifyToken: config.whatsapp.verifyToken,
});

const phoneId = config.whatsapp.phoneId;

export async function sendText(to: string, body: string): Promise<string | undefined> {
  const response = await wa.sendMessage(phoneId, to, new Text(body));
  if (response instanceof Response) return undefined;
  if ("messages" in response) {
    return response.messages[0]?.id;
  }
  throw new Error(`WhatsApp rechazó el mensaje: ${response.error.message}`);
}

/** Marca leído + "escribiendo…". Llamar solo cuando el bot SÍ va a responder. */
export async function showTyping(messageId: string): Promise<void> {
  await wa.markAsRead(phoneId, messageId, "text");
}

/** Sube un PDF a Meta y lo envía como documento. */
export async function sendPdf(
  to: string,
  pdf: Buffer,
  filename: string,
  caption?: string,
): Promise<string | undefined> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    filename,
  );
  const uploaded = await wa.uploadMedia(phoneId, form);
  const mediaId = (uploaded as { id: string }).id;
  const response = await wa.sendMessage(
    phoneId,
    to,
    new Document(mediaId, true, caption, filename),
  );
  if (response instanceof Response) return undefined;
  if ("messages" in response) {
    return response.messages[0]?.id;
  }
  throw new Error(`WhatsApp rechazó el PDF: ${response.error.message}`);
}

/** Alerta al vendedor. En producción, fuera de la ventana de 24h esto debe ser
 * un template utility aprobado — TODO cuando exista el template. */
export async function notifySeller(summary: string): Promise<void> {
  await sendText(config.whatsapp.sellerPhone, `🔔 *AutoVenta*\n${summary}`);
}

/**
 * Adapter de WhatsApp Cloud API.
 * Reusa: whatsapp-api-js (Secreto31126, MIT) — cliente + verificación de firma
 * del webhook + middleware de Express incluidos.
 */
import { WhatsAppAPI } from "whatsapp-api-js/middleware/express";
import { Text } from "whatsapp-api-js/messages";
import { Document, Image } from "whatsapp-api-js/messages";
import { config } from "../config.js";

export const wa = new WhatsAppAPI({
  token: config.whatsapp.token,
  appSecret: config.whatsapp.appSecret,
  webhookVerifyToken: config.whatsapp.verifyToken,
});

const phoneId = config.whatsapp.phoneId;

export async function sendText(to: string, body: string): Promise<void> {
  await wa.sendMessage(phoneId, to, new Text(body));
}

/** Marca leído + "escribiendo…". Llamar solo cuando el bot SÍ va a responder. */
export async function showTyping(messageId: string): Promise<void> {
  await wa.markAsRead(phoneId, messageId, "text");
}

/**
 * Sube media a Meta y devuelve el media_id. Lanza error explícito si el upload
 * falla (antes fallaba silencioso — el PDF "se enviaba" pero nunca llegaba).
 * Reintenta 1 vez: el upload de media es el paso más frágil de la Graph API.
 */
async function uploadMedia(buf: Buffer, mime: string, filename: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);
      const uploaded = (await wa.uploadMedia(phoneId, form)) as {
        id?: string;
        error?: unknown;
      };
      if (uploaded.id) return uploaded.id;
      lastError = new Error(`Upload sin media_id: ${JSON.stringify(uploaded)}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Verifica que la Graph API aceptó el mensaje (si no, lanza). */
function assertSent(res: unknown, what: string): void {
  const error = (res as { error?: unknown })?.error;
  if (error) throw new Error(`Envío de ${what} rechazado por Meta: ${JSON.stringify(error)}`);
}

/** Sube un PDF a Meta y lo envía como documento. */
export async function sendPdf(
  to: string,
  pdf: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  const mediaId = await uploadMedia(pdf, "application/pdf", filename);
  const res = await wa.sendMessage(phoneId, to, new Document(mediaId, true, caption, filename));
  assertSent(res, "PDF");
}

/** Sube una imagen PNG a Meta y la envía. */
export async function sendImage(to: string, png: Buffer, caption?: string): Promise<void> {
  const mediaId = await uploadMedia(png, "image/png", "cotizacion.png");
  const res = await wa.sendMessage(phoneId, to, new Image(mediaId, true, caption));
  assertSent(res, "imagen");
}

/** Alerta al vendedor. En producción, fuera de la ventana de 24h esto debe ser
 * un template utility aprobado — TODO cuando exista el template. */
export async function notifySeller(summary: string): Promise<void> {
  await sendText(config.whatsapp.sellerPhone, `🔔 *AutoVenta*\n${summary}`);
}

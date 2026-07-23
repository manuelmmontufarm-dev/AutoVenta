/**
 * Adapter de WhatsApp Cloud API.
 *
 * ENTRANTE (webhook): whatsapp-api-js (Secreto31126, MIT) valida la firma y el
 * challenge. La instancia se construye con initWa() al arrancar, ya con el
 * canal resuelto desde DB/entorno (ver services/channel.ts).
 *
 * SALIENTE (enviar texto/PDF/imagen): Graph API directa con el token resuelto
 * en cada llamada. Así el dueño puede pegar un token nuevo en Ajustes → Canal
 * y surte efecto sin reiniciar. Reintenta errores transitorios; no reintenta
 * los permanentes (ventana de 24 h cerrada, token inválido).
 */
import { WhatsAppAPI } from "whatsapp-api-js/middleware/express";
import { getChannelConfig, type ChannelConfig } from "../services/channel.js";

const GRAPH = "https://graph.facebook.com/v21.0";

let waInstance: WhatsAppAPI | null = null;

/** Construye la instancia del webhook desde el canal efectivo. Llamar al arrancar. */
export async function initWa(): Promise<WhatsAppAPI> {
  const ch = await getChannelConfig();
  waInstance = new WhatsAppAPI({
    token: ch.token,
    appSecret: ch.appSecret,
    webhookVerifyToken: ch.verifyToken,
  });
  return waInstance;
}

/** Instancia del webhook ya inicializada (para handle_post / handle_get / .on). */
export function getWa(): WhatsAppAPI {
  if (!waInstance) {
    throw new Error("WhatsApp no inicializado: llama a initWa() antes de servir el webhook.");
  }
  return waInstance;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface MetaError {
  message?: string;
  code?: number;
}

/** Traduce el error de Meta a algo accionable en español. */
function translateMetaError(error: MetaError | undefined, what: string): string {
  const msg = error?.message ?? "";
  if (error?.code === 131047 || /re-?engagement|24 hour/i.test(msg)) {
    return `No se pudo enviar ${what}: la ventana de 24 h está cerrada. El cliente tiene que escribir primero.`;
  }
  if (error?.code === 190 || /expired|invalid.*token/i.test(msg)) {
    return `No se pudo enviar ${what}: el token de WhatsApp expiró o es inválido. Actualízalo en Ajustes → Canal.`;
  }
  return `WhatsApp rechazó ${what}: ${msg || "error desconocido"}`;
}

function isPermanent(status: number, code?: number): boolean {
  // Ventana cerrada / token inválido / mal request: reintentar no ayuda.
  return code === 131047 || code === 190 || status === 400 || status === 401 || status === 403;
}

interface GraphSend {
  path: string;
  body: unknown;
}

/** POST a la Graph API con reintentos para errores transitorios (5xx / red). */
async function graphSend(
  what: string,
  build: (ch: ChannelConfig) => GraphSend,
): Promise<string | undefined> {
  const ch = await getChannelConfig();
  if (!ch.token || !ch.phoneId) {
    throw new Error(
      "Canal de WhatsApp sin configurar: pon el token y el Phone ID en Ajustes → Canal.",
    );
  }
  const { path, body } = build(ch);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${GRAPH}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ch.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (networkError) {
      lastError = networkError;
      await sleep(attempt * 400);
      continue;
    }
    const data = (await response.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: MetaError;
    };
    if (response.ok) return data.messages?.[0]?.id;
    if (isPermanent(response.status, data.error?.code)) {
      throw new Error(translateMetaError(data.error, what));
    }
    lastError = new Error(translateMetaError(data.error, what));
    await sleep(attempt * 400);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function sendText(to: string, body: string): Promise<string | undefined> {
  return graphSend("el mensaje", (ch) => ({
    path: `${ch.phoneId}/messages`,
    body: { messaging_product: "whatsapp", to, type: "text", text: { body } },
  }));
}

/** Marca leído + "escribiendo…". Best-effort: nunca bloquea la respuesta. */
export async function showTyping(messageId: string): Promise<void> {
  const ch = await getChannelConfig();
  if (!ch.token || !ch.phoneId) return;
  await fetch(`${GRAPH}/${ch.phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ch.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    }),
  }).catch(() => {});
}

/**
 * Sube media a Meta y devuelve el media_id. Reintenta 1 vez: el upload es el
 * paso más frágil de la Graph API y su fallo dejaba al cliente sin cotización.
 */
async function uploadMedia(buf: Buffer, mime: string, filename: string): Promise<string> {
  const ch = await getChannelConfig();
  if (!ch.token || !ch.phoneId) {
    throw new Error(
      "Canal de WhatsApp sin configurar: pon el token y el Phone ID en Ajustes → Canal.",
    );
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);
      const response = await fetch(`${GRAPH}/${ch.phoneId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ch.token}` },
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: MetaError;
      };
      if (response.ok && data.id) return data.id;
      lastError = new Error(data.error?.message ?? `Upload sin media_id (${response.status})`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Sube un PDF a Meta y lo envía como documento. */
export async function sendPdf(
  to: string,
  pdf: Buffer,
  filename: string,
  caption?: string,
): Promise<string | undefined> {
  const mediaId = await uploadMedia(pdf, "application/pdf", filename);
  return graphSend("el PDF", (ch) => ({
    path: `${ch.phoneId}/messages`,
    body: {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { id: mediaId, caption, filename },
    },
  }));
}

/** Sube una imagen PNG a Meta y la envía. */
export async function sendImage(
  to: string,
  png: Buffer,
  caption?: string,
  filename = "cotizacion.png",
): Promise<string | undefined> {
  const mediaId = await uploadMedia(png, "image/png", filename);
  return graphSend("la imagen", (ch) => ({
    path: `${ch.phoneId}/messages`,
    body: {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { id: mediaId, caption },
    },
  }));
}

/** Alerta al vendedor. En producción, fuera de la ventana de 24h esto debe ser
 * un template utility aprobado — TODO cuando exista el template. */
export async function notifySeller(summary: string): Promise<void> {
  const ch = await getChannelConfig();
  if (!ch.sellerPhone) return;
  await sendText(ch.sellerPhone, `🔔 *AutoVenta*\n${summary}`);
}

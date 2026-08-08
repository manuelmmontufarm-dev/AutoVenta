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
import { config } from "../config.js";
import { getChannelConfig, type ChannelConfig } from "../services/channel.js";
import { assertConversationOutbound } from "../services/whatsappPolicy.js";
import { conSaludo } from "../domain/saludo.js";
import { sql } from "../db/client.js";
import { registrarEnviado } from "./outboundRegistry.js";

const GRAPH = config.whatsapp.graphBaseUrl;
// Si alguien apunta el bot a un host que no es Meta, tiene que verse en el log
// de arranque: es la diferencia entre una prueba de carga y no enviar nada.
if (!GRAPH.startsWith("https://graph.facebook.com")) {
  console.warn(`⚠️ Graph API apuntando a ${GRAPH} — NO es Meta. Solo debe pasar en pruebas.`);
}

let waInstance: WhatsAppAPI | null = null;
let messageHandler: WhatsAppAPI["on"]["message"];
let statusHandler: WhatsAppAPI["on"]["status"];

/**
 * Envía texto al cliente con el gate de política de conversación (ventana 24h,
 * opt-out, etc.), sobre la Graph API (canal resuelto en runtime).
 */
export async function sendCustomerText(
  conversationId: number,
  to: string,
  body: string,
  actor: "bot" | "owner" | "worker" = "bot",
): Promise<string | undefined> {
  await assertConversationOutbound({ conversationId, contentType: "text", actor });
  // Lo PRIMERO que el negocio le dice a alguien empieza saludando. El prompt ya
  // lo pedía, pero un prompt es una intención: bastaba que el modelo arrancara
  // directo con la pregunta por el aro para que la primera frase de la llantera
  // fuera un interrogatorio. Solo toca el primer texto de la conversación, y
  // solo si de verdad falta. El dueño escribiendo a mano nunca se toca.
  const texto = actor === "owner" ? body : await conSaludoSiEsElPrimerTexto(conversationId, body);
  return sendText(to, texto);
}

/**
 * Antepone el saludo si este es el primer texto que sale hacia el cliente.
 *
 * Se mira solo el historial de TEXTO: si una pieza salió antes (la guía de la
 * medida, por ejemplo), el saludo igual le toca al primer mensaje escrito, que
 * es donde el cliente lo lee. Ante cualquier error de base se devuelve el texto
 * tal cual — un saludo no vale romper un envío.
 */
async function conSaludoSiEsElPrimerTexto(conversationId: number, body: string): Promise<string> {
  try {
    const [previo] = await sql<{ id: number }[]>`
      select id from messages
      where conversation_id = ${conversationId}
        and direction = 'outbound'
        and type = 'text'
      limit 1
    `;
    if (previo) return body;
    const [conv] = await sql<{ name: string | null }[]>`
      select name from conversations where id = ${conversationId}
    `;
    return conSaludo(body, conv?.name ?? null);
  } catch {
    return body;
  }
}

/**
 * Alerta operativa al asesor configurado. Es un destinatario distinto del
 * cliente, por eso no reutiliza la ventana de la conversación comercial.
 */
/**
 * Aviso a un asesor. Sin `telefono` va al asesor del canal, que es el
 * comportamiento de siempre; con teléfono va a ese, para poder avisar a varios.
 */
export async function sendAdvisorText(
  body: string,
  telefono?: string,
): Promise<string | undefined> {
  const destino = telefono?.trim() || (await getChannelConfig()).sellerPhone;
  if (!destino) return undefined;
  return sendText(destino, body);
}

/**
 * Registra los handlers del webhook UNA vez (index.ts). Se re-aplican solos
 * cada vez que la instancia se reconstruye (p. ej. token pegado desde el panel).
 */
export function setWaHandlers(handlers: {
  message?: WhatsAppAPI["on"]["message"];
  status?: WhatsAppAPI["on"]["status"];
}): void {
  messageHandler = handlers.message;
  statusHandler = handlers.status;
  if (waInstance) {
    waInstance.on.message = messageHandler;
    waInstance.on.status = statusHandler;
  }
}

/**
 * (Re)construye la instancia del webhook desde el canal efectivo (DB > entorno).
 * Sin credenciales completas devuelve null: el bot arranca igual y el webhook
 * queda inactivo hasta que se guarde el canal desde el panel (reloadWa).
 */
export async function initWa(): Promise<WhatsAppAPI | null> {
  const ch = await getChannelConfig();
  if (!ch.token || !ch.appSecret || !ch.verifyToken) {
    waInstance = null;
    return null;
  }
  waInstance = new WhatsAppAPI({
    token: ch.token,
    appSecret: ch.appSecret,
    webhookVerifyToken: ch.verifyToken,
  });
  waInstance.on.message = messageHandler;
  waInstance.on.status = statusHandler;
  return waInstance;
}

/**
 * Reconstruye el webhook tras guardar el canal (PUT /api/channel): el token
 * nuevo entra en caliente, sin redeploy. Devuelve si quedó activo.
 */
export async function reloadWa(): Promise<boolean> {
  return (await initWa()) !== null;
}

/** Instancia actual del webhook, o null si el canal aún no está configurado. */
export function getWa(): WhatsAppAPI | null {
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
    if (response.ok) {
      // El eco de este mismo mensaje va a volver por el webhook: se registra
      // ya para no confundirlo con un asesor escribiendo desde WhatsApp.
      registrarEnviado(data.messages?.[0]?.id);
      return data.messages?.[0]?.id;
    }
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

/**
 * Baja media entrante (foto del cliente) de la Graph API: primero el metadato
 * del media_id (que trae una URL firmada de vida corta) y luego los bytes.
 *
 * Nunca lanza: una foto ilegible no puede tumbar el webhook — el llamador
 * responde igual pidiendo la medida por escrito.
 */
export async function downloadMedia(
  mediaId: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  try {
    const ch = await getChannelConfig();
    if (!ch.token) {
      console.warn("⚠️ downloadMedia sin token de canal");
      return null;
    }
    const auth = { Authorization: `Bearer ${ch.token}` };
    const metaResponse = await fetch(`${GRAPH}/${mediaId}`, {
      headers: auth,
      signal: AbortSignal.timeout(15000),
    });
    if (!metaResponse.ok) {
      console.warn(`⚠️ downloadMedia: metadato ${mediaId} respondió ${metaResponse.status}`);
      return null;
    }
    const meta = (await metaResponse.json().catch(() => ({}))) as {
      url?: string;
      mime_type?: string;
    };
    if (!meta.url) {
      console.warn(`⚠️ downloadMedia: metadato ${mediaId} sin url`);
      return null;
    }
    // La URL firmada también exige el Bearer: sin él Meta devuelve 401.
    const fileResponse = await fetch(meta.url, {
      headers: auth,
      signal: AbortSignal.timeout(15000),
    });
    if (!fileResponse.ok) {
      console.warn(`⚠️ downloadMedia: bytes de ${mediaId} respondieron ${fileResponse.status}`);
      return null;
    }
    const bytes = Buffer.from(await fileResponse.arrayBuffer());
    if (!bytes.length) {
      console.warn(`⚠️ downloadMedia: ${mediaId} vino vacío`);
      return null;
    }
    return { bytes, mimeType: meta.mime_type ?? "image/jpeg" };
  } catch (error) {
    console.warn(
      `⚠️ downloadMedia falló para ${mediaId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
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
  conversationId: number,
  to: string,
  png: Buffer,
  caption?: string,
  filename = "cotizacion.png",
): Promise<string | undefined> {
  await assertConversationOutbound({ conversationId, contentType: "image", actor: "bot" });
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

/**
 * Envía una plantilla aprobada (para seguimientos fuera de la ventana de 24h),
 * vía Graph API. `biz_opaque_callback_data` correlaciona el intento en el status.
 */
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
  return graphSend("la plantilla", (ch) => ({
    path: `${ch.phoneId}/messages`,
    body: {
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      biz_opaque_callback_data: `followup_attempt:${input.attemptId}`,
      template: {
        name: input.templateName,
        language: { code: input.language },
        components: input.variables.length
          ? [
              {
                type: "body",
                parameters: input.variables.map((text) => ({ type: "text", text })),
              },
            ]
          : [],
      },
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

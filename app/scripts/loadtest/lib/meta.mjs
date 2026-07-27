/**
 * Generador de webhooks entrantes de Meta, firmados igual que los reales.
 *
 * El algoritmo es el inverso del verificador que ya existe en
 * tools/webhook/server.js: HMAC-SHA256 hex sobre el body CRUDO, con el
 * app secret, en el header `x-hub-signature-256: sha256=<hex>`.
 * Los bytes firmados tienen que ser exactamente los enviados — por eso se
 * serializa una sola vez y se manda ese mismo string.
 */
import { createHmac } from "node:crypto";

/**
 * Meta serializa el payload con el unicode escapado (`ó` en vez de `ó`) y
 * firma ESE texto. whatsapp-api-js lo reproduce con `escapeUnicode` antes de
 * verificar (lib/utils.js). Si el harness manda tildes literales, la firma no
 * cuadra y el webhook responde 401 — solo para los mensajes con acentos, que
 * en español son casi todos. Se emula el mismo escapado.
 */
export function escapeUnicode(str) {
  return str.replace(/[^\0-~]/g, (ch) => `\\u${`000${ch.charCodeAt(0).toString(16)}`.slice(-4)}`);
}

export function signBody(rawBody, appSecret) {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

/** Payload de mensaje de texto entrante, con la forma que manda Meta de verdad. */
export function buildInboundPayload({ from, name, text, waMessageId, phoneId, timestamp }) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA_LOADTEST",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "593000000000", phone_number_id: phoneId },
          contacts: [{ profile: { name }, wa_id: from }],
          messages: [{
            from,
            id: waMessageId,
            timestamp: String(Math.floor((timestamp ?? Date.now()) / 1000)),
            type: "text",
            text: { body: text },
          }],
        },
      }],
    }],
  };
}

/**
 * Entrega un webhook y devuelve el status y cuánto tardó el ACK.
 * La latencia importa tanto como el status: Meta reintenta todo lo que no
 * responda 200 en 3 segundos.
 */
export async function deliverWebhook({ baseUrl, payload, appSecret, timeoutMs = 15_000 }) {
  // Los bytes firmados tienen que ser exactamente los enviados, y con el mismo
  // escapado que usa Meta.
  const rawBody = escapeUnicode(JSON.stringify(payload));
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signBody(rawBody, appSecret),
      },
      body: rawBody,
      signal: controller.signal,
    });
    return { status: response.status, ackMs: performance.now() - startedAt };
  } catch (error) {
    return {
      status: 0,
      ackMs: performance.now() - startedAt,
      error: error?.name === "AbortError" ? `timeout tras ${timeoutMs} ms` : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** wamid con la forma de los de Meta, único por corrida. */
export function makeWamid(runId, clientIndex, turn, copy = 0) {
  return `wamid.LOADTEST_${runId}_c${clientIndex}_t${turn}_${copy}`;
}

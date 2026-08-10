/**
 * Reemplazo de `src/wa/client.ts` durante el replay.
 *
 * El harness repite conversaciones REALES de clientes reales. Si el módulo de
 * WhatsApp fuera el de verdad, cada cotización del replay le llegaría por
 * WhatsApp a una persona que escribió hace dos semanas. Este stub es la única
 * garantía dura de que eso no puede pasar: no existe ninguna ruta de código
 * desde el replay hasta la Graph API porque el módulo que la habla nunca se
 * carga (ver `lib/loader.mjs`, que lo sustituye en el resolver de Node).
 *
 * Todo lo enviado queda registrado en memoria y lo lee replay.mjs para saber
 * QUÉ piezas habría mandado el bot (imagen de opciones, PDF de cotización) sin
 * mandarlas: van al campo `piezas` de cada turno y al total `piezasPorTipo` del
 * replay, que el informe muestra. Las firmas espejan las de wa/client.ts: si
 * allá cambia una, aquí revienta el import y hay que actualizarlo — es a
 * propósito.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * El buffer NO puede ser uno solo.
 *
 * replay.mjs corre 3 conversaciones a la vez por defecto. Con un array de
 * módulo, el `_eval_reset()` de una conversación borraba lo que otra acababa de
 * enviar y el `_eval_enviados()` de la primera en terminar se llevaba las
 * piezas de las tres. AsyncLocalStorage le da a cada conversación el suyo y el
 * contexto se propaga solo a través de los `await` del agente.
 */
/** @typedef {{tipo: string, conversationId: number|null, to: string|null, bytes: number|null, caption: string|null, filename: string|null, cuando: string}} Pieza */
const contexto = new AsyncLocalStorage();
/** @type {Pieza[]} Fuera de contexto (uso suelto o pruebas) sigue habiendo uno. */
const sueltos = [];
const buffer = () => contexto.getStore() ?? sueltos;

/**
 * Corre `fn` con un buffer propio y devuelve `{ resultado, piezas }`.
 * replay.mjs envuelve cada conversación con esto.
 */
export async function _eval_enContexto(fn) {
  /** @type {Pieza[]} */
  const propio = [];
  const resultado = await contexto.run(propio, fn);
  return { resultado, piezas: [...propio] };
}

/** ¿Estamos dentro de un contexto propio? Lo comprueba replay.mjs al arrancar. */
export function _eval_hayContexto() {
  return contexto.getStore() !== undefined;
}

let contador = 0;
const idFalso = () => `wamid.EVAL${(contador += 1).toString().padStart(5, "0")}`;

function registrar(tipo, datos) {
  buffer().push({
    tipo,
    conversationId: datos.conversationId ?? null,
    to: datos.to ?? null,
    bytes: datos.bytes ?? null,
    caption: datos.caption ?? null,
    filename: datos.filename ?? null,
    cuando: new Date().toISOString(),
  });
  return idFalso();
}

/** Lo que el bot habría enviado en ESTA conversación. Se vacía entre turnos. */
export function _eval_enviados() {
  return [...buffer()];
}

export function _eval_reset() {
  buffer().length = 0;
}

// ── Superficie pública de src/wa/client.ts ───────────────────────────────────

export async function sendCustomerText(conversationId, to, body, actor = "bot") {
  return registrar("texto", { conversationId, to, caption: body, bytes: body?.length ?? 0 });
}

export async function sendAdvisorText(body, telefono) {
  return registrar("aviso_asesor", { to: telefono ?? null, caption: body });
}

export async function sendText(to, body) {
  return registrar("texto", { to, caption: body, bytes: body?.length ?? 0 });
}

export async function sendImage(conversationId, to, png, caption, filename = "cotizacion.png") {
  return registrar("imagen", {
    conversationId, to, bytes: png?.length ?? 0, caption: caption ?? null, filename,
  });
}

export async function sendPdf(conversationId, to, pdf, filename, caption) {
  return registrar("pdf", {
    conversationId, to, bytes: pdf?.length ?? 0, caption: caption ?? null, filename,
  });
}

export async function sendAdvisorPdf(input) {
  return registrar("pdf_asesor", {
    to: input?.to ?? null,
    bytes: input?.pdf?.length ?? 0,
    caption: input?.caption ?? null,
    filename: input?.filename ?? null,
  });
}

export async function sendApprovedTemplate(input) {
  return registrar("plantilla", {
    conversationId: input?.conversationId ?? null,
    to: input?.to ?? null,
    caption: input?.templateName ?? null,
  });
}

export async function notifySeller(summary) {
  registrar("aviso_vendedor", { caption: summary });
}

export async function showTyping(_messageId) {
  // En el replay no hay a quién mostrarle "escribiendo…".
}

/**
 * Las fotos históricas NO se pueden rebajar: el media_id de Meta caduca a los
 * días y el histórico tiene semanas. Devolver null es lo honesto — el bot
 * nuevo, al recibirlo, cae por su rama de "no pude leer la imagen", que es
 * exactamente el camino que tomaría con una foto corrupta en producción.
 * replay.mjs marca estos mensajes como `medios_no_recuperables` para que el
 * informe no los cuente como una mejora ni como una falla del bot nuevo.
 */
export async function downloadMedia(_mediaId) {
  return null;
}

export async function initWa() {
  return null;
}

export async function reloadWa() {
  return false;
}

export function getWa() {
  return null;
}

export function setWaHandlers(_handlers) {
  // El replay no levanta webhook.
}

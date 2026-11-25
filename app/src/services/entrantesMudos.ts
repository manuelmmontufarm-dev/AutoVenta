/**
 * Guarda en `messages` lo que el cliente manda y no entra al pipeline del bot:
 * reacciones, mensajes que Meta entrega como `unsupported`, pedidos del
 * catálogo, avisos de sistema… y, como último recurso, los mensajes cuyo
 * procesamiento falló todas las veces. Ver `domain/entranteMudo.ts`.
 *
 * Regla: nada de aquí despierta al bot ni reabre una venta cerrada. Solo deja
 * la fila para que el asesor la lea en la app.
 */
import { sql } from "../db/client.js";
import { entranteMudo, mensajeDeLaNovedad, textoDeRescate, type EntranteMudo } from "../domain/entranteMudo.js";
import { appendMessage, getOrCreateConversation, yaProcesado } from "./conversations.js";

function fechaDe(message: Record<string, unknown>): Date {
  const segundos = Number(message.timestamp);
  return Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : new Date();
}

/**
 * Guarda un entrante mudo. Devuelve el id de la conversación si quedó una fila
 * nueva, o null si no había nada que guardar (reentrega, o una reacción de un
 * número que nunca tuvo chat: el 👍 de un asesor a un aviso no abre un lead).
 */
export async function guardarEntranteMudo(
  from: string,
  name: string | undefined,
  waMessageId: string,
  mudo: EntranteMudo,
  receivedAt: Date,
): Promise<number | null> {
  let conversationId: number;
  if (mudo.cuentaComoActividad) {
    // Sin reabrir: un 📊 sobre una venta cerrada se guarda en el ciclo cerrado.
    conversationId = (await getOrCreateConversation(from, name, false)).id;
  } else {
    const [fila] = await sql<{ id: number }[]>`select id from conversations where phone = ${from}`;
    if (!fila) return null;
    conversationId = fila.id;
  }
  const esNuevo = await appendMessage(conversationId, "user", mudo.texto, waMessageId, {
    occurredAt: receivedAt,
    metadata: { mudo: mudo.clase, ...mudo.detalle },
    sinActividad: !mudo.cuentaComoActividad,
  });
  if (!esNuevo) return null;
  console.log(`📥 Conv ${conversationId}: entrante sin respuesta del bot guardado (${mudo.clase}).`);
  return conversationId;
}

/**
 * ÚLTIMO RECURSO. Una novedad falló todas las veces que Meta la reintentó y se
 * va a dejar de pedir reintento: antes de soltarla, se guarda el mensaje tal
 * cual para que no desaparezca. El bot ya no lo va a contestar; el asesor sí lo
 * ve. Nunca lanza. Devuelve el id de la conversación si guardó algo.
 */
export async function rescatarEntrante(parte: unknown): Promise<number | null> {
  try {
    const novedad = mensajeDeLaNovedad(parte);
    if (!novedad) return null;
    const { message, from, name } = novedad;
    const waMessageId = String(message.id);
    if (await yaProcesado(waMessageId)) return null;
    const mudo = entranteMudo(message);
    const receivedAt = fechaDe(message);
    if (mudo) return await guardarEntranteMudo(from, name, waMessageId, mudo, receivedAt);
    const conversation = await getOrCreateConversation(from, name, false);
    const esNuevo = await appendMessage(conversation.id, "user", textoDeRescate(message), waMessageId, {
      occurredAt: receivedAt,
      metadata: { rescate: true, waType: String(message.type ?? "") },
    });
    if (!esNuevo) return null;
    console.error(`🛟 Conv ${conversation.id}: mensaje ${waMessageId} guardado de rescate; el bot NO lo contestó.`);
    return conversation.id;
  } catch (error) {
    console.error("🚨 Ni el rescate pudo guardar el mensaje entrante:", error instanceof Error ? error.message : error);
    return null;
  }
}

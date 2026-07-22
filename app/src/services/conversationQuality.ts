import { sql } from "../db/client.js";
import { createBotAlert } from "./followUps.js";
import { looksRepetitiveReply } from "../domain/conversationQuality.js";
import { notifyAdvisor } from "./advisorNotifications.js";

/** Alerta al asesor, sin pausar el bot, cuando la respuesta vuelve a la misma idea. */
export async function flagRepetitiveConversation(conversationId: number, candidate: string): Promise<boolean> {
  const rows = await sql<{ content: string; cycle: number }[]>`
    select m.content, c.current_cycle as cycle from conversations c
    join lateral (
      select content from messages where conversation_id=c.id and cycle=c.current_cycle
        and direction='outbound' and author_kind='bot' order by created_at desc limit 3
    ) m on true where c.id=${conversationId}
  `;
  if (rows.length < 2 || !looksRepetitiveReply(candidate, rows.map((row) => row.content))) return false;
  await createBotAlert({
    conversationId, cycle: rows[0].cycle, type: "repetitive_conversation", priority: "high",
    summary: "Conversación repetitiva: el bot sigue operando",
    exactReason: "El bot está repitiendo una respuesta o pregunta similar y el cliente puede quedar atrapado.",
    suggestedAction: "Revisar rápidamente el contexto y asesorar o intervenir si hace falta; el bot permanece activo.",
    dedupeKey: `${conversationId}:${rows[0].cycle}:repetitive_conversation`,
  });
  await notifyAdvisor({
    conversationId,
    cycle: rows[0].cycle,
    eventType: "repetitive_conversation",
    dedupeKey: `${conversationId}:${rows[0].cycle}:repetitive_conversation`,
    title: "Conversación repetitiva",
    reason: "El bot repitió una respuesta o pregunta similar y el cliente puede quedar atrapado.",
    action: "Revisar el ticket pronto; el bot continúa activo hasta que Manuel decida intervenir.",
  });
  return true;
}

/**
 * Quién contesta este mensaje del cliente — la regla de `domain/turnoDelHumano.ts`
 * aplicada contra la base, con su alerta. La llama `index.ts` en el lugar donde
 * antes estaban `isBotPaused` y `devolverAlBotSiVencioLaPausa`, sueltos.
 *
 * Cuando el turno es del humano, el mensaje ya quedó guardado y el bot calla;
 * lo que faltaba es que ALGUIEN SE ENTERE. Conv 21640 (20-sep): el seguimiento
 * `advisor_review` pasó el chat a humano con pausa infinita, el cliente
 * escribió «¿Qué precio tienen los 4 neumáticos? Envié unas fotos» 80 minutos
 * después y le contestaron a mano SIETE DÍAS más tarde: el mensaje se guardó,
 * no corrió el bot y no se levantó ninguna alerta. Ahora cada mensaje en esas
 * condiciones levanta —o refresca, una por ciclo— una alerta alta.
 */
import { sql } from "../db/client.js";
import {
  claveClienteSinRespuesta,
  quienContesta,
  TIPO_CLIENTE_SIN_RESPUESTA,
  type QuienContesta,
} from "../domain/turnoDelHumano.js";
import { devolverAlBotSiVencioLaPausa } from "./conversations.js";
import { emitLiveEvent } from "./liveEvents.js";

/** `author_kind` del último saliente del hilo (cualquier ciclo, sin notas). */
export async function autorDelUltimoSaliente(conversationId: number): Promise<string | null> {
  const [fila] = await sql<{ author_kind: string | null }[]>`
    select author_kind from messages
    where conversation_id=${conversationId} and direction='outbound' and type <> 'note'
    order by created_at desc, id desc limit 1
  `;
  return fila?.author_kind ?? null;
}

export async function decidirQuienContesta(
  conversationId: number,
  textoDelCliente: string,
  ahora: Date = new Date(),
): Promise<QuienContesta> {
  const [conv] = await sql<{ assigned_to: string | null; bot_paused_until: Date | null; current_cycle: number }[]>`
    select assigned_to, bot_paused_until, current_cycle from conversations where id=${conversationId}
  `;
  if (!conv) return { contesta: "bot" };
  const decision = quienContesta({
    asignadoA: conv.assigned_to,
    pausaHasta: conv.bot_paused_until,
    autorDelUltimoSaliente: await autorDelUltimoSaliente(conversationId),
    ahora,
  });

  if (decision.contesta === "bot") {
    // Llegar acá con el chat en 'human' significa que la pausa venció y la
    // última palabra fue del bot: vuelve al bot (decisión del 8-ago). Si no,
    // el bot redactaba y la política le bloqueaba el envío.
    if (await devolverAlBotSiVencioLaPausa(conversationId)) {
      console.log(`🤖 Venció la pausa del asesor en ${conversationId}: el bot retoma la conversación.`);
      emitLiveEvent("sync", conversationId);
    }
    return decision;
  }

  const porQue = decision.motivo === "pausa_vigente"
    ? "El chat está en pausa de asesor: el bot no contesta."
    : "La última respuesta del chat la escribió una persona y nadie se lo devolvió al bot: el bot no se mete.";
  await sql`
    insert into bot_alerts (
      conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key
    ) values (
      ${conversationId}, ${conv.current_cycle}, ${TIPO_CLIENTE_SIN_RESPUESTA}, 'high',
      'El cliente escribió y nadie le contesta',
      ${`Último mensaje del cliente: «${textoDelCliente.slice(0, 300)}». ${porQue}`},
      'Contéstale desde el panel o desde tu WhatsApp. Si quieres que siga el bot, devuélvele el chat desde el panel.',
      ${claveClienteSinRespuesta(conversationId, conv.current_cycle)}
    )
    on conflict (dedupe_key) where status in ('open', 'snoozed')
    do update set exact_reason = excluded.exact_reason, status = 'open',
      snoozed_until = null, created_at = now()
  `;
  emitLiveEvent("alert", conversationId);
  console.log(`🤐 Conv ${conversationId}: el turno es del humano (${decision.motivo}); alerta al asesor.`);
  return decision;
}

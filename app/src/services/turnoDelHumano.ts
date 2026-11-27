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
import { config } from "../config.js";
import { sql } from "../db/client.js";
import {
  claveClienteSinRespuesta,
  quienContesta,
  TIPO_BOT_RETOMO_EL_CHAT,
  TIPO_CLIENTE_SIN_RESPUESTA,
  type QuienContesta,
} from "../domain/turnoDelHumano.js";
import { devolverAlBotSiVencioLaPausa } from "./conversations.js";
import { emitLiveEvent } from "./liveEvents.js";
import { politica } from "../negocio/politica.js";

/** Minutos que espera la alerta «nadie le contesta» antes de mostrarse (solo Competimotor). */
const ESPERA_ANTES_DE_ALERTAR_MIN = 10;

/** `author_kind` del último saliente del hilo (cualquier ciclo, sin notas). */
export async function autorDelUltimoSaliente(conversationId: number): Promise<string | null> {
  const [fila] = await sql<{ author_kind: string | null }[]>`
    select author_kind from messages
    where conversation_id=${conversationId} and direction='outbound' and type <> 'note'
    order by created_at desc, id desc limit 1
  `;
  return fila?.author_kind ?? null;
}

/** Cuándo escribió por última vez una persona (owner/advisor) en el hilo. */
export async function ultimoSalienteHumanoEn(conversationId: number): Promise<Date | null> {
  const [fila] = await sql<{ en: Date | null }[]>`
    select max(created_at) as en from messages
    where conversation_id=${conversationId} and direction='outbound' and type <> 'note'
      and author_kind in ('owner', 'advisor')
  `;
  return fila?.en ?? null;
}

const POR_QUE_RETOMA = {
  pausa_automatica:
    "El chat estaba en pausa por la revisión automática de 24 h y ninguna persona había escrito: el bot le contestó.",
  humano_hace_mucho:
    `La última respuesta de una persona tiene más de ${config.pipeline.humanTurnHours} h: el bot le contestó.`,
} as const;

/**
 * ¿Va a contestar el bot? La misma regla que `decidirQuienContesta`, pero SOLO
 * leyendo: no devuelve el chat, no levanta alertas. Para el «escribiendo…»
 * temprano, que se adelanta al turno y no puede decidir nada por él.
 */
export async function vaAContestarElBot(conversationId: number, ahora: Date = new Date()): Promise<boolean> {
  const [conv] = await sql<{
    assigned_to: string | null; bot_paused_until: Date | null; bot_paused_reason: string | null;
  }[]>`
    select assigned_to, bot_paused_until, bot_paused_reason from conversations where id=${conversationId}
  `;
  if (!conv) return false;
  return quienContesta({
    asignadoA: conv.assigned_to,
    pausaHasta: conv.bot_paused_until,
    motivoDeLaPausa: conv.bot_paused_reason,
    autorDelUltimoSaliente: await autorDelUltimoSaliente(conversationId),
    ultimoSalienteHumanoEn: await ultimoSalienteHumanoEn(conversationId),
    horasDelTurnoHumano: config.pipeline.humanTurnHours,
    ahora,
  }).contesta === "bot";
}

export async function decidirQuienContesta(
  conversationId: number,
  textoDelCliente: string,
  ahora: Date = new Date(),
): Promise<QuienContesta> {
  const [conv] = await sql<{
    assigned_to: string | null; bot_paused_until: Date | null; bot_paused_reason: string | null; current_cycle: number;
  }[]>`
    select assigned_to, bot_paused_until, bot_paused_reason, current_cycle from conversations where id=${conversationId}
  `;
  if (!conv) return { contesta: "bot" };
  const decision = quienContesta({
    asignadoA: conv.assigned_to,
    pausaHasta: conv.bot_paused_until,
    motivoDeLaPausa: conv.bot_paused_reason,
    autorDelUltimoSaliente: await autorDelUltimoSaliente(conversationId),
    ultimoSalienteHumanoEn: await ultimoSalienteHumanoEn(conversationId),
    horasDelTurnoHumano: config.pipeline.humanTurnHours,
    ahora,
  });

  if (decision.contesta === "bot" && decision.retoma) {
    // El bot contesta un chat que tenía una razón para ser de una persona:
    // se le devuelve de verdad (si no, la política lo bloquea por
    // `human_control` al enviar) y el asesor se entera. La alerta de la
    // revisión (`advisor_follow_up`) no se toca: sigue abierta.
    await sql`
      update conversations
      set assigned_to = 'bot', bot_paused_until = null, bot_paused_reason = null, updated_at = now()
      where id = ${conversationId}
    `;
    await sql`
      insert into bot_alerts (
        conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key
      ) values (
        ${conversationId}, ${conv.current_cycle}, ${TIPO_BOT_RETOMO_EL_CHAT}, 'high',
        'El cliente volvió a escribir y le contestó el bot',
        ${`Último mensaje del cliente: «${textoDelCliente.slice(0, 300)}». ${POR_QUE_RETOMA[decision.retoma]}`},
        'Revisa lo que le dijo el bot. Si el caso es tuyo, contéstale desde el panel o desde tu WhatsApp.',
        ${`${TIPO_BOT_RETOMO_EL_CHAT}:${conversationId}:${conv.current_cycle}`}
      )
      on conflict (dedupe_key) where status in ('open', 'snoozed')
      do update set exact_reason = excluded.exact_reason, status = 'open',
        snoozed_until = null, created_at = now()
    `;
    emitLiveEvent("alert", conversationId);
    emitLiveEvent("sync", conversationId);
    console.log(`🤖 Conv ${conversationId}: contesta el bot (${decision.retoma}); alerta al asesor.`);
    return decision;
  }

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
  // UNA ESPERA REAL ANTES DE ALARMAR (F-06 / N6, chat 1456): nueve «el cliente
  // escribió y nadie le contesta» mientras el asesor contestaba en 1–3 minutos,
  // porque la alerta nacía en el mismo minuto del mensaje. Con
  // `politica.casosSueltosF06` nace POSPUESTA (`snoozed`) los minutos de
  // `ESPERA_ANTES_DE_ALERTAR_MIN`: el panel no la muestra hasta entonces, y si
  // el asesor contesta antes, `setConversationAssignee('human')` la resuelve.
  // Depot: igual que siempre (abierta al instante).
  const pospuesta = politica.casosSueltosF06 === true;
  const hasta = pospuesta ? new Date(Date.now() + ESPERA_ANTES_DE_ALERTAR_MIN * 60_000) : null;
  await sql`
    insert into bot_alerts (
      conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key, status, snoozed_until
    ) values (
      ${conversationId}, ${conv.current_cycle}, ${TIPO_CLIENTE_SIN_RESPUESTA}, 'high',
      'El cliente escribió y nadie le contesta',
      ${`Último mensaje del cliente: «${textoDelCliente.slice(0, 300)}». ${porQue}`},
      'Contéstale desde el panel o desde tu WhatsApp. Si quieres que siga el bot, devuélvele el chat desde el panel.',
      ${claveClienteSinRespuesta(conversationId, conv.current_cycle)},
      ${pospuesta ? "snoozed" : "open"}, ${hasta}
    )
    on conflict (dedupe_key) where status in ('open', 'snoozed')
    do update set exact_reason = excluded.exact_reason,
      status = case when ${pospuesta} and bot_alerts.status = 'snoozed' then 'snoozed' else 'open' end,
      snoozed_until = case when ${pospuesta} and bot_alerts.status = 'snoozed' then bot_alerts.snoozed_until else null end,
      created_at = case when ${pospuesta} and bot_alerts.status = 'snoozed' then bot_alerts.created_at else now() end
  `;
  emitLiveEvent("alert", conversationId);
  console.log(`🤐 Conv ${conversationId}: el turno es del humano (${decision.motivo}); alerta al asesor.`);
  return decision;
}

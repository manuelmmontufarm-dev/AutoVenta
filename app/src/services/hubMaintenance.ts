/**
 * Puesta al día del tablero después de un apagón del bot.
 *
 * Con el bot apagado el pipeline sigue guardando los mensajes y extrayendo
 * medida, vehículo y compromisos — pero `classifyStage` nunca corre, así que
 * las tarjetas se quedan en la etapa que tenían. Depot Tire estuvo apagado dos
 * días y quedaron 95 conversaciones en «nuevo», varias con la medida ya
 * identificada y una que había comprometido visita.
 *
 * Estas dos operaciones arreglan eso sin adivinar:
 *  - `reorganizarEtapas` mueve SOLO donde hay un dato ya extraído.
 *  - `atenderPendientes` hace que el bot conteste lo que quedó sin respuesta,
 *    y únicamente dentro de la ventana de 24 h de WhatsApp.
 */
import { sql } from "../db/client.js";
import { config } from "../config.js";
import { setStage } from "./conversations.js";
import { resumeBotIfUnanswered, type ResumeBotResult } from "./resumeBot.js";
import { isBotActive } from "./botPower.js";
import { createBotAlert, getFollowUpPolicy } from "./followUps.js";
import { isWithinBusinessHours } from "../domain/followUps.js";
import type { Stage } from "../domain/pipeline.js";

export interface MovimientoEtapa {
  id: number;
  nombre: string | null;
  telefono: string;
  de: Stage;
  a: Stage;
  motivo: string;
}

interface FilaCandidata {
  id: number;
  name: string | null;
  phone: string;
  stage: Stage;
  tire_size: string | null;
  customer_commitment: string | null;
  visit_date: Date | null;
}

/**
 * Recalcula la etapa de las conversaciones abiertas usando solo datos ya
 * extraídos. Nunca llama al modelo: una etapa mal puesta por una corazonada es
 * peor que una etapa desactualizada.
 *
 * `dryRun` devuelve el plan sin tocar nada — es como se revisa antes de aplicar.
 */
export async function reorganizarEtapas(
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<{ movimientos: MovimientoEtapa[]; aplicados: number }> {
  const filas = await sql<FilaCandidata[]>`
    select id, name, phone, stage, tire_size, customer_commitment, visit_date
    from conversations
    where status = 'open' and stage not in ('ganado', 'perdido')
    order by id
  `;

  const movimientos: MovimientoEtapa[] = [];
  for (const fila of filas) {
    const destino = etapaSegunEvidencia(fila);
    if (!destino || destino.a === fila.stage) continue;
    movimientos.push({
      id: Number(fila.id),
      nombre: fila.name,
      telefono: fila.phone,
      de: fila.stage,
      a: destino.a,
      motivo: destino.motivo,
    });
  }

  if (dryRun) return { movimientos, aplicados: 0 };

  let aplicados = 0;
  for (const m of movimientos) {
    try {
      await setStage(m.id, m.a, {
        actor: "owner",
        reason: `Puesta al día tras el apagón — ${m.motivo}`,
      });
      aplicados++;
    } catch (error) {
      console.error(`⚠️ No se pudo mover la conversación ${m.id}:`, error);
    }
  }
  return { movimientos, aplicados };
}

/**
 * Etapa que la evidencia respalda, o null si no hay ninguna.
 *
 * El orden importa: un compromiso de visita manda sobre la medida, porque el
 * cliente ya avanzó más de lo que la medida sola indica.
 */
function etapaSegunEvidencia(fila: FilaCandidata): { a: Stage; motivo: string } | null {
  if (fila.visit_date || fila.customer_commitment) {
    const detalle = fila.customer_commitment?.trim()
      ? `comprometió visita: "${fila.customer_commitment.trim().slice(0, 60)}"`
      : "tiene fecha de visita registrada";
    return { a: "seguimiento_venta", motivo: detalle };
  }
  if (fila.tire_size && fila.stage === "nuevo") {
    return { a: "medida_confirmada", motivo: `medida ya identificada: ${fila.tire_size}` };
  }
  return null;
}

export interface ResultadoAtencion {
  id: number;
  nombre: string | null;
  telefono: string;
  resultado: ResumeBotResult | "error";
  detalle?: string;
}

/**
 * Hace que el bot conteste las conversaciones que quedaron sin respuesta.
 *
 * Solo toca las que siguen dentro de la ventana de 24 h: fuera de ella Meta no
 * deja mandar texto libre y el caso es de una persona. `resumeBotIfUnanswered`
 * vuelve a verificar la ventana y el interruptor por conversación, así que
 * aunque esta lista quede vieja no se escapa ningún envío indebido.
 *
 * `limite` acota el lote: son mensajes a clientes reales y conviene mirarlos
 * antes de soltar el resto.
 */
export async function atenderPendientes(
  { limite = 25, dryRun = false }: { limite?: number; dryRun?: boolean } = {},
): Promise<{ candidatos: number; resultados: ResultadoAtencion[]; botEncendido: boolean }> {
  const botEncendido = await isBotActive();
  const filas = await sql<{ id: number; name: string | null; phone: string }[]>`
    select c.id, c.name, c.phone
    from conversations c
    where c.status = 'open'
      and c.assigned_to = 'bot'
      and c.bot_paused_until is null
      and c.opted_out_at is null
      and c.negative_sentiment_at is null
      and c.last_customer_message_at is not null
      and c.last_customer_message_at > now() - interval '24 hours'
      and (
        c.last_assistant_message_at is null
        or c.last_assistant_message_at < c.last_customer_message_at
      )
    order by c.last_customer_message_at asc
    limit ${limite}
  `;

  if (dryRun || !botEncendido) {
    return {
      candidatos: filas.length,
      botEncendido,
      resultados: filas.map((f) => ({
        id: Number(f.id), nombre: f.name, telefono: f.phone,
        resultado: botEncendido ? ("nothing_pending" as const) : ("bot_off" as const),
        detalle: dryRun ? "simulación: no se envió nada" : "el bot está apagado",
      })),
    };
  }

  const resultados: ResultadoAtencion[] = [];
  for (const fila of filas) {
    try {
      const resultado = await resumeBotIfUnanswered(Number(fila.id));
      resultados.push({ id: Number(fila.id), nombre: fila.name, telefono: fila.phone, resultado });
    } catch (error) {
      resultados.push({
        id: Number(fila.id), nombre: fila.name, telefono: fila.phone, resultado: "error",
        detalle: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { candidatos: filas.length, botEncendido, resultados };
}

/**
 * EL RELOJ DEL CHAT OLVIDADO (29-ago-2026, decisión de Manuel: 12 horas).
 *
 * Un asesor toma el chat, el cliente escribe, y nadie contesta. La red del
 * 8-ago (`devolverAlBotSiVencioLaPausa`) solo corre cuando el cliente vuelve a
 * escribir; si no insiste, el chat queda mudo para siempre — conv 10201:
 * 26 mensajes sin responder en 3 días, con cotización y visita acordadas.
 *
 * Este barrido corre en el worker embebido: todo chat abierto asignado a un
 * humano cuyo último mensaje es del cliente y lleva `HUMAN_RESCUE_HOURS` sin
 * respuesta vuelve al bot, y el bot contesta en el momento. Acotado a la
 * ventana de 24 h de Meta: pasada la ventana no se puede mandar texto libre y
 * el caso sigue siendo de una persona (el watchdog de avisos ya existe para
 * eso). Se excluyen el opt-out (consentimiento, no un plazo) y el cliente
 * molesto (devolverle el bot a quien pidió NO hablar con el bot es peor que el
 * silencio: ahí el aviso al asesor es el camino).
 *
 * Al asesor no se le quita nada en silencio: cada rescate deja una alerta con
 * el motivo, y siempre puede volver a tomar el chat desde el panel.
 */
export async function rescatarChatsOlvidados(
  { horas = config.pipeline.humanRescueHours, limite = 10, ahora = new Date() }: { horas?: number; limite?: number; ahora?: Date } = {},
): Promise<ResultadoAtencion[]> {
  if (!(await isBotActive())) return [];
  // NI DE MADRUGADA NI SOBRE EL ASESOR (auditoría 2-6 sep, familia H): diez
  // chats recibieron al bot entre las 21:48 y las 05:16, y en varios el asesor
  // ya había contestado por su WhatsApp (los ecos entran como OWNER y no
  // mueven `last_assistant_message_at`). El rescate corre solo en horario de
  // atención y solo si nadie —bot ni asesor— escribió después del cliente.
  const politica = await getFollowUpPolicy().catch(() => null);
  if (politica && !isWithinBusinessHours(ahora, politica)) return [];
  const filas = await sql<{ id: number; name: string | null; phone: string; cycle: number }[]>`
    update conversations c
    set assigned_to = 'bot', bot_paused_until = null, updated_at = now()
    where c.id in (
      select id from conversations
      where status = 'open'
        and assigned_to = 'human'
        and opted_out_at is null
        and negative_sentiment_at is null
        -- La pausa del asesor se respeta: si alguien acaba de tomar el chat
        -- desde el panel (pausa de BOT_PAUSE_HOURS vigente), el reloj no se lo
        -- arrebata — el mensaje viejo del cliente ya es responsabilidad suya.
        and (bot_paused_until is null or bot_paused_until <= ${ahora})
        and last_customer_message_at is not null
        and (last_assistant_message_at is null or last_assistant_message_at < last_customer_message_at)
        and last_customer_message_at <= ${ahora} - make_interval(hours => ${horas})
        and last_customer_message_at > ${ahora} - interval '24 hours'
        and not exists (
          select 1 from messages m
          where m.conversation_id = conversations.id
            and m.direction = 'outbound' and m.author_kind = 'owner'
            and m.created_at > conversations.last_customer_message_at
        )
      order by last_customer_message_at asc
      limit ${limite}
    )
    returning c.id, c.name, c.phone, c.current_cycle as cycle
  `;
  const resultados: ResultadoAtencion[] = [];
  for (const fila of filas) {
    await createBotAlert({
      conversationId: Number(fila.id),
      cycle: Number(fila.cycle),
      type: "rescate_chat_olvidado",
      priority: "medium",
      summary: `El bot retomó un chat con ${horas} h sin respuesta del asesor`,
      exactReason:
        `El chat estaba asignado a un humano y el último mensaje del cliente llevaba más de ${horas} horas ` +
        "sin respuesta. El bot lo retomó y contestó para no perder la venta.",
      suggestedAction: "Revisar la respuesta del bot; si el caso es tuyo, vuelve a tomar el chat desde el panel.",
      dedupeKey: `rescate_olvidado:${fila.id}:${fila.cycle}`,
    }).catch(() => {});
    try {
      const resultado = await resumeBotIfUnanswered(Number(fila.id));
      resultados.push({ id: Number(fila.id), nombre: fila.name, telefono: fila.phone, resultado });
    } catch (error) {
      resultados.push({
        id: Number(fila.id), nombre: fila.name, telefono: fila.phone, resultado: "error",
        detalle: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return resultados;
}

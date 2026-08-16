/**
 * La alerta de «conversación repetitiva».
 *
 * Tiene DOS fuentes y una sola puerta de salida:
 *  · el detector barato (`analizarRepeticion`), que compara texto y no entiende
 *    nada, y
 *  · el Ángel Guardián, que sí entiende la conversación y marca `repeticion`
 *    con severidad alta.
 *
 * La puerta común es `crearAlertaRepeticion`, con un tope de UNA alerta por
 * conversación por día (día de Guayaquil). El 15-ago-2026 salieron 14 en un
 * solo día porque el dedupe era por ciclo: el ciclo dura toda la venta, pero la
 * clave incluía el mensaje y la alerta se recreaba sola. Un asesor que recibe
 * 14 avisos de lo mismo deja de mirar el tab de errores, que es peor que no
 * tener alerta.
 */
import { sql } from "../db/client.js";
import { createBotAlert } from "./followUps.js";
import { analizarRepeticion } from "../domain/conversationQuality.js";
import { notifyAdvisor } from "./advisorNotifications.js";
import { diaGuayaquil } from "./visitAlerts.js";

/** Una alerta de repetición por conversación y por día. */
export function claveRepeticionDiaria(conversationId: number, fecha: Date = new Date()): string {
  return `${conversationId}:${diaGuayaquil(fecha)}:repetitive_conversation`;
}

/**
 * Crea la alerta (y avisa al asesor solo si el caso lo amerita).
 *
 * `avisarAsesor` se reserva para la doble señal — el bot lleva tres vueltas, o
 * los dos están dando vueltas. Lo demás vive en el panel: es material para
 * revisar el chat cuando haya tiempo, no para interrumpir a nadie.
 *
 * Nota: tras el Sprint 3 este evento ya no llega a los asesores de rol
 * `asesor`, solo a admins.
 */
export async function crearAlertaRepeticion(input: {
  conversationId: number;
  cycle: number;
  exactReason: string;
  suggestedAction?: string;
  fuente: "detector" | "guardian";
  avisarAsesor: boolean;
}): Promise<void> {
  const dedupeKey = claveRepeticionDiaria(input.conversationId);
  const suggestedAction = input.suggestedAction
    ?? "Revisar el chat cuando haya tiempo: el bot sigue activo y respondiendo.";
  await createBotAlert({
    conversationId: input.conversationId,
    cycle: input.cycle,
    type: "repetitive_conversation",
    // Baja de `high` a `medium`: no es un error de precio ni un chat mudo, es
    // una conversación que conviene mirar.
    priority: "medium",
    summary: input.fuente === "guardian"
      ? "Conversación repetitiva (detectada por el guardián)"
      : "Conversación repetitiva: el bot sigue operando",
    exactReason: input.exactReason,
    suggestedAction,
    dedupeKey,
  });
  if (!input.avisarAsesor) return;
  await notifyAdvisor({
    conversationId: input.conversationId,
    cycle: input.cycle,
    eventType: "repetitive_conversation",
    dedupeKey,
    title: "Conversación repetitiva",
    reason: input.exactReason,
    action: "Revisar el ticket pronto; el bot continúa activo hasta que se decida intervenir.",
  });
}

const MOTIVO: Record<string, string> = {
  bot_tres_vueltas:
    "El bot repitió la misma respuesta o pregunta en sus últimos tres mensajes; el cliente puede quedar atrapado.",
  ambos_en_bucle:
    "El bot repitió su respuesta y el cliente también está repitiendo la suya: no se están entendiendo.",
  candado_fitment:
    "El bot volvió a pedir la medida verificada (etiqueta, versión) después de haberla pedido antes.",
};

/** Alerta al asesor, sin pausar el bot, cuando la respuesta vuelve a la misma idea. */
export async function flagRepetitiveConversation(conversationId: number, candidate: string): Promise<boolean> {
  const [conversacion] = await sql<{ cycle: number }[]>`
    select current_cycle as cycle from conversations where id=${conversationId}
  `;
  if (!conversacion) return false;

  const bot = await sql<{ content: string | null }[]>`
    select content from messages
    where conversation_id=${conversationId} and cycle=${conversacion.cycle}
      and direction='outbound' and author_kind='bot'
    order by created_at desc limit 3
  `;
  if (bot.length < 2) return false;

  // Sin los mensajes del cliente no hay segunda señal, y sin segunda señal el
  // detector vuelve a ser el de los 14 falsos positivos.
  const cliente = await sql<{ content: string | null }[]>`
    select content from messages
    where conversation_id=${conversationId} and cycle=${conversacion.cycle}
      and direction='inbound'
    order by created_at desc limit 3
  `;

  const repeticion = analizarRepeticion(
    candidate,
    bot.map((row) => row.content ?? ""),
    cliente.map((row) => row.content ?? ""),
  );
  if (!repeticion) return false;

  await crearAlertaRepeticion({
    conversationId,
    cycle: conversacion.cycle,
    exactReason: MOTIVO[repeticion.regla],
    fuente: "detector",
    avisarAsesor: repeticion.doble,
  });
  return true;
}

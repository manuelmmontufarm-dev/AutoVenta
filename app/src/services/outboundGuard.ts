import { sql } from "../db/client.js";
import { createBotAlert } from "./followUps.js";
import { notifyAdvisor } from "./advisorNotifications.js";

/**
 * Guardián de salida: la última línea de defensa ANTES de enviar al cliente.
 *
 * Existe por el 5-ago: el bot le mandó a clientes reales 18 pedidos de foto,
 * tres «tuve un problema procesando» seguidos (dos idénticos) y saludos
 * repetidos a mitad de conversación — hasta que Joaquín lo apagó a mano.
 * El prompt y las tools ya están corregidos, pero un prompt es una petición al
 * modelo; esto es determinístico: aunque el modelo produzca la falla, no llega
 * al cliente, y el asesor se entera por una alerta.
 *
 * Mismo criterio que scripts/eval/rubrica.mjs y la auditoría: una sola vara.
 */

export const PREGUNTA_MEDIDA_GUARD =
  "¿Me escribe la medida que dice el filo de la llanta? Es algo como 225/65R17 — con eso le cotizo de una.";

/** Pedir foto/imagen: el bot no puede leerlas; la conversación muere ahí. */
const PIDE_FOTO =
  /(?:env[íi]\w*|m[áa]nd\w*|comp[áa]rt\w*|adjunt\w*|puede[sn]?|podr[íi]a[sn]?)[^.?!\n]{0,60}(?:foto|imagen)|foto (?:de la etiqueta|del costado|de la puerta)/i;

const APOLOGIA = /disculpa,?\s*tuve un problema procesando/i;

/** Saludo de apertura: válido solo en el primer mensaje del bot del ciclo. */
const SALUDO_INICIAL = /^\s*(?:¡\s*)?(?:hola|buen[oa]s(?:\s+(?:d[íi]as|tardes|noches))?)\s*[!.,]*\s*/i;

export type GuardIssue = "pide_foto" | "mensaje_duplicado" | "bot_atascado" | "saludo_repetido";

export interface GuardResult {
  /** Texto listo para enviar; null = no enviar nada (ya se alertó al asesor). */
  text: string | null;
  issues: GuardIssue[];
}

const normalizar = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Núcleo puro (exportado para pruebas). Reglas, en orden de gravedad:
 *
 * 1. Repetir EXACTAMENTE el último mensaje del bot → no se envía.
 * 2. Disculpa tras disculpa → no se envía (el cliente ya recibió una;
 *    la segunda es spam y la tercera espanta) y se alerta «bot atascado».
 * 3. Oraciones que piden foto → se eliminan; si el mensaje queda sin
 *    pregunta, se pide la medida escrita.
 * 4. Saludo de apertura a mitad de conversación → se recorta.
 */
export function guardOutboundReply(
  reply: string,
  lastOutbound: string | null,
  hasPriorOutbound: boolean,
): GuardResult {
  const issues: GuardIssue[] = [];

  // Antes que el duplicado genérico: dos disculpas seguidas (idénticas o no)
  // son un bot atascado — la alerta ALTA que le llega al asesor por WhatsApp.
  if (APOLOGIA.test(reply) && lastOutbound && APOLOGIA.test(lastOutbound)) {
    return { text: null, issues: ["bot_atascado"] };
  }

  if (lastOutbound && normalizar(reply) === normalizar(lastOutbound)) {
    return { text: null, issues: ["mensaje_duplicado"] };
  }

  let texto = reply;

  if (PIDE_FOTO.test(texto)) {
    issues.push("pide_foto");
    // Se elimina la oración ofensora, no el mensaje: lo demás suele ser útil.
    const lineas = texto.split("\n").map((linea) =>
      linea
        .split(/(?<=[.!?…])\s+/)
        .filter((oracion) => !PIDE_FOTO.test(oracion))
        .join(" "),
    );
    texto = lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!texto.includes("?")) {
      texto = texto ? `${texto}\n\n${PREGUNTA_MEDIDA_GUARD}` : PREGUNTA_MEDIDA_GUARD;
    }
  }

  if (hasPriorOutbound && SALUDO_INICIAL.test(texto)) {
    const sinSaludo = texto.replace(SALUDO_INICIAL, "").trim();
    if (sinSaludo.length >= 5) {
      issues.push("saludo_repetido");
      // Recapitalizar el arranque para que no quede «¿qué medida…» tras «¡Hola! »
      texto = sinSaludo.charAt(0).toUpperCase() + sinSaludo.slice(1);
    } else {
      // El mensaje ERA solo un saludo: a mitad de conversación no aporta nada.
      return { text: null, issues: [...issues, "saludo_repetido"] };
    }
  }

  return { text: texto, issues };
}

const ALERTAS: Record<GuardIssue, { priority: "high" | "medium"; summary: string; reason: string; action: string }> = {
  bot_atascado: {
    priority: "high",
    summary: "Bot atascado: dos disculpas seguidas — el cliente quedó sin respuesta",
    reason: "El bot falló dos veces seguidas procesando al cliente. La segunda disculpa NO se envió para no espantarlo, pero nadie le está respondiendo.",
    action: "Abrir el ticket y responder a mano AHORA; el cliente está esperando.",
  },
  pide_foto: {
    priority: "medium",
    summary: "El modelo intentó pedir una foto (bloqueado por el guardián)",
    reason: "El bot no puede leer imágenes; la oración se eliminó antes de enviar y se pidió la medida escrita. El prompt no debería producir esto: revisar el chat.",
    action: "Verificar que la conversación siga fluyendo; reportar el caso para ajustar el prompt.",
  },
  mensaje_duplicado: {
    priority: "medium",
    summary: "El modelo repitió exactamente el mensaje anterior (no se envió)",
    reason: "La respuesta era idéntica al último mensaje del bot; enviarla otra vez es spam.",
    action: "Revisar el ticket: el cliente puede estar esperando una respuesta distinta.",
  },
  saludo_repetido: {
    priority: "medium",
    summary: "El modelo volvió a saludar a mitad de conversación (recortado)",
    reason: "Un «¡Hola!» en medio del hilo delata al bot y confunde; el saludo se recortó antes de enviar.",
    action: "Nada urgente; queda registrado para la auditoría.",
  },
};

/**
 * Aplica el guardián con el contexto real de la conversación y alerta al
 * asesor cuando algo se bloqueó. Nunca lanza: ante cualquier error interno
 * devuelve la respuesta original (el guardián protege, no rompe el envío).
 */
export async function applyOutboundGuard(conversationId: number, reply: string): Promise<GuardResult> {
  try {
    const [row] = await sql<{ cycle: number; last_outbound: string | null }[]>`
      select c.current_cycle as cycle,
        (select content from messages
         where conversation_id = c.id and cycle = c.current_cycle
           and direction = 'outbound' and author_kind = 'bot' and type = 'text'
         order by created_at desc limit 1) as last_outbound
      from conversations c where c.id = ${conversationId}
    `;
    if (!row) return { text: reply, issues: [] };
    const result = guardOutboundReply(reply, row.last_outbound, row.last_outbound !== null);

    for (const issue of result.issues) {
      // La alerta jamás debe frenar el envío al cliente.
      void (async () => {
        try {
          await createBotAlert({
            conversationId,
            cycle: row.cycle,
            type: `guard_${issue}`,
            priority: ALERTAS[issue].priority,
            summary: ALERTAS[issue].summary,
            exactReason: ALERTAS[issue].reason,
            suggestedAction: ALERTAS[issue].action,
            dedupeKey: `${conversationId}:${row.cycle}:guard:${issue}`,
          });
          if (ALERTAS[issue].priority === "high") {
            await notifyAdvisor({
              conversationId,
              cycle: row.cycle,
              eventType: `guard_${issue}`,
              dedupeKey: `${conversationId}:${row.cycle}:guard:${issue}`,
              title: ALERTAS[issue].summary,
              reason: ALERTAS[issue].reason,
              action: ALERTAS[issue].action,
            });
          }
        } catch (error) {
          console.warn("⚠️ No se pudo alertar del guardián:", error instanceof Error ? error.message : error);
        }
      })();
    }

    return result;
  } catch (error) {
    console.warn("⚠️ Guardián de salida falló; se envía sin filtrar:", error instanceof Error ? error.message : error);
    return { text: reply, issues: [] };
  }
}

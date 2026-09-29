/**
 * ¿Este turno dejó un registro real para el asesor? Es el dato que autoriza al
 * bot a decir «ya avisé» (ver `domain/avisoAlAsesor.ts`).
 *
 * Cuenta como registro, desde que empezó el turno:
 *  · la huella de `notificar_vendedor` con `notificado: true`;
 *  · una fila en `bot_alerts` de las que el asesor atiende (no las trazas del
 *    guardián, que también nacen en el turno y no llaman a nadie);
 *  · una fila en `advisor_notifications`.
 */
import { sql } from "../db/client.js";
import type { HuellaHerramienta } from "./guardian.js";
import { TIPO_CLIENTE_SIN_RESPUESTA } from "../domain/turnoDelHumano.js";
import { createBotAlert } from "./followUps.js";
import { notifyAdvisor } from "./advisorNotifications.js";

const ALERTAS_QUE_ESCALAN = [
  "human_requested",
  "customer_ready_to_buy",
  "envio_fuera_de_cobertura",
  "caso_sin_resolver",
  "visita_comprometida",
  "advisor_follow_up",
  TIPO_CLIENTE_SIN_RESPUESTA,
];

/** Sin inicio conocido, el turno se mide hacia atrás desde ahora. */
const TURNO_POR_DEFECTO_MS = 5 * 60_000;

export async function avisoRegistradoEnElTurno(
  conversationId: number,
  inicioDelTurno: Date | undefined,
  huella: readonly HuellaHerramienta[] = [],
): Promise<boolean> {
  if (huella.some((h) => h.herramienta === "notificar_vendedor" && /"notificado"\s*:\s*true/.test(h.resultado))) {
    return true;
  }
  const desde = inicioDelTurno ?? new Date(Date.now() - TURNO_POR_DEFECTO_MS);
  const [fila] = await sql<{ hay: boolean }[]>`
    select (
      exists (
        select 1 from bot_alerts
        where conversation_id = ${conversationId} and type = any(${ALERTAS_QUE_ESCALAN})
          and created_at >= ${desde}
      )
      or exists (
        select 1 from advisor_notifications
        where conversation_id = ${conversationId} and created_at >= ${desde}
      )
    ) as hay
  `;
  return Boolean(fila?.hay);
}

/**
 * La consulta que el texto promete («Se lo consulto y le confirmo»), hecha de
 * verdad: alerta alta en el Hub y aviso por WhatsApp. Una por ciclo.
 */
export async function registrarConsultaPrometida(
  conversation: { id: number; current_cycle: number },
  textoDelCliente: string | null,
  loQueSeLeDijo: string,
): Promise<void> {
  const dedupeKey = `consulta_prometida:${conversation.id}:${conversation.current_cycle}`;
  const motivo = `Al cliente se le dijo: «${loQueSeLeDijo.slice(0, 200)}». Último mensaje del cliente: «${(textoDelCliente ?? "").slice(0, 200)}»`;
  await createBotAlert({
    conversationId: conversation.id,
    cycle: conversation.current_cycle,
    type: "caso_sin_resolver",
    priority: "high",
    summary: "El bot le prometió al cliente consultarlo con un asesor",
    exactReason: motivo,
    suggestedAction: "Contestarle lo que preguntó; el cliente está esperando esa confirmación.",
    dedupeKey,
  });
  await notifyAdvisor({
    conversationId: conversation.id,
    cycle: conversation.current_cycle,
    eventType: "caso_sin_resolver",
    dedupeKey,
    title: "El bot le dijo que lo consulta con un asesor",
    reason: motivo,
    action: "Revisa la conversación y contéstale.",
  });
}

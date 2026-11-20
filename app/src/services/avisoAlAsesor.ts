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
import { cantidadGrandePedida, pidePrecioPorVolumen } from "../domain/cantidadGrande.js";

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

/** Las alertas de escalamiento: un caso que un asesor tiene que tomar (no la visita ni la cotización). */
const ESCALAMIENTOS = [
  "human_requested",
  "customer_ready_to_buy",
  "envio_fuera_de_cobertura",
  "caso_sin_resolver",
  TIPO_CLIENTE_SIN_RESPUESTA,
];

/**
 * ¿YA SE LE PASÓ EL CASO A UN ASESOR EN ESTE CICLO? (simulador Competimotor,
 * 18-nov, CM04 3/3 y CM05 2/3: `notificar_vendedor` corrió dos veces.)
 *
 * El agente solo miraba `advisor_notifications`. Con un perfil cuyos asesores
 * no reciben ese tipo de aviso por WhatsApp (Competimotor: solo ventas y
 * visitas), `notifyAdvisor` no inserta fila aunque la alerta del Hub SÍ quedó;
 * el agente creía que nunca se avisó y en el turno siguiente le ordenaba al
 * modelo «OFRECISTE ASESOR Y NO LO NOTIFICASTE… llama notificar_vendedor AHORA».
 * La alerta de escalamiento del ciclo también es el aviso.
 */
export async function avisoRegistradoEnElCiclo(conversationId: number, cycle: number): Promise<boolean> {
  const [fila] = await sql<{ hay: boolean }[]>`
    select (
      exists (
        select 1 from bot_alerts
        where conversation_id = ${conversationId} and cycle = ${cycle} and type = any(${ESCALAMIENTOS})
      )
      or exists (
        select 1 from advisor_notifications
        where conversation_id = ${conversationId} and cycle = ${cycle}
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
  // La MISMA llave que `notificar_vendedor` con motivo caso_sin_resolver: si el
  // modelo ya escaló este caso en el ciclo, la consulta prometida no abre otra
  // alerta ni manda otro WhatsApp (CM29: dos `caso_sin_resolver` por lo mismo).
  const dedupeKey = `${conversation.id}:${conversation.current_cycle}:caso_sin_resolver`;
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

/**
 * El precio por volumen de una compra grande lo da un asesor: alerta alta y
 * aviso, con la MISMA llave que `notificar_vendedor` caso_sin_resolver (si el
 * modelo también lo escala, no se duplica). Simulador Competimotor 18-nov, CM35.
 * Devuelve true si correspondía (el caso queda registrado en el ciclo).
 */
export async function avisarPrecioPorVolumen(
  conversation: { id: number; current_cycle: number },
  textoDelCliente: string,
): Promise<boolean> {
  const [ficha] = await sql<{ selected_quantity: number | null }[]>`
    select selected_quantity from conversations where id=${conversation.id}
  `;
  if (!pidePrecioPorVolumen(textoDelCliente, ficha?.selected_quantity ?? null)) return false;
  const cantidad = cantidadGrandePedida(textoDelCliente) ?? ficha?.selected_quantity ?? null;
  const dedupeKey = `${conversation.id}:${conversation.current_cycle}:caso_sin_resolver`;
  const resumen = `Pide precio especial por volumen${cantidad ? ` (${cantidad} llantas)` : ""}: «${textoDelCliente.slice(0, 200)}»`;
  await createBotAlert({
    conversationId: conversation.id,
    cycle: conversation.current_cycle,
    type: "caso_sin_resolver",
    priority: "high",
    summary: resumen,
    exactReason: "Compra grande con pregunta por precio especial: el bot no tiene precio de volumen y no puede prometerlo.",
    suggestedAction: "Contestarle el precio por volumen (o decirle que es el de lista) y cerrar la compra.",
    dedupeKey,
  });
  await notifyAdvisor({
    conversationId: conversation.id,
    cycle: conversation.current_cycle,
    eventType: "caso_sin_resolver",
    dedupeKey,
    title: "Pide precio por volumen",
    reason: resumen,
    action: "Contestarle el precio por volumen y cerrar la compra.",
  });
  return true;
}

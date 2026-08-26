import type { Stage } from "./pipeline.js";

export type FollowUpMessageKind =
  | "in_window_first"
  | "in_window_second"
  | "post_window"
  | "advisor_review";

export interface FollowUpMessageContext {
  name?: string | null;
  stage: Stage;
  tireSize?: string | null;
  selectedProductCode?: string | null;
  nearestStore?: string | null;
  customerCommitment?: string | null;
  /**
   * El día que el cliente dijo que viene, ya interpretado (conversations.visit_date).
   * Sin este dato el seguimiento volvía a preguntar «¿qué día te queda mejor?»
   * a quien ya había contestado «el viernes» — la amnesia que Manuel cazó el
   * 18-ago en el chat de +593 99 874 7699.
   */
  visitDate?: Date | null;
  quoteNumber?: string | null;
  activeDiscountAmount?: number | null;
  activeDiscountCondition?: string | null;
  activeDiscountFinalTotal?: number | null;
  /**
   * El bloque de mapas ya armado por quien llama (`buildStoreLinksBlock`): los
   * dos locales, o solo el suyo si ya eligió. Llega hecho para que este módulo
   * siga siendo dominio puro — aquí no se sabe qué locales tiene el negocio.
   */
  storeLinks?: string | null;
}

/**
 * ¿Este seguimiento tiene que llevar los mapas pegados?
 *
 * Joaquín, 25-ago: «si a las ~3 horas no contesta, que el seguimiento mande las
 * ubicaciones (los dos links)». El caso es el cliente que recibió la cotización
 * y la pregunta por día y local, y no contestó ninguna de las dos: mandarle otra
 * vez la pregunta pelada no le agrega nada — los mapas sí, porque el dato que le
 * falta para contestar es justamente dónde queda cada local.
 *
 * Sí se repiten a propósito, aunque ya hayan salido con la pregunta. Ese es el
 * punto: el turno anterior no logró respuesta.
 *
 * Condiciones: solo en ventana (fuera de ella manda una plantilla de Meta, con
 * su copy fijo), solo con cotización viva —sin cotización todavía no hay visita
 * que coordinar y el mapa es ruido— y solo si falta el local o el día. Con los
 * dos datos en la mano el portón `visita_agendada` ni siquiera deja salir el
 * seguimiento.
 */
export function followUpNeedsStoreLinks(
  context: FollowUpMessageContext,
  kind: FollowUpMessageKind,
): boolean {
  if (kind !== "in_window_first" && kind !== "in_window_second") return false;
  if (!context.storeLinks?.trim()) return false;
  if (!context.quoteNumber) return false;
  return !context.nearestStore || !context.visitDate;
}

/** Extrae un código de modelo escrito explícitamente por un asesor (ej. R380, KR33A). */
export function inferProductCode(text?: string | null): string | null {
  if (!text) return null;
  const candidates = text.toUpperCase().match(/\b[A-Z][A-Z0-9-]{2,14}\b/g) ?? [];
  return candidates.reverse().find((value) =>
    /\d/.test(value) && !/^R\d{2}$/.test(value) && !/^(?:USD|IVA)\d*$/.test(value)
  ) ?? null;
}

function firstName(name?: string | null): string | null {
  const value = name?.trim().split(/\s+/)[0];
  return value && value.length <= 30 ? value : null;
}

function questionPrefix(context: FollowUpMessageContext, kind: FollowUpMessageKind): string {
  const name = firstName(context.name);
  // Solo el contacto tardío vuelve a usar un saludo; dentro de una conversación
  // activa se continúa el hilo sin reiniciar la conversación.
  return kind === "post_window" && name ? `Hola, ${name} 👋 ` : "";
}

/** «viernes 22 de agosto», en hora de Ecuador: el cliente lee días, no ISO. */
function diaVisita(fecha: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long",
    day: "numeric",
    month: "long",
    // Sin la coma que mete Intl («viernes, 22 de agosto»): en un WhatsApp se
    // escribe como se dice.
  }).format(fecha).replace(",", "");
}

export function buildContextualFollowUpMessage(
  context: FollowUpMessageContext,
  kind: FollowUpMessageKind,
  now = new Date(),
): string {
  const texto = redactarSeguimiento(context, kind, now);
  return followUpNeedsStoreLinks(context, kind)
    ? `${texto}\n${context.storeLinks!.trim()}`
    : texto;
}

function redactarSeguimiento(
  context: FollowUpMessageContext,
  kind: FollowUpMessageKind,
  now: Date,
): string {
  const prefix = questionPrefix(context, kind);
  const size = context.tireSize ? ` ${context.tireSize}` : "";
  const product = context.selectedProductCode ? ` ${context.selectedProductCode}` : "";

  if (kind === "advisor_review") {
    const detail = context.customerCommitment
      ? `Prometió: “${context.customerCommitment}”.`
      : context.quoteNumber
        ? `Tiene la cotización ${context.quoteNumber} pendiente.`
        : `La conversación quedó en ${context.stage.replaceAll("_", " ")}.`;
    return `Revisar personalmente: ${detail} Decidir si conviene continuar la conversación o marcarla como Perdida; nunca cerrarla automáticamente.`;
  }

  if (context.activeDiscountAmount && context.activeDiscountCondition && context.activeDiscountFinalTotal) {
    const amount = context.activeDiscountAmount.toFixed(2);
    const total = context.activeDiscountFinalTotal.toFixed(2);
    return kind === "in_window_second"
      ? `😊 Recuerda que tienes $${amount} de descuento EXTRA sobre el precio base. Este segundo descuento aplica únicamente si ${context.activeDiscountCondition}; cumpliéndolo, el total queda en $${total}.${context.quoteNumber ? ` Preséntalo con la cotización ${context.quoteNumber}.` : ""} ¿Te ayudo a coordinarlo?`
      : `${prefix}✨ Tienes $${amount} de descuento EXTRA sobre el precio base. Para recibir este segundo descuento debes cumplir: ${context.activeDiscountCondition}; así el total queda en $${total}.${context.quoteNumber ? ` Preséntalo con la cotización ${context.quoteNumber}.` : ""} ¿Coordinamos el siguiente paso?`;
  }

  if (context.customerCommitment || context.stage === "seguimiento_venta") {
    const commitment = context.customerCommitment ? ` lo que me comentaste: “${context.customerCommitment}”` : " tu visita";
    const store = context.nearestStore ? ` a ${context.nearestStore}` : "";
    const enStore = context.nearestStore ? ` en ${context.nearestStore}` : "";
    const visita = context.visitDate ?? null;
    const yaPaso = visita ? visita.getTime() < now.getTime() : false;

    // Día Y local ya confirmados, y el día todavía no llega: no queda NADA que
    // preguntar. Preguntarlo igual es lo que hace que el bot parezca no haber
    // leído la conversación. (El worker además cancela estos envíos —ver el
    // portón «visita_agendada» en followUpProcessor—; este texto es el que ve
    // el asesor en el panel y el que sale si el envío se fuerza a mano.)
    if (visita && !yaPaso && context.nearestStore) {
      return kind === "in_window_second"
        ? `🏁 Quedamos el ${diaVisita(visita)}${enStore}. Si te queda mejor otro día, dime y lo movemos 😊`
        : `${prefix}✅ Tu visita${enStore} quedó anotada para el ${diaVisita(visita)}. ¿Te ayudo con algo antes de que pases?`;
    }

    // El día llegó y pasó sin que viniera. Aquí volver a preguntar SÍ es nuevo:
    // lo que se pide es una fecha distinta, y se dice por qué.
    if (yaPaso && visita) {
      return kind === "in_window_second"
        ? `🚗 Te esperábamos el ${diaVisita(visita)}${enStore} y no pudimos atenderte. ¿Te reagendo para otro día? 😊`
        : `${prefix}😊 Quedamos para el ${diaVisita(visita)}${enStore} y no alcanzaste a pasar. ¿Qué día te queda mejor y lo dejo anotado?`;
    }

    // Dijo que viene pero sin día exacto («esta semana»), o falta el local.
    return kind === "in_window_second"
      ? `🚗 Me quedé pendiente de${commitment}. ¿Qué día te quedaría más cómodo para coordinar${store}? 😊`
      : `${prefix}😊 Sobre${commitment}, ¿te ayudo a dejar lista la visita o reserva${store}?`;
  }

  if (context.stage === "cotizacion_enviada") {
    const quote = context.quoteNumber ? ` ${context.quoteNumber}` : "";
    return kind === "in_window_second"
      ? `🛞 Solo quería saber qué te pareció la opción${product || size} de la cotización${quote}. ¿Hay algo que quieras revisar antes de decidir? 😊`
      : `${prefix}📄 ¿Qué te pareció la cotización${quote}${size}? Si quieres, revisamos juntos cualquier duda para que elijas tranquilo 😊`;
  }

  if (context.stage === "seleccionando" || context.selectedProductCode) {
    return kind === "in_window_second"
      ? `😊 De las opciones que vimos${size}, ¿cuál te gustó más? Si me cuentas qué priorizas, te ayudo a decidir.`
      : `${prefix}🛞 ¿Cómo viste la opción${product}${size}? También puedo ayudarte a compararla con la otra alternativa 😊`;
  }

  if (context.stage === "medida_confirmada") {
    return kind === "in_window_second"
      ? `😊 Ya con la medida${size} estamos cerca. ¿Prefieres priorizar duración, comodidad o precio?`
      : `${prefix}🛞 Ya tengo tu medida${size}. ¿Te ayudo a elegir la mejor opción según el uso que le das y tu presupuesto?`;
  }

  return kind === "in_window_second"
    ? "😊 Solo me falta la medida de la llanta para ayudarte bien. ¿Me la compartes cuando puedas?"
    : `${prefix}👋 Para recomendarte opciones reales, ¿me confirmas la medida que aparece en el costado de tu llanta?`;
}

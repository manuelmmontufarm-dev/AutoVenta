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
  quoteNumber?: string | null;
  activeDiscountAmount?: number | null;
  activeDiscountCondition?: string | null;
  activeDiscountFinalTotal?: number | null;
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

export function buildContextualFollowUpMessage(
  context: FollowUpMessageContext,
  kind: FollowUpMessageKind,
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

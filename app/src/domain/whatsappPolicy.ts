import { WHATSAPP_WINDOW_MS } from "./followUps.js";

export type OutboundContentType = "text" | "image" | "pdf" | "template";
export type OutboundActor = "bot" | "owner" | "worker" | "authorized_campaign";

export interface OutboundPolicyInput {
  contentType: OutboundContentType;
  actor: OutboundActor;
  now: Date;
  status: "open" | "closed";
  assignedTo: "bot" | "human";
  lastCustomerMessageAt: Date | null;
  optedOutAt: Date | null;
  negativeSentimentAt: Date | null;
  customerOptIn: boolean;
  requireConsent: boolean;
  respectOptOut: boolean;
  pauseOnHumanControl: boolean;
}

export interface OutboundDecision {
  allowed: boolean;
  code: "allowed_free_form" | "allowed_template" | "conversation_closed" | "opted_out" | "negative_sentiment" | "human_control" | "no_customer_window" | "window_closed" | "consent_required";
  windowClosesAt: Date | null;
}

export function evaluateOutboundPolicy(input: OutboundPolicyInput): OutboundDecision {
  const windowClosesAt = input.lastCustomerMessageAt
    ? new Date(input.lastCustomerMessageAt.getTime() + WHATSAPP_WINDOW_MS)
    : null;
  if (input.status !== "open") return { allowed: false, code: "conversation_closed", windowClosesAt };
  // EL OPT-OUT PROHÍBE BUSCAR AL CLIENTE, NO CONTESTARLE (7-sep-2026).
  //
  // «No me escriba más» / «cállese» es consentimiento sobre los mensajes que
  // salen SOLOS: seguimientos, campañas, plantillas. Si el cliente vuelve a
  // escribir DESPUÉS de pedir la baja, está abriendo él la conversación y se
  // le contesta como a cualquiera. Con la prohibición total, cuatro chats
  // quedaron mudos para siempre (1245, 2006, 14687 y el de pruebas de
  // Manuel, al que ni el /restart devolvía la voz): el mensaje se redactaba,
  // la política lo bloqueaba y el cliente no veía nada.
  //
  // La regla: un texto libre se permite si el último mensaje del cliente es
  // POSTERIOR al opt-out (o a la molestia). El mismo turno en que lo pidió
  // sigue callado, porque `opted_out_at` se pone después de guardar ese
  // mensaje. Las plantillas siguen pidiendo consentimiento.
  const volvioAEscribir = (desde: Date) =>
    input.contentType !== "template" && !!input.lastCustomerMessageAt && input.lastCustomerMessageAt > desde;
  if (input.respectOptOut && input.optedOutAt && !volvioAEscribir(input.optedOutAt)) {
    return { allowed: false, code: "opted_out", windowClosesAt };
  }
  if (input.negativeSentimentAt && !volvioAEscribir(input.negativeSentimentAt)) {
    return { allowed: false, code: "negative_sentiment", windowClosesAt };
  }
  if (input.actor !== "owner" && input.actor !== "authorized_campaign" && input.pauseOnHumanControl && input.assignedTo === "human") {
    return { allowed: false, code: "human_control", windowClosesAt };
  }
  if (input.contentType === "template") {
    if (input.requireConsent && !input.customerOptIn) {
      return { allowed: false, code: "consent_required", windowClosesAt };
    }
    return { allowed: true, code: "allowed_template", windowClosesAt };
  }
  if (!windowClosesAt) return { allowed: false, code: "no_customer_window", windowClosesAt };
  if (input.now >= windowClosesAt) return { allowed: false, code: "window_closed", windowClosesAt };
  return { allowed: true, code: "allowed_free_form", windowClosesAt };
}

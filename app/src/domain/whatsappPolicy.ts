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
  if (input.respectOptOut && input.optedOutAt) return { allowed: false, code: "opted_out", windowClosesAt };
  if (input.negativeSentimentAt) return { allowed: false, code: "negative_sentiment", windowClosesAt };
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

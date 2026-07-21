import { sql } from "../db/client.js";
import {
  evaluateOutboundPolicy,
  type OutboundActor,
  type OutboundContentType,
  type OutboundDecision,
} from "../domain/whatsappPolicy.js";
export { evaluateOutboundPolicy } from "../domain/whatsappPolicy.js";
export type { OutboundActor, OutboundContentType, OutboundDecision } from "../domain/whatsappPolicy.js";

export async function authorizeConversationOutbound(input: {
  conversationId: number;
  contentType: OutboundContentType;
  actor: OutboundActor;
  now?: Date;
}): Promise<OutboundDecision> {
  const [row] = await sql<{
    status: "open" | "closed";
    assigned_to: "bot" | "human";
    last_customer_message_at: Date | null;
    opted_out_at: Date | null;
    negative_sentiment_at: Date | null;
    customer_opt_in: boolean;
    require_consent: boolean;
    respect_opt_out: boolean;
    pause_on_human_control: boolean;
  }[]>`
    select c.status, c.assigned_to, c.last_customer_message_at,
      c.opted_out_at, c.negative_sentiment_at, c.customer_opt_in,
      p.require_consent, p.respect_opt_out, p.pause_on_human_control
    from conversations c cross join follow_up_policies p
    where c.id = ${input.conversationId} and p.policy_key = 'default'
  `;
  if (!row) return { allowed: false, code: "conversation_closed", windowClosesAt: null };
  return evaluateOutboundPolicy({
    contentType: input.contentType,
    actor: input.actor,
    now: input.now ?? new Date(),
    status: row.status,
    assignedTo: row.assigned_to,
    lastCustomerMessageAt: row.last_customer_message_at,
    optedOutAt: row.opted_out_at,
    negativeSentimentAt: row.negative_sentiment_at,
    customerOptIn: row.customer_opt_in,
    requireConsent: row.require_consent,
    respectOptOut: row.respect_opt_out,
    pauseOnHumanControl: row.pause_on_human_control,
  });
}

export class OutboundPolicyError extends Error {
  constructor(public readonly decision: OutboundDecision) {
    super(`Envío bloqueado por política de WhatsApp: ${decision.code}`);
  }
}

export async function assertConversationOutbound(input: {
  conversationId: number;
  contentType: OutboundContentType;
  actor: OutboundActor;
  now?: Date;
}): Promise<OutboundDecision> {
  const decision = await authorizeConversationOutbound(input);
  if (!decision.allowed) throw new OutboundPolicyError(decision);
  return decision;
}

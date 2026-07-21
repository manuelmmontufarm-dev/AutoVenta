import { TZDate } from "@date-fns/tz";
import { sql } from "../db/client.js";
import { followUpTemplateForStage } from "../domain/followUps.js";
import { isStage } from "../domain/pipeline.js";
import { cancelPendingFollowUps } from "./followUps.js";
import { emitLiveEvent } from "./liveEvents.js";

interface CampaignContext {
  id: number; current_cycle: number; stage: string; status: string;
  customer_opt_in: boolean; opted_out_at: Date | null; negative_sentiment_at: Date | null;
  last_customer_message_at: Date | null;
  visit_date: Date | null; quote_number: string | null;
}

interface TemplateConfig {
  template_key: string; template_name: string | null; language: string;
  preview: string; approval_status: string; configured: boolean;
}

export interface TemplatePlanDay {
  day: number; dueAt: string; templateKey: string; templateName: string;
  language: string; preview: string;
}

function planDates(start: Date, timezone: string, time: string, businessHours: Record<string, unknown>, days: number): Date[] {
  const local = new TZDate(start, timezone);
  const [hour, minute] = time.split(":").map(Number);
  const dates: Date[] = [];
  for (let offset = 0; dates.length < days && offset < 32; offset += 1) {
    const candidate = new TZDate(local.getFullYear(), local.getMonth(), local.getDate() + offset, hour, minute, 0, timezone);
    if (!businessHours[String(candidate.getDay())]) continue;
    if (candidate <= start) continue;
    dates.push(new Date(candidate.getTime()));
  }
  return dates;
}

export async function previewAdvisorTemplatePlan(conversationId: number, now = new Date()): Promise<{
  allowed: boolean; reason: string | null; days: TemplatePlanDay[]; template: TemplateConfig | null;
}> {
  const [conversation, policy] = await Promise.all([
    sql<CampaignContext[]>`select c.id, c.current_cycle, c.stage, c.status, c.customer_opt_in, c.opted_out_at,
      c.negative_sentiment_at, c.last_customer_message_at, c.visit_date,
      (select q.quote_number from quotes q where q.conversation_id=c.id and q.cycle=c.current_cycle order by q.created_at desc limit 1) as quote_number
      from conversations c where c.id=${conversationId}`.then((r) => r[0]),
    sql<{ timezone: string; template_follow_up_days: number; template_send_time: string; business_hours: Record<string, unknown> }[]>`
      select timezone, template_follow_up_days, template_send_time, business_hours
      from follow_up_policies where policy_key='default'`.then((r) => r[0]),
  ]);
  if (!conversation || !policy || !isStage(conversation.stage)) return { allowed: false, reason: "Conversación no encontrada", days: [], template: null };
  const key = conversation.visit_date ? "recordatorio_visita_v1"
    : conversation.quote_number ? "seguimiento_cotizacion_v1"
      : followUpTemplateForStage(conversation.stage);
  const [template] = await sql<TemplateConfig[]>`select template_key, template_name, language, preview,
    approval_status, configured from follow_up_templates where template_key=${key}`;
  const start = conversation.last_customer_message_at
    ? new Date(Math.max(now.getTime(), conversation.last_customer_message_at.getTime() + 24 * 60 * 60 * 1000))
    : now;
  const dueDates = planDates(start, policy.timezone, policy.template_send_time, policy.business_hours, policy.template_follow_up_days);
  const reason = conversation.status !== "open" ? "La conversación está cerrada"
    : conversation.opted_out_at ? "El cliente pidió no recibir mensajes"
      : conversation.negative_sentiment_at ? "La conversación está pausada por molestia"
        : !conversation.customer_opt_in ? "Falta consentimiento para plantillas post-24 h"
          : !template?.configured || template.approval_status !== "approved" || !template.template_name
            ? `La plantilla ${key} aún no está configurada y aprobada por Meta`
            : null;
  return {
    allowed: !reason,
    reason,
    template: template ?? null,
    days: dueDates.map((dueAt, index) => ({ day: index + 1, dueAt: dueAt.toISOString(),
      templateKey: key, templateName: template?.template_name ?? key, language: template?.language ?? "es",
      preview: template?.preview ?? "Plantilla pendiente de configurar" })),
  };
}

export async function authorizeAdvisorTemplatePlan(conversationId: number, now = new Date()) {
  const plan = await previewAdvisorTemplatePlan(conversationId, now);
  if (!plan.allowed || !plan.template) throw new Error(plan.reason ?? "El plan no puede autorizarse");
  const [conversation] = await sql<{ current_cycle: number }[]>`select current_cycle from conversations where id=${conversationId}`;
  if (!conversation) throw new Error("Conversación no encontrada");
  await cancelPendingFollowUps(conversationId, "advisor_template_plan_replaced", conversation.current_cycle);
  const campaignId = await sql.begin(async (tx) => {
    await tx`update follow_up_campaigns set status='cancelled', cancelled_at=${now}, cancel_reason='replaced'
      where conversation_id=${conversationId} and cycle=${conversation.current_cycle} and status='active'`;
    const [campaign] = await tx<{ id: number }[]>`
      insert into follow_up_campaigns (conversation_id, cycle, template_key, days, starts_at)
      values (${conversationId}, ${conversation.current_cycle}, ${plan.template!.template_key}, ${plan.days.length}, ${new Date(plan.days[0].dueAt)})
      returning id
    `;
    for (const day of plan.days) {
      await tx`insert into follow_up_jobs (
        conversation_id, cycle, type, channel, due_at, window_closes_at, idempotency_key, payload
      ) values (
        ${conversationId}, ${conversation.current_cycle}, ${`advisor_template_day_${day.day}`}, 'whatsapp',
        ${new Date(day.dueAt)}, null, ${`campaign:${campaign.id}:day:${day.day}`},
        ${sql.json({ campaignId: Number(campaign.id), day: day.day, templateKey: day.templateKey,
          preview: day.preview, authorizedBy: "owner", stage: null } as never)}
      ) on conflict (idempotency_key) do nothing`;
    }
    return Number(campaign.id);
  });
  emitLiveEvent("follow_up", conversationId);
  emitLiveEvent("sync", conversationId);
  return { campaignId, ...plan };
}

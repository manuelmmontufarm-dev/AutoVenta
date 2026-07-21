import { sql } from "../db/client.js";
import { isWithinBusinessHours } from "../domain/followUps.js";
import { appendMessage } from "./conversations.js";
import {
  createBotAlert,
  getFollowUpJobContext,
  getFollowUpPolicy,
  markFollowUpJobCancelled,
  type FollowUpJob,
} from "./followUps.js";
import { authorizeConversationOutbound } from "./whatsappPolicy.js";
import { emitLiveEvent } from "./liveEvents.js";
import { sendApprovedTemplate, sendCustomerText } from "../wa/client.js";

interface ProcessorDependencies {
  now?: () => Date;
  sendText?: (conversationId: number, phone: string, body: string) => Promise<string | undefined>;
  sendTemplate?: (input: {
    conversationId: number;
    to: string;
    templateName: string;
    language: string;
    variables: string[];
    attemptId: number;
  }) => Promise<string | undefined>;
}

interface FollowUpTemplateRow {
  template_name: string | null;
  language: string;
  variables: string[];
  approval_status: string;
  configured: boolean;
  automatic_send: boolean;
}

function templateVariables(
  keys: string[],
  context: Record<string, unknown>,
): { values: string[]; missing: string[] } {
  const missing: string[] = [];
  const values = keys.map((key) => {
    if (key === "customer_name") return String(context.name ?? "Cliente");
    if (key === "quote_number") {
      if (!context.quote_number) missing.push(key);
      return String(context.quote_number ?? "");
    }
    if (key === "visit_date") {
      const value = context.visit_date;
      if (!(value instanceof Date)) missing.push(key);
      return value instanceof Date ? value.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : "";
    }
    if (key === "store") {
      if (!context.nearest_store) missing.push(key);
      return String(context.nearest_store ?? "");
    }
    if (key === "tire_size") {
      if (!context.tire_size) missing.push(key);
      return String(context.tire_size ?? "");
    }
    missing.push(key);
    return "";
  });
  return { values, missing };
}

export async function processFollowUpJob(
  job: FollowUpJob,
  dependencies: ProcessorDependencies = {},
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  const context = await getFollowUpJobContext(job.id);
  if (!context || context.job_status !== "processing") return;
  if (context.status !== "open" || context.current_cycle !== context.job_cycle) {
    await markFollowUpJobCancelled(job.id, "obsolete_cycle_or_closed");
    return;
  }
  if (context.assigned_to === "human" || context.opted_out_at || context.negative_sentiment_at) {
    await markFollowUpJobCancelled(job.id, "safety_state_changed");
    return;
  }
  if (context.job_payload.stage && context.job_payload.stage !== context.stage) {
    await markFollowUpJobCancelled(job.id, "stage_changed");
    return;
  }

  const policy = await getFollowUpPolicy();
  if (policy.neverOutsideHours && !isWithinBusinessHours(now, policy)) {
    await markFollowUpJobCancelled(job.id, "outside_business_hours");
    return;
  }
  const sentToday = await sql<{ count: number }[]>`
    select count(*)::int as count from follow_up_attempts
    where conversation_id = ${context.id} and status in ('sent', 'delivered', 'read')
      and (created_at at time zone ${policy.timezone})::date =
        (${now}::timestamptz at time zone ${policy.timezone})::date
  `;
  if (sentToday[0].count >= policy.maxMessagesPerDay) {
    await markFollowUpJobCancelled(job.id, "daily_message_limit");
    return;
  }

  const isPostWindow = context.job_type.startsWith("post_window_");
  const contentType = isPostWindow ? "template" : "text";
  const decision = await authorizeConversationOutbound({
    conversationId: context.id,
    contentType,
    actor: "worker",
    now,
  });
  if (!decision.allowed) {
    await markFollowUpJobCancelled(job.id, decision.code);
    return;
  }

  let template: FollowUpTemplateRow | null = null;
  let resolvedTemplateVariables: string[] = [];
  if (isPostWindow) {
    const templateKey = String(context.job_payload.templateKey ?? "");
    const [row] = await sql<FollowUpTemplateRow[]>`
      select template_name, language, variables, approval_status, configured, automatic_send
      from follow_up_templates where template_key = ${templateKey}
    `;
    template = row ?? null;
    if (
      !template?.template_name ||
      !template.configured ||
      template.approval_status !== "approved" ||
      !template.automatic_send
    ) {
      await sql`
        update follow_up_jobs set status = 'blocked',
          cancel_reason = 'template_not_approved_or_requires_human',
          locked_at = null, locked_by = null
        where id = ${job.id}
      `;
      await createBotAlert({
        conversationId: context.id,
        cycle: context.current_cycle,
        type: "template_required",
        priority: "high",
        summary: "Ventana cerrada: se requiere una plantilla aprobada",
        exactReason: `Plantilla ${templateKey || "sin seleccionar"} no configurada, no aprobada o requiere aprobación humana.`,
        suggestedAction: "Configurar/aprobar la plantilla en Meta o enviarla manualmente como plantilla.",
        dedupeKey: `${context.id}:${context.current_cycle}:template_required:${templateKey}`,
      });
      emitLiveEvent("follow_up", context.id);
      return;
    }
    const resolved = templateVariables(
      template.variables,
      context as unknown as Record<string, unknown>,
    );
    if (resolved.missing.length > 0) {
      await sql`
        update follow_up_jobs set status = 'blocked',
          cancel_reason = 'template_variables_missing', locked_at = null, locked_by = null
        where id = ${job.id}
      `;
      await createBotAlert({
        conversationId: context.id,
        cycle: context.current_cycle,
        type: "template_required",
        priority: "high",
        summary: "Plantilla bloqueada por contexto incompleto",
        exactReason: `Faltan variables reales: ${resolved.missing.join(", ")}.`,
        suggestedAction: "Completar los datos comerciales reales antes de aprobar el envío.",
        dedupeKey: `${context.id}:${context.current_cycle}:template_variables_missing:${job.id}`,
      });
      emitLiveEvent("follow_up", context.id);
      return;
    }
    resolvedTemplateVariables = resolved.values;
  }

  const attemptNumber = context.attempt_count + 1;
  const [attempt] = await sql<{ id: number }[]>`
    insert into follow_up_attempts (
      job_id, conversation_id, cycle, attempt_number, status,
      message_type, template_name, payload
    ) values (
      ${job.id}, ${context.id}, ${context.current_cycle}, ${attemptNumber}, 'sending',
      ${contentType}, ${template?.template_name ?? null}, ${sql.json(context.job_payload as never)}
    ) on conflict (job_id, attempt_number) do update set status = 'sending'
    returning id
  `;
  await sql`update follow_up_jobs set attempt_count = ${attemptNumber} where id = ${job.id}`;

  try {
    const preview = String(context.job_payload.preview ?? "").trim();
    const providerId = isPostWindow
      ? await (dependencies.sendTemplate ?? sendApprovedTemplate)({
          conversationId: context.id,
          to: context.phone,
          templateName: template!.template_name!,
          language: template!.language,
          variables: resolvedTemplateVariables,
          attemptId: Number(attempt.id),
        })
      : await (dependencies.sendText ?? ((id, phone, body) => sendCustomerText(id, phone, body, "worker")))(
          context.id,
          context.phone,
          preview,
        );
    const content = isPostWindow
      ? `[Plantilla ${template!.template_name}]`
      : preview;
    await appendMessage(context.id, "assistant", content, providerId, {
      authorKind: "bot",
      status: "sent",
      metadata: { followUpJobId: job.id, followUpAttemptId: Number(attempt.id) },
      occurredAt: now,
    });
    await sql.begin(async (tx) => {
      await tx`
        update follow_up_attempts set status = 'sent', provider_message_id = ${providerId ?? null}, sent_at = ${now}
        where id = ${attempt.id}
      `;
      await tx`
        update follow_up_jobs set status = 'sent', executed_at = ${now},
          locked_at = null, locked_by = null, last_error = null
        where id = ${job.id}
      `;
    });
    emitLiveEvent("message", context.id);
    emitLiveEvent("follow_up", context.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const retryable = /\b(?:429|rate.?limit|temporar|503|502)\b/i.test(message);
    const canRetry = retryable && attemptNumber < 3;
    const backoffMinutes = attemptNumber === 1 ? 1 : 5;
    await sql.begin(async (tx) => {
      await tx`
        update follow_up_attempts set status = 'failed', error = ${message.slice(0, 1000)}, failed_at = ${now}
        where id = ${attempt.id}
      `;
      await tx`
        update follow_up_jobs set
          status = ${canRetry ? "scheduled" : "failed"},
          due_at = ${new Date(now.getTime() + backoffMinutes * 60_000)},
          last_error = ${message.slice(0, 1000)}, executed_at = ${canRetry ? null : now},
          locked_at = null, locked_by = null
        where id = ${job.id}
      `;
    });
    if (!canRetry) {
      await createBotAlert({
        conversationId: context.id,
        cycle: context.current_cycle,
        type: "send_error",
        priority: "high",
        summary: "Error al enviar seguimiento",
        exactReason: message.slice(0, 500),
        suggestedAction: "Revisar el error de Meta antes de reintentar manualmente.",
        dedupeKey: `${context.id}:${context.current_cycle}:send_error:${job.id}`,
      });
    }
  }
}

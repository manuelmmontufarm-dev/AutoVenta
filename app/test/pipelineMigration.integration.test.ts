import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeHistoricalStage, STAGE_ORDER } from "../src/domain/pipeline.js";

const testDatabase = `autoventa_phase_a_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let followUps: typeof import("../src/services/followUps.js");
let discountOffers: typeof import("../src/services/discountOffers.js");
let campaigns: typeof import("../src/services/followUpCampaigns.js");
let followUpAdmin: typeof import("../src/services/followUpAdmin.js");

describe.sequential("Fase A — migración, transiciones y reapertura", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);

    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.SELLER_PHONE = "593000000000";
    process.env.OPENAI_API_KEY = "test";

    const db = await import("../src/db/client.js");
    appSql = db.sql;
    const schema = await import("../src/db/schema.js");
    await schema.ensureSchema();
    conversations = await import("../src/services/conversations.js");
    followUps = await import("../src/services/followUps.js");
    discountOffers = await import("../src/services/discountOffers.js");
    campaigns = await import("../src/services/followUpCampaigns.js");
    followUpAdmin = await import("../src/services/followUpAdmin.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("normaliza el nombre histórico sin alterar el orden comercial", () => {
    expect(normalizeHistoricalStage("handoff_visita")).toBe("seguimiento_venta");
    expect(STAGE_ORDER.seguimiento_venta).toBe(4);
    expect(STAGE_ORDER.ganado).toBeGreaterThan(STAGE_ORDER.seguimiento_venta);
  });

  it("aplica la migración repetidamente y preserva conversación, ciclo y métricas", async () => {
    const [legacy] = await appSql<{ id: number }[]>`
      insert into conversations (phone, stage, current_cycle)
      values ('593000000001', 'handoff_visita', 7)
      returning id
    `;
    await appSql`
      insert into stage_transitions (conversation_id, cycle, from_stage, to_stage)
      values (${legacy.id}, 7, 'cotizacion_enviada', 'handoff_visita')
    `;
    await appSql`
      insert into funnel_events (conversation_id, cycle, type, data)
      values (${legacy.id}, 7, 'etapa', '{"from":"cotizacion_enviada","stage":"handoff_visita"}'::jsonb)
    `;

    const { runFollowUpMigration } = await import("../src/db/migrations/001_follow_up_system.js");
    const { runSalesPlanDiscountsMigration } = await import("../src/db/migrations/002_sales_follow_up_plan_discounts.js");
    const { runFollowUpStagePromptsMigration } = await import("../src/db/migrations/003_follow_up_stage_prompts.js");
    const { runOpportunityCampaignsPendingDiscountsMigration } = await import("../src/db/migrations/004_opportunity_campaigns_pending_discounts.js");
    const { runConversationMemoryDiscountDeliveryMigration } = await import("../src/db/migrations/005_conversation_memory_discount_delivery.js");
    const { runCycleContextQualityMigration } = await import("../src/db/migrations/006_cycle_context_quality.js");
    const { runAdvisorNotificationsMigration } = await import("../src/db/migrations/007_advisor_notifications.js");
    await runFollowUpMigration(appSql);
    await runFollowUpMigration(appSql);
    await runSalesPlanDiscountsMigration(appSql);
    await runSalesPlanDiscountsMigration(appSql);
    await runFollowUpStagePromptsMigration(appSql);
    await runFollowUpStagePromptsMigration(appSql);
    await runOpportunityCampaignsPendingDiscountsMigration(appSql);
    await runOpportunityCampaignsPendingDiscountsMigration(appSql);
    await runConversationMemoryDiscountDeliveryMigration(appSql);
    await runConversationMemoryDiscountDeliveryMigration(appSql);
    await runCycleContextQualityMigration(appSql);
    await runCycleContextQualityMigration(appSql);
    await runAdvisorNotificationsMigration(appSql);
    await runAdvisorNotificationsMigration(appSql);

    const [row] = await appSql<{ id: number; stage: string; current_cycle: number }[]>`
      select id, stage, current_cycle from conversations where id = ${legacy.id}
    `;
    const [transition] = await appSql<{ to_stage: string }[]>`
      select to_stage from stage_transitions where conversation_id = ${legacy.id}
    `;
    const [event] = await appSql<{ stage: string }[]>`
      select data->>'stage' as stage from funnel_events where conversation_id = ${legacy.id}
    `;

    expect(Number(row.id)).toBe(Number(legacy.id));
    expect(row.current_cycle).toBe(7);
    expect(row.stage).toBe("seguimiento_venta");
    expect(transition.to_stage).toBe("seguimiento_venta");
    expect(event.stage).toBe("seguimiento_venta");
    const [policy] = await appSql<{ prompt: string }[]>`select stage_prompts->>'cotizacion_enviada' as prompt from follow_up_policies where policy_key='default'`;
    expect(policy.prompt).toContain("cotización");
    const [advisorTable] = await appSql<{ exists: boolean }[]>`
      select to_regclass('public.advisor_notifications') is not null as exists
    `;
    expect(advisorTable.exists).toBe(true);
  });

  it("muestra inmediatamente en Revisión humana a quien pide asesor", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000049", "Cliente Asesor");
    await appSql`
      update conversations set assigned_to='human', bot_paused_until='infinity'::timestamptz,
        last_customer_message_at=now(), last_assistant_message_at=now() - interval '1 minute'
      where id=${conversation.id}
    `;
    await appSql`
      insert into bot_alerts (
        conversation_id, cycle, type, priority, summary, exact_reason,
        suggested_action, dedupe_key
      ) values (
        ${conversation.id}, 1, 'human_requested', 'high', 'Cliente solicitó atención humana',
        'asesor', 'Responder personalmente', ${`${conversation.id}:1:human_requested`}
      ) on conflict do nothing
    `;
    const board = await followUpAdmin.listFollowUpBoard();
    expect(board.find((item) => item.conversationId === Number(conversation.id))).toMatchObject({
      bucket: "needs_human",
      importanceLabel: "Cliente pidió asesor",
    });
  });

  it("versiona una cotización con descuento y conserva el total original", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000009", "Cliente Descuento");
    await conversations.logQuote(
      conversation.id,
      [{ code: "K1", description: "Llanta Kenda", quantity: 4, unitPrice: 100 }],
      400, 60, 460, "COT-BASE", "AV-BASE",
    );
    const offer = await discountOffers.createDiscountOffer({
      conversationId: conversation.id,
      valueCents: 2_000,
      reason: "Autorizado para prueba",
      condition: "visita el sábado",
    });
    expect(offer.baseTotalCents).toBe(46_000);
    expect(offer.finalTotalCents).toBe(44_000);
    const quotes = await appSql<{ total: string; original_total: string; discount_amount: string }[]>`
      select total, original_total, discount_amount from quotes
      where conversation_id=${conversation.id} order by created_at desc, id desc limit 1
    `;
    expect(Number(quotes[0].total)).toBe(440);
    expect(Number(quotes[0].original_total)).toBe(460);
    expect(Number(quotes[0].discount_amount)).toBe(20);
  });

  it("guarda un porcentaje antes de cotizar y lo materializa con ahorro exacto", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000019", "Cliente Descuento Pendiente");
    const created = await discountOffers.createDiscountFromPrompt(
      conversation.id, "5% si recoge esta semana", "admin_prompt", null, "next_message",
    );
    expect(created.status).toBe("pending");
    const offer = await discountOffers.materializePendingDiscount(conversation.id, 42_500);
    expect(offer).toMatchObject({ kind: "percentage", valueCents: 500,
      discountAmountCents: 2125, finalTotalCents: 40375 });
    const [pending] = await appSql<{ status: string }[]>`select status from pending_discount_rules
      where conversation_id=${conversation.id} order by created_at desc limit 1`;
    expect(pending.status).toBe("applied");
    expect(offer?.notificationMode).toBe("next_message");
  });

  it("expone el descuento pendiente al agente y registra su notificación", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000029", "Cliente Aviso Descuento");
    const created = await discountOffers.createDiscountFromPrompt(
      conversation.id, "5% si lo lleva hoy", "admin_prompt", null, "now",
    );
    expect(created.status).toBe("pending");
    const pending = await discountOffers.getPendingDiscountRule(conversation.id);
    expect(pending).toMatchObject({ kind: "percentage", valueCents: 500,
      notificationMode: "now", condition: "lo lleva hoy" });
    await discountOffers.markDiscountNoticeSent("pending", pending!.id);
    expect((await discountOffers.getPendingDiscountRule(conversation.id))?.notifiedAt).toBeInstanceOf(Date);
  });

  it("registra transición, cierre y reapertura en un ciclo nuevo", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000002", "Cliente A");
    await conversations.setStage(conversation.id, "seguimiento_venta", {
      actor: "owner",
      reason: "Confirmó visita",
    });
    await conversations.updateConversationFacts(conversation.id, {
      customerCommitment: "Voy el sábado",
      followUpReason: "Cliente pidió asesor en la compra anterior",
    });
    await conversations.setStage(conversation.id, "ganado", {
      actor: "owner",
      reason: "Compra verificada",
    });
    const reopened = await conversations.reopenConversation(
      conversation.id,
      "owner",
      "Nueva necesidad",
    );

    expect(reopened.stage).toBe("nuevo");
    expect(reopened.status).toBe("open");
    expect(reopened.current_cycle).toBe(2);
    const [freshContext] = await appSql<{
      customer_commitment: string | null; follow_up_reason: string | null;
    }[]>`select customer_commitment, follow_up_reason from conversations where id=${conversation.id}`;
    expect(freshContext).toEqual({ customer_commitment: null, follow_up_reason: null });

    const history = await appSql<{ cycle: number; outcome: string }[]>`
      select cycle, outcome from sales_history where conversation_id = ${conversation.id}
    `;
    const transitions = await appSql<{ cycle: number; to_stage: string }[]>`
      select cycle, to_stage from stage_transitions
      where conversation_id = ${conversation.id}
      order by id
    `;
    expect(history).toEqual([{ cycle: 1, outcome: "ganado" }]);
    expect(transitions.map((row) => [row.cycle, row.to_stage])).toEqual([
      [1, "seguimiento_venta"],
      [1, "ganado"],
      [2, "nuevo"],
    ]);
  });

  it("agenda con idempotencia y cancela todo cuando llega un inbound", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000003", "Cliente B");
    const lastCustomer = new Date("2026-07-20T15:00:00.000Z");
    const lastBot = new Date("2026-07-20T15:01:00.000Z");
    await appSql`
      update conversations set
        last_customer_message_at = ${lastCustomer},
        last_assistant_message_at = ${lastBot},
        tire_size = '205/55 R16'
      where id = ${conversation.id}
    `;

    await followUps.scheduleConversationFollowUps(conversation.id, lastBot);
    await followUps.scheduleConversationFollowUps(conversation.id, lastBot);
    const scheduled = await appSql<{ count: number }[]>`
      select count(*)::int as count from follow_up_jobs
      where conversation_id = ${conversation.id} and status = 'scheduled'
    `;
    // Dos mensajes dentro de la ventana + revisión de asesor ya creada.
    expect(scheduled[0].count).toBe(3);

    await followUps.handleInboundFollowUpState(conversation.id, "lo reviso y te aviso");
    const cancelled = await appSql<{ count: number }[]>`
      select count(*)::int as count from follow_up_jobs
      where conversation_id = ${conversation.id} and status = 'cancelled'
    `;
    expect(cancelled[0].count).toBe(3);
  });

  it("mantiene un siguiente paso en cada etapa comercial activa", async () => {
    const stages = ["nuevo", "medida_confirmada", "seleccionando", "cotizacion_enviada", "seguimiento_venta"] as const;
    const now = new Date("2026-07-20T15:01:00.000Z");
    for (const [index, stage] of stages.entries()) {
      const conversation = await conversations.getOrCreateConversation(`5930000010${index}`, `Etapa ${stage}`);
      await appSql`
        update conversations set stage=${stage}, last_customer_message_at=${new Date("2026-07-20T15:00:00.000Z")},
          last_assistant_message_at=${now} where id=${conversation.id}
      `;
      await followUps.scheduleConversationFollowUps(conversation.id, now);
      const [next] = await appSql<{ type: string }[]>`
        select type from follow_up_jobs where conversation_id=${conversation.id}
          and status in ('scheduled','processing','blocked') order by due_at limit 1
      `;
      expect(next?.type).toBe("in_window_first");
    }
  });

  it("recalcula un seguimiento existente al ampliar el horario comercial", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000039", "Cliente Horario");
    const lastCustomer = new Date("2026-07-20T19:59:00.000Z");
    const lastBot = new Date("2026-07-20T20:00:00.000Z");
    await appSql`update conversations set last_customer_message_at=${lastCustomer},
      last_assistant_message_at=${lastBot} where id=${conversation.id}`;
    await followUps.scheduleConversationFollowUps(conversation.id, lastBot);
    const [before] = await appSql<{ id: number; due_at: Date }[]>`
      select id, due_at from follow_up_jobs where conversation_id=${conversation.id}
        and type='in_window_first' and status='scheduled' order by id desc limit 1
    `;
    expect(before.due_at.toISOString()).toBe("2026-07-21T13:30:00.000Z");

    await appSql`update follow_up_policies set
      business_hours=jsonb_set(business_hours, '{1,close}', '"19:30"'::jsonb), updated_at=now()
      where policy_key='default'`;
    await followUps.rescheduleActiveConversationPlans(lastBot);
    const [after] = await appSql<{ due_at: Date }[]>`
      select due_at from follow_up_jobs where conversation_id=${conversation.id}
        and type='in_window_first' and status='scheduled' order by id desc limit 1
    `;
    const [old] = await appSql<{ status: string }[]>`select status from follow_up_jobs where id=${before.id}`;
    expect(after.due_at.toISOString()).toBe("2026-07-20T23:00:00.000Z");
    expect(old.status).toBe("cancelled");
    await appSql`update follow_up_policies set
      business_hours=jsonb_set(business_hours, '{1,close}', '"17:30"'::jsonb), updated_at=now()
      where policy_key='default'`;
  });

  it("reemplaza planes anteriores por dos mensajes v5 distintos dentro de la ventana", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000013", "Cliente Plan Anterior");
    const lastCustomer = new Date("2026-07-20T15:00:00.000Z");
    const lastBot = new Date("2026-07-20T15:01:00.000Z");
    await appSql`update conversations set stage='cotizacion_enviada', tire_size='215/65R16',
      last_customer_message_at=${lastCustomer}, last_assistant_message_at=${lastBot} where id=${conversation.id}`;
    const [legacy] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (conversation_id, cycle, type, due_at, idempotency_key, payload)
      values (${conversation.id}, 1, 'in_window_first', '2026-07-20T18:01:00Z',
        ${`plan:v2:${conversation.id}:1:cotizacion_enviada:${lastBot.toISOString()}:in_window_first`},
        '{"preview":"mensaje anterior repetido"}'::jsonb) returning id
    `;
    await followUps.ensureActiveConversationPlans(lastBot);
    const [oldState] = await appSql<{ status: string }[]>`select status from follow_up_jobs where id=${legacy.id}`;
    const messages = await appSql<{ preview: string }[]>`
      select payload->>'preview' as preview from follow_up_jobs
      where conversation_id=${conversation.id} and idempotency_key like 'plan:v5:%'
        and type in ('in_window_first','in_window_second') order by due_at
    `;
    expect(oldState.status).toBe("cancelled");
    expect(messages).toHaveLength(2);
    expect(messages[0].preview).not.toBe(messages[1].preview);
  });

  it("recupera un lease tras reinicio y SKIP LOCKED evita doble claim", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000004", "Cliente C");
    const [job] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (
        conversation_id, cycle, type, due_at, idempotency_key, payload
      ) values (
        ${conversation.id}, 1, 'in_window_first', '2026-07-20T15:00:00Z',
        'restart-test-job', '{}'::jsonb
      ) returning id
    `;
    const now = new Date("2026-07-20T16:00:00.000Z");
    const first = await followUps.claimDueFollowUpJobs({ workerId: "worker-a", now, limit: 1 });
    const locked = await followUps.claimDueFollowUpJobs({ workerId: "worker-b", now, limit: 1 });
    expect(first.map((item) => Number(item.id))).toEqual([Number(job.id)]);
    expect(locked).toHaveLength(0);

    const afterRestart = await followUps.claimDueFollowUpJobs({
      workerId: "worker-b",
      now: new Date("2026-07-20T16:06:00.000Z"),
      limit: 1,
      leaseMinutes: 5,
    });
    expect(afterRestart.map((item) => Number(item.id))).toEqual([Number(job.id)]);
  });

  it("mueve a revisión humana al vencer el job por días sin respuesta", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000014", "Cliente Revisión");
    await appSql`
      update conversations set stage='cotizacion_enviada', assigned_to='bot',
        last_customer_message_at='2026-07-17T14:00:00Z', last_assistant_message_at='2026-07-17T14:01:00Z'
      where id=${conversation.id}
    `;
    const [review] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (conversation_id, cycle, type, channel, due_at, idempotency_key, payload, status, locked_at, locked_by)
      values (${conversation.id}, 1, 'advisor_review', 'advisor', '2026-07-20T14:00:00Z', 'advisor-review-test',
        '{"reason":"3 días sin respuesta","preview":"Revisar y decidir continuar o marcar Perdido"}'::jsonb,
        'processing', '2026-07-20T14:00:00Z', 'test-worker') returning id
    `;
    const [pending] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (conversation_id, cycle, type, due_at, idempotency_key, payload)
      values (${conversation.id}, 1, 'post_window_2', '2026-07-21T14:00:00Z', 'advisor-review-pending-test', '{}'::jsonb) returning id
    `;
    const { processFollowUpJob } = await import("../src/services/followUpProcessor.js");
    await processFollowUpJob({ id: Number(review.id) } as never, { now: () => new Date("2026-07-20T14:00:00Z") });
    const [state] = await appSql<{ assigned_to: string; bot_paused_until: Date | null }[]>`select assigned_to, bot_paused_until from conversations where id=${conversation.id}`;
    const [pendingState] = await appSql<{ status: string; cancel_reason: string }[]>`select status, cancel_reason from follow_up_jobs where id=${pending.id}`;
    expect(state.assigned_to).toBe("human");
    expect(state.bot_paused_until).not.toBeNull();
    expect(pendingState).toEqual({ status: "cancelled", cancel_reason: "moved_to_human_review" });
  });

  it("bloquea post-24h sin plantilla aprobada y nunca hace fallback a texto", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000005", "Cliente D");
    await appSql`
      update conversations set customer_opt_in = true,
        last_customer_message_at = '2026-07-18T14:00:00Z',
        last_assistant_message_at = '2026-07-18T14:01:00Z'
      where id = ${conversation.id}
    `;
    const [job] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (
        conversation_id, cycle, type, due_at, window_closes_at,
        idempotency_key, payload, status, locked_at, locked_by
      ) values (
        ${conversation.id}, 1, 'post_window_1', '2026-07-20T14:00:00Z',
        '2026-07-19T14:00:00Z', 'blocked-template-test',
        '{"templateKey":"seguimiento_opciones_v1","stage":"nuevo","preview":"NO ENVIAR TEXTO"}'::jsonb,
        'processing', '2026-07-20T14:00:00Z', 'test-worker'
      ) returning id
    `;
    const { processFollowUpJob } = await import("../src/services/followUpProcessor.js");
    let textCalls = 0;
    let templateCalls = 0;
    await processFollowUpJob({ id: Number(job.id) } as never, {
      now: () => new Date("2026-07-20T14:00:00.000Z"),
      sendText: async () => { textCalls += 1; return "text"; },
      sendTemplate: async () => { templateCalls += 1; return "template"; },
    });
    const [state] = await appSql<{ status: string }[]>`
      select status from follow_up_jobs where id = ${job.id}
    `;
    const [alerts] = await appSql<{ count: number }[]>`
      select count(*)::int as count from bot_alerts
      where conversation_id = ${conversation.id} and type = 'template_required'
    `;
    expect(state.status).toBe("blocked");
    expect(alerts.count).toBe(1);
    expect(textCalls).toBe(0);
    expect(templateCalls).toBe(0);
  });

  it("bloquea una plantilla aprobada cuando falta una variable comercial real", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000006", "Cliente E");
    await appSql`
      update conversations set customer_opt_in = true,
        last_customer_message_at = '2026-07-18T14:00:00Z',
        last_assistant_message_at = '2026-07-18T14:01:00Z'
      where id = ${conversation.id}
    `;
    await appSql`
      update follow_up_templates set template_name = 'seguimiento_opciones_aprobada',
        configured = true, approval_status = 'approved', automatic_send = true
      where template_key = 'seguimiento_opciones_v1'
    `;
    const [job] = await appSql<{ id: number }[]>`
      insert into follow_up_jobs (
        conversation_id, cycle, type, due_at, window_closes_at,
        idempotency_key, payload, status, locked_at, locked_by
      ) values (
        ${conversation.id}, 1, 'post_window_1', '2026-07-20T14:00:00Z',
        '2026-07-19T14:00:00Z', 'missing-variable-template-test',
        '{"templateKey":"seguimiento_opciones_v1","stage":"nuevo"}'::jsonb,
        'processing', '2026-07-20T14:00:00Z', 'test-worker'
      ) returning id
    `;
    const { processFollowUpJob } = await import("../src/services/followUpProcessor.js");
    let textCalls = 0;
    let templateCalls = 0;
    await processFollowUpJob({ id: Number(job.id) } as never, {
      now: () => new Date("2026-07-20T14:00:00.000Z"),
      sendText: async () => { textCalls += 1; return "text"; },
      sendTemplate: async () => { templateCalls += 1; return "template"; },
    });
    const [state] = await appSql<{ status: string; cancel_reason: string | null }[]>`
      select status, cancel_reason from follow_up_jobs where id = ${job.id}
    `;
    expect(state).toEqual({ status: "blocked", cancel_reason: "template_variables_missing" });
    expect(textCalls).toBe(0);
    expect(templateCalls).toBe(0);
  });

  it("autoriza ocho días de plantilla con hora visible y cancela el plan al responder", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000017", "Cliente Campaña");
    await appSql`update conversations set stage='nuevo', assigned_to='human', customer_opt_in=true,
      last_customer_message_at='2026-07-18T14:00:00Z', last_assistant_message_at='2026-07-18T14:01:00Z'
      where id=${conversation.id}`;
    await appSql`update follow_up_templates set template_name='seguimiento_opciones_aprobada', configured=true,
      approval_status='approved', automatic_send=false, variables='[]'::jsonb,
      preview='¿Te ayudo a retomar las opciones que revisamos? 🛞'
      where template_key='seguimiento_opciones_v1'`;
    const authorized = await campaigns.authorizeAdvisorTemplatePlan(
      conversation.id, new Date("2026-07-20T15:00:00Z"),
    );
    expect(authorized.days).toHaveLength(8);
    expect(authorized.days.every((day) => new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(day.dueAt)) === "10:00")).toBe(true);
    const [count] = await appSql<{ count: number }[]>`select count(*)::int as count from follow_up_jobs
      where conversation_id=${conversation.id} and type like 'advisor_template_day_%' and status='scheduled'`;
    expect(count.count).toBe(8);

    await followUps.handleInboundFollowUpState(conversation.id, "Sí, todavía me interesa");
    const [cancelled] = await appSql<{ count: number }[]>`select count(*)::int as count from follow_up_jobs
      where conversation_id=${conversation.id} and type like 'advisor_template_day_%' and status='cancelled'`;
    const [campaign] = await appSql<{ status: string }[]>`select status from follow_up_campaigns
      where conversation_id=${conversation.id} order by created_at desc limit 1`;
    expect(cancelled.count).toBe(8);
    expect(campaign.status).toBe("cancelled");
  });
});

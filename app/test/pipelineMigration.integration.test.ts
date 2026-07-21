import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeHistoricalStage, STAGE_ORDER } from "../src/domain/pipeline.js";

const testDatabase = `autoventa_phase_a_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let followUps: typeof import("../src/services/followUps.js");

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
    await runFollowUpMigration(appSql);
    await runFollowUpMigration(appSql);

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
  });

  it("registra transición, cierre y reapertura en un ciclo nuevo", async () => {
    const conversation = await conversations.getOrCreateConversation("593000000002", "Cliente A");
    await conversations.setStage(conversation.id, "seguimiento_venta", {
      actor: "owner",
      reason: "Confirmó visita",
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
    expect(scheduled[0].count).toBe(2);

    await followUps.handleInboundFollowUpState(conversation.id, "lo reviso y te aviso");
    const cancelled = await appSql<{ count: number }[]>`
      select count(*)::int as count from follow_up_jobs
      where conversation_id = ${conversation.id} and status = 'cancelled'
    `;
    expect(cancelled[0].count).toBe(2);
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
});

/**
 * SPRINT 5 / N6 (chat 1456 de Competimotor, 24–26-nov): alertas falsas al asesor.
 *
 *  · «visit_not_confirmed» el 26 aunque el cliente escribió «Ya estoy aquí afuera»
 *    el 25, el día de su visita, y compró.
 *  · «two_follow_ups_no_reply» con la visita confirmada para un día que no pasó.
 *
 * Perfil `mundillantas` (la regla vive detrás de `politica.casosSueltosF06`).
 * Los casos de control (sin visita, o sin mensaje ese día) muestran que la
 * alerta sigue naciendo cuando corresponde.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_s5alertas_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let followUps: typeof import("../src/services/followUps.js");

const AHORA = new Date("2026-11-26T15:00:00.000Z"); // jueves 26, 10:00 en Ecuador
const DIA = 86_400_000;

async function alertas(id: number): Promise<string[]> {
  const filas = await appSql<{ type: string }[]>`select type from bot_alerts where conversation_id=${id} order by type`;
  return filas.map((f) => f.type);
}

describe.sequential("N6 · alertas falsas de 1456 (Competimotor)", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);
    process.env.NEGOCIO = "mundillantas";
    delete process.env.IDENTIDAD;
    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.SELLER_PHONE = "593000000000";
    process.env.OPENAI_API_KEY = "test";
    process.env.GRAPH_BASE_URL = "http://127.0.0.1:9";
    appSql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    conversations = await import("../src/services/conversations.js");
    followUps = await import("../src/services/followUps.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("visita de ayer + el cliente escribió ese día («Ya estoy aquí afuera») → sin visit_not_confirmed", async () => {
    const c = await conversations.getOrCreateConversation("593980001456", "Cliente 1456");
    await appSql`update conversations set status='open', visit_date=${new Date(AHORA.getTime() - DIA)},
      last_customer_message_at=${new Date(AHORA.getTime() - DIA + 2 * 3_600_000)} where id=${c.id}`;
    await appSql`insert into messages (conversation_id, cycle, role, direction, content, created_at)
      values (${c.id}, ${c.current_cycle}, 'user', 'inbound', '[audio] Ya estoy aquí afuera mi amigo', ${new Date(AHORA.getTime() - DIA + 2 * 3_600_000)})`;
    await followUps.reconcileFollowUpAlerts(AHORA);
    expect(await alertas(c.id)).not.toContain("visit_not_confirmed");
  });

  it("visita de ayer y el cliente NO escribió ese día → visit_not_confirmed sigue naciendo", async () => {
    const c = await conversations.getOrCreateConversation("593980001457", "Cliente que no vino");
    await appSql`update conversations set status='open', visit_date=${new Date(AHORA.getTime() - DIA)},
      last_customer_message_at=${new Date(AHORA.getTime() - 3 * DIA)} where id=${c.id}`;
    await followUps.reconcileFollowUpAlerts(AHORA);
    expect(await alertas(c.id)).toContain("visit_not_confirmed");
  });

  it("dos seguimientos sin respuesta con la visita para mañana → sin two_follow_ups_no_reply; sin visita, sí", async () => {
    for (const [tel, conVisita] of [["593980001458", true], ["593980001459", false]] as const) {
      const c = await conversations.getOrCreateConversation(tel, "Cliente seguimientos");
      await appSql`update conversations set status='open',
        visit_date=${conVisita ? new Date(AHORA.getTime() + DIA) : null},
        last_customer_message_at=${new Date(AHORA.getTime() - 10 * 3_600_000)} where id=${c.id}`;
      for (const h of [6, 2]) {
        await appSql`insert into follow_up_jobs (conversation_id, cycle, type, status, due_at, executed_at, idempotency_key, payload)
          values (${c.id}, ${c.current_cycle}, ${h === 6 ? "in_window_first" : "in_window_second"}, 'sent',
            ${new Date(AHORA.getTime() - h * 3_600_000)}, ${new Date(AHORA.getTime() - h * 3_600_000)}, ${`${tel}:${h}`}, '{}'::jsonb)`;
      }
      await followUps.reconcileFollowUpAlerts(AHORA);
      if (conVisita) expect(await alertas(c.id)).not.toContain("two_follow_ups_no_reply");
      else expect(await alertas(c.id)).toContain("two_follow_ups_no_reply");
    }
  });
});

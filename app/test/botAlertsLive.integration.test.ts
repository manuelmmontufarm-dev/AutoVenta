/**
 * El aviso en vivo de alertas contra Postgres.
 *
 * `reconcileFollowUpAlerts` corre en cada vuelta del worker (cada 5 s) y sus
 * inserts son idempotentes por `dedupe_key`. La pregunta que responde esta
 * prueba es una sola: **¿el hub se entera solo cuando nace una alerta nueva?**
 * Antes avisaba en cada vuelta y el panel mostraba «Nueva alerta del bot» sin
 * parar, anunciando alertas de hace días.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_alertas_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let followUps: typeof import("../src/services/followUps.js");
let liveEvents: typeof import("../src/services/liveEvents.js");

const AHORA = new Date("2026-07-20T15:00:00.000Z");

/** Cuenta los eventos `alert` emitidos mientras corre `accion`. */
async function contarAvisos(accion: () => Promise<void>): Promise<number> {
  let avisos = 0;
  const desuscribir = liveEvents.subscribeLiveEvents((evento) => {
    if (evento.type === "alert") avisos += 1;
  });
  try {
    await accion();
  } finally {
    desuscribir();
  }
  return avisos;
}

describe.sequential("Aviso en vivo de alertas del bot", () => {
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
    process.env.GRAPH_BASE_URL = "http://127.0.0.1:9";

    appSql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    conversations = await import("../src/services/conversations.js");
    followUps = await import("../src/services/followUps.js");
    liveEvents = await import("../src/services/liveEvents.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("no avisa cuando no hay nada que alertar", async () => {
    expect(await contarAvisos(() => followUps.reconcileFollowUpAlerts(AHORA))).toBe(0);
  });

  it("avisa una sola vez por alerta, aunque el worker reconcilie sin parar", async () => {
    const conversation = await conversations.getOrCreateConversation("593980000001", "Cliente visita");
    await appSql`
      update conversations set status = 'open',
        visit_date = ${new Date(AHORA.getTime() - 86_400_000)},
        last_customer_message_at = ${new Date(AHORA.getTime() - 3 * 3_600_000)}
      where id = ${conversation.id}
    `;

    expect(await contarAvisos(() => followUps.reconcileFollowUpAlerts(AHORA))).toBe(1);

    // Las siguientes vueltas del worker no insertan nada: el hub debe quedarse callado.
    const repeticiones = await contarAvisos(async () => {
      for (let vuelta = 0; vuelta < 5; vuelta += 1) {
        await followUps.reconcileFollowUpAlerts(AHORA);
      }
    });
    expect(repeticiones).toBe(0);

    const [{ count }] = await appSql<{ count: number }[]>`
      select count(*)::int as count from bot_alerts where conversation_id = ${conversation.id}
    `;
    expect(count).toBe(1);
  });
});

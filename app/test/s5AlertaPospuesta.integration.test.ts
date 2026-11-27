/**
 * SPRINT 5 / N6 (chat 1456): «el cliente escribió y nadie le contesta» nace
 * POSPUESTA 10 minutos en Competimotor. Que no se pierda:
 *
 *  (a) pasados los 10 minutos sin saliente humano aparece en el panel
 *      (`listBotAlerts` la filtra al LEER: `snoozed_until <= now()`; no hace falta
 *      ningún proceso que la despierte). Esta alerta nunca tuvo WhatsApp ni push
 *      al asesor (no pasa por `notifyAdvisor`): solo el panel, antes y ahora.
 *  (b) si el asesor contesta antes, queda resuelta y no aparece nunca.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_s5pospuesta_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let turno: typeof import("../src/services/turnoDelHumano.js");
let admin2: typeof import("../src/services/followUpAdmin.js");

const enElPanel = async (id: number) =>
  (await admin2.listBotAlerts()).filter((a: { conversationId?: number; conversation_id?: number; type: string }) =>
    Number(a.conversationId ?? a.conversation_id) === Number(id) && a.type === "cliente_sin_respuesta");

describe.sequential("N6 · cliente_sin_respuesta pospuesta (Competimotor)", () => {
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
    turno = await import("../src/services/turnoDelHumano.js");
    admin2 = await import("../src/services/followUpAdmin.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  async function chatDelAsesor(tel: string) {
    const conv = await conversations.getOrCreateConversation(tel, "Cliente 1456");
    await conversations.setConversationAssignee(conv.id, "human", "persona_escribio");
    const ahora = new Date();
    await conversations.appendMessage(conv.id, "user", "Pero tiene la medida q me enviaron verdad", `wamid.${tel}`, { occurredAt: ahora });
    expect(await turno.decidirQuienContesta(conv.id, "Pero tiene la medida q me enviaron verdad", ahora))
      .toMatchObject({ contesta: "humano" });
    return conv;
  }

  it("(a) nace pospuesta: no se ve al minuto; vencidos los 10 min aparece abierta en el panel", async () => {
    const conv = await chatDelAsesor("593980014561");
    const [fila] = await appSql<{ status: string; snoozed_until: Date }[]>`
      select status, snoozed_until from bot_alerts where conversation_id=${conv.id} and type='cliente_sin_respuesta'`;
    expect(fila.status).toBe("snoozed");
    expect(fila.snoozed_until.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(await enElPanel(conv.id)).toHaveLength(0);
    // Pasan los 10 minutos sin saliente humano (se adelanta el reloj de la fila).
    await appSql`update bot_alerts set snoozed_until = now() - interval '1 second'
      where conversation_id=${conv.id} and type='cliente_sin_respuesta'`;
    const todas = await admin2.listBotAlerts();
    const nuestras = todas.filter((a) => a.conversationId === Number(conv.id));
    expect(nuestras.map((a) => a.type), JSON.stringify(nuestras)).toContain("cliente_sin_respuesta");
  });

  it("(b) el asesor contesta antes: queda resuelta y no aparece nunca", async () => {
    const conv = await chatDelAsesor("593980014562");
    await conversations.setConversationAssignee(conv.id, "human");
    const [fila] = await appSql<{ status: string }[]>`
      select status from bot_alerts where conversation_id=${conv.id} and type='cliente_sin_respuesta'`;
    expect(fila.status).toBe("resolved");
    await appSql`update bot_alerts set snoozed_until = now() - interval '1 second' where conversation_id=${conv.id}`;
    expect(await enElPanel(conv.id)).toHaveLength(0);
  });
});

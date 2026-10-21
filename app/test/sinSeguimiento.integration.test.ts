/**
 * «Este cliente no quiere seguimiento» se decide en UN lugar
 * (`services/followUps.ts`, que consulta `domain/sinSeguimiento.ts`) y se
 * aplica en las dos puertas del seguimiento: al agendar
 * (`scheduleConversationFollowUps`) y al enviar (`processFollowUpJob`, ANTES de
 * pagar la redacción y el Guardián). El job queda cancelado con su motivo.
 *
 * Textos reales de producción: 27914, 22876 y 27292 (auditoría 19-oct-2026).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const espia = vi.hoisted(() => ({ redacciones: 0 }));
vi.mock("../src/services/followUpCopy.js", () => ({
  generateFollowUpCopy: async () => {
    espia.redacciones += 1;
    return { text: "Redacción de prueba que no debería existir", source: "ai" as const };
  },
}));

const testDatabase = `autoventa_sinseg_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let followUps: typeof import("../src/services/followUps.js");
let processor: typeof import("../src/services/followUpProcessor.js");

/** Jueves 15-oct-2026, 10:00 en Quito: horario de atención. */
const AHORA = new Date("2026-10-15T15:00:00.000Z");
const minutosAntes = (m: number) => new Date(AHORA.getTime() - m * 60_000);

let telefono = 0;

/** Un hilo con los mensajes dados (cliente/bot alternados por quien), listo para agendar. */
async function hilo(mensajes: Array<["cliente" | "bot", string]>) {
  telefono += 1;
  const conv = await conversations.getOrCreateConversation(`59397${String(700000 + telefono).padStart(6, "0")}`, `Cliente ${telefono}`);
  let minuto = mensajes.length * 2 + 10;
  for (const [quien, texto] of mensajes) {
    await conversations.appendMessage(conv.id, quien === "cliente" ? "user" : "assistant", texto, undefined, {
      authorKind: quien === "cliente" ? "customer" : "bot",
      occurredAt: minutosAntes(minuto),
    });
    minuto -= 2;
  }
  await appSql`
    update conversations set stage='seleccionando', tire_size='205/60R14', customer_opt_in=true,
      last_customer_message_at=${minutosAntes(14)}, last_assistant_message_at=${minutosAntes(12)}
    where id=${conv.id}
  `;
  return conv;
}

async function jobsDe(conversationId: number) {
  return appSql<{ id: number; type: string; status: string; cancel_reason: string | null }[]>`
    select id, type, status, cancel_reason from follow_up_jobs where conversation_id=${conversationId} order by id
  `;
}

describe.sequential("no se agenda ni se envía seguimiento a quien no lo quiere", () => {
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
    const db = await import("../src/db/client.js");
    appSql = db.sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    conversations = await import("../src/services/conversations.js");
    followUps = await import("../src/services/followUps.js");
    processor = await import("../src/services/followUpProcessor.js");
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("27914: tras «Cuando lo tenga me avisa» no se agenda ningún seguimiento", async () => {
    const conv = await hilo([
      ["cliente", "Precio de la 205 60 14"],
      ["bot", "En 205/60R14 no me queda el juego. ¿Le cotizo la WINRUN R380 en 185/70R14?"],
      ["cliente", "Para que voy sino tiene las llantas que me interesa. Cuando lo tenga me avisa"],
      ["bot", "Entiendo. Si vuelve a ingresar esa medida, con gusto le aviso."],
    ]);
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    const jobs = await jobsDe(conv.id);
    expect(jobs.filter((j) => j.status === "scheduled")).toEqual([]);
  });

  it("22876: tras «Opté por otro distribuidor por el precio» no se agenda", async () => {
    const conv = await hilo([
      ["bot", "¿Qué día y a qué hora le queda bien pasar?"],
      ["cliente", "Buen día. Me disculpo por no contestar a tiempo. Opté por otro distribuidor por el precio. Agradezco su tiempo y buena disposición. Una buena tarde."],
      ["bot", "Gracias por avisarnos. Quedamos atentos para una próxima oportunidad 🤝"],
    ]);
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    expect((await jobsDe(conv.id)).filter((j) => j.status === "scheduled")).toEqual([]);
  });

  it("27292: «Soy de Ambato» + «Ok gracias» → no se agenda", async () => {
    const conv = await hilo([
      ["bot", "Estamos en Quito, con locales en Cumbayá y Quito Sur."],
      ["cliente", "Soy de Ambato"],
      ["bot", "Gracias. No tenemos local en Ambato, pero sí en Quito."],
      ["cliente", "Ok gracias"],
      ["bot", "Gracias a usted, quedo atento 🤝"],
    ]);
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    expect((await jobsDe(conv.id)).filter((j) => j.status === "scheduled")).toEqual([]);
  });

  it("un job agendado ANTES (código viejo) se cancela al enviar con su motivo, sin pagar redacción", async () => {
    const conv = await hilo([
      ["cliente", "Precio de la 205 60 14"],
      ["bot", "¿Le cotizo la WINRUN R380 en 185/70R14?"],
      ["cliente", "Para que voy sino tiene las llantas que me interesa. Cuando lo tenga me avisa"],
      ["bot", "Entiendo. Si vuelve a ingresar esa medida, con gusto le aviso."],
    ]);
    await appSql`
      insert into follow_up_jobs (conversation_id, cycle, type, due_at, idempotency_key, payload, status)
      values (${conv.id}, 1, 'in_window_first', ${minutosAntes(1)}, ${`viejo:${conv.id}`},
        ${appSql.json({ preview: "😊 ¿Le cotizo la WINRUN R380?", aiPending: true })}, 'scheduled')
    `;
    await appSql`update follow_up_policies set never_outside_hours=false`;
    const enviados: string[] = [];
    const reclamados = await followUps.claimDueFollowUpJobs({ now: AHORA, limit: 10 });
    for (const job of reclamados.filter((j) => j.conversation_id === conv.id)) {
      await processor.processFollowUpJob(job, {
        now: () => AHORA,
        sendText: async (_id, _p, body) => { enviados.push(body); return "wamid.test"; },
      });
    }
    expect(enviados).toEqual([]);
    expect(espia.redacciones).toBe(0);
    const [job] = (await jobsDe(conv.id)).filter((j) => j.type === "in_window_first");
    expect(job.status).toBe("cancelled");
    expect(job.cancel_reason).toBe("no_quiere_seguimiento:espera_que_le_avisen");
  });

  it("caso sano: quien pidió precio, recibió la lámina y no contestó sí tiene seguimiento", async () => {
    const conv = await hilo([
      ["cliente", "Precio de la 205 60 14"],
      ["bot", "1 · WINRUN R380 — $54.59 c/u\n2 · KENDA KR20 — $72.93 c/u\n¿Le cotizo la 1 o la 2?"],
    ]);
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    expect((await jobsDe(conv.id)).some((j) => j.type === "in_window_first" && j.status === "scheduled")).toBe(true);
  });
});

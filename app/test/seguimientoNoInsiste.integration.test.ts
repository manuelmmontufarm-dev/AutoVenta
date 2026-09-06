/**
 * FAMILIA A (auditoría 2-6 sep-2026): el seguimiento automático que no respeta
 * el último mensaje. Tres mecanismos, de punta a punta contra Postgres:
 *
 * 1. Conv 13687: «Disculpe no gracias..» → el bot se despide → se vuelven a
 *    programar dos recordatorios. Programar sobre una despedida no debe
 *    producir ningún job de envío.
 * 2. Conv 13411: «Callate» → el guardián marca `insiste_tras_rechazo` y solo
 *    puede reescribir → sale «Entendido. No le escribo más.» por segunda y
 *    tercera vez. Con el hallazgo, el seguimiento se cancela y no sale nada.
 * 3. Conv 13687 (y 26 más): el texto final del seguimiento es calco de un
 *    mensaje que el bot ya mandó. No sale.
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const guardianFalso = vi.hoisted(() => ({
  hallazgos: [] as Array<{ categoria: string; severidad: string; detalle: string }>,
  texto: null as string | null,
}));

vi.mock("../src/services/guardian.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/guardian.js")>();
  return {
    ...real,
    revisarConGuardian: async (_c: unknown, borrador: string) => ({
      texto: guardianFalso.texto ?? borrador,
      veredicto: guardianFalso.hallazgos.length ? "corregir" : "aprobar",
      hallazgos: guardianFalso.hallazgos,
    }),
  };
});

const testDatabase = `autoventa_noinsiste_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let conversations: typeof import("../src/services/conversations.js");
let followUps: typeof import("../src/services/followUps.js");
let processor: typeof import("../src/services/followUpProcessor.js");

/** Lunes 20-jul-2026, 10:00 en Guayaquil → dentro del horario comercial. */
const AHORA = new Date("2026-07-20T15:00:00.000Z");
const HACE_UNA_HORA = new Date(AHORA.getTime() - 60 * 60 * 1000);
const HACE_59_MIN = new Date(AHORA.getTime() - 59 * 60 * 1000);
let siguienteTelefono = 0;

async function conversacion(stage = "seleccionando") {
  siguienteTelefono += 1;
  const phone = `59398${String(700000 + siguienteTelefono).padStart(6, "0")}`;
  const conv = await conversations.getOrCreateConversation(phone, `Cliente ${siguienteTelefono}`);
  await appSql`
    update conversations set stage = ${stage}, tire_size = '205/75R15',
      last_customer_message_at = ${HACE_UNA_HORA}, last_assistant_message_at = ${HACE_59_MIN},
      customer_opt_in = true
    where id = ${conv.id}
  `;
  return conv;
}

async function mensaje(convId: number, quien: "cliente" | "bot", texto: string, hace: Date) {
  await appSql`
    insert into messages (conversation_id, role, content, direction, type, status, author_kind, cycle, created_at)
    values (${convId}, ${quien === "cliente" ? "user" : "assistant"}, ${texto},
      ${quien === "cliente" ? "inbound" : "outbound"}, 'text', 'delivered',
      ${quien === "cliente" ? "customer" : "bot"}, 1, ${hace})
  `;
}

async function jobsDeEnvio(convId: number) {
  return appSql<{ id: number; type: string; status: string; cancel_reason: string | null; payload: Record<string, unknown> }[]>`
    select id, type, status, cancel_reason, payload from follow_up_jobs
    where conversation_id = ${convId} and type like 'in_window_%' order by id
  `;
}

async function disparar(convId: number, enviados: string[]) {
  await appSql`
    update follow_up_jobs set due_at = ${new Date(AHORA.getTime() - 60_000)}
    where conversation_id = ${convId} and type = 'in_window_first' and status = 'scheduled'
  `;
  const jobs = await followUps.claimDueFollowUpJobs({ now: AHORA, limit: 10 });
  for (const job of jobs) {
    await processor.processFollowUpJob(job, {
      now: () => AHORA,
      sendText: async (_id, _phone, body) => { enviados.push(body); return "wamid.test"; },
      sendTemplate: async () => "wamid.template",
    });
  }
}

describe.sequential("el seguimiento no insiste a quien se despidió", () => {
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

  beforeEach(() => { guardianFalso.hallazgos = []; guardianFalso.texto = null; });

  it("«Disculpe no gracias..» y el 👍🤝 de después no programan ningún recordatorio", async () => {
    const conv = await conversacion();
    await mensaje(conv.id, "cliente", "Disculpe no gracias..", new Date(AHORA.getTime() - 3 * 60_000));
    await mensaje(conv.id, "bot", "No se preocupe, gracias a usted.", new Date(AHORA.getTime() - 2 * 60_000));
    await mensaje(conv.id, "cliente", "👍🤝", HACE_UNA_HORA);
    await mensaje(conv.id, "bot", "Gracias a usted 🤝\n\nCuando desee revisar disponibilidad o una opción más económica, le ayudo con gusto.", HACE_59_MIN);
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    expect(await jobsDeEnvio(conv.id)).toHaveLength(0);
  });

  it("un cliente que sigue en la conversación sí recibe su plan", async () => {
    const conv = await conversacion();
    await mensaje(conv.id, "cliente", "¿y la Kenda cuánto dura?", HACE_UNA_HORA);
    await mensaje(conv.id, "bot", "La Kenda KR15 rinde unos 50.000 km aproximados.", HACE_59_MIN);
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    expect((await jobsDeEnvio(conv.id)).length).toBeGreaterThan(0);
  });

  it("si el guardián ve que insiste tras un rechazo, el seguimiento no sale y el job dice por qué", async () => {
    const conv = await conversacion("nuevo");
    await mensaje(conv.id, "cliente", "Hola, quiero llantas", new Date(AHORA.getTime() - 3 * 60 * 60_000));
    await mensaje(conv.id, "bot", "¿Qué medida usa?", new Date(AHORA.getTime() - 3 * 60 * 60_000 + 1000));
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    // El «Callate» llega después de programado, y el guardián lo ve al enviar.
    await mensaje(conv.id, "cliente", "Callate", HACE_UNA_HORA);
    await mensaje(conv.id, "bot", "Entendido. No le escribo más.", HACE_59_MIN);
    guardianFalso.hallazgos = [{ categoria: "insiste_tras_rechazo", severidad: "alta", detalle: "El cliente pidió que se calle." }];
    guardianFalso.texto = "Entendido. No le escribo más.";
    const enviados: string[] = [];
    await disparar(conv.id, enviados);
    expect(enviados).toHaveLength(0);
    const [primero] = await jobsDeEnvio(conv.id);
    expect(primero.status).toBe("cancelled");
    expect(primero.cancel_reason).toBe("seguimiento_suprimido:insiste_tras_rechazo");
  });

  it("un seguimiento calcado de un mensaje ya enviado no sale", async () => {
    const conv = await conversacion("nuevo");
    await mensaje(conv.id, "cliente", "Hola", HACE_UNA_HORA);
    await mensaje(conv.id, "bot", "¿Qué medida usa? Ej: 225/65R17", HACE_59_MIN);
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    const [job] = await jobsDeEnvio(conv.id);
    const yaEnviado = "Gracias a usted 🤝\n\nCuando desee revisar disponibilidad o una opción más económica, le ayudo con gusto.";
    await mensaje(conv.id, "bot", yaEnviado, new Date(HACE_59_MIN.getTime() + 1000));
    // El guardián «corrige» la plantilla copiando la despedida ya enviada (conv 13687).
    guardianFalso.hallazgos = [{ categoria: "contradiccion", severidad: "alta", detalle: "Ya se despidió." }];
    guardianFalso.texto = yaEnviado;
    const enviados: string[] = [];
    await disparar(conv.id, enviados);
    expect(enviados).toHaveLength(0);
    const [despues] = await appSql<{ status: string; cancel_reason: string | null }[]>`
      select status, cancel_reason from follow_up_jobs where id = ${job.id}
    `;
    expect(despues.status).toBe("cancelled");
    expect(despues.cancel_reason).toBe("seguimiento_suprimido:calco_del_hilo");
  });

  it("la plantilla sabe cuántas opciones hubo y si el cliente ya eligió", async () => {
    const conv = await conversacion("seleccionando");
    await appSql`
      insert into messages (conversation_id, role, content, direction, type, status, author_kind, cycle, created_at, metadata)
      values (${conv.id}, 'assistant', 'Opciones enviadas: FALKEN ZE310R · KENDA KR20 · WINRUN R330', 'outbound', 'image', 'delivered', 'bot', 1,
        ${new Date(AHORA.getTime() - 2 * 60 * 60_000)}, ${appSql.json({ piece: "options", codes: ["352165", "K217B607", "2055516WNR330"] })})
    `;
    await mensaje(conv.id, "cliente", "Premium", HACE_UNA_HORA);
    await mensaje(conv.id, "bot", "La opción premium es la FALKEN ZE310R a $111.36 c/u con IVA.", HACE_59_MIN);
    await followUps.scheduleConversationFollowUps(conv.id, AHORA);
    const jobs = await jobsDeEnvio(conv.id);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(String(job.payload.preview)).not.toMatch(/prioriz|cuál le gustó|otra alternativa/i);
    }
  });
});

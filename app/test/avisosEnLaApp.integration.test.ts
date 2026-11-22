import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

/**
 * EL REPARTO WHATSAPP / APP (22-nov-2026).
 *
 * Manuel: lo que pide actuar va por WhatsApp; lo que solo hay que saber
 * (cotización enviada, venta confirmada) va por la app — pero SOLO para el
 * asesor que activó las notificaciones en su teléfono. Y nadie puede quedarse
 * sin aviso: si la app no lo recibe, sale por WhatsApp como siempre.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_avisos_app_test";
process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${BASE}`;

const admin = postgres(`postgresql://${process.env.USER}@localhost/postgres`, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

let wamid = 0;
vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return { ...real, sendAdvisorText: vi.fn(async () => `wamid.TEST_${++wamid}`) };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { notifyAdvisor } = await import("../src/services/advisorNotifications.js");
const app = await import("../src/services/avisosEnLaApp.js");
const wa = await import("../src/wa/client.js");

const CON_APP = "593990000001"; // Ana activó las notificaciones
const SIN_APP = "593990000002"; // Beto no

/** Lo que «salió» por la app en cada prueba. */
let pushes: { endpoint: string; aviso: { titulo: string; cuerpo: string; ruta?: string } }[] = [];
let pushFalla = false;

async function conversacion(): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${`5939${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`}, 'Carla Mendoza', 'open', 'cotizacion_enviada', 1)
    returning id
  `;
  return Number(fila.id);
}

const avisar = (conversationId: number, eventType: "quote_created" | "human_requested" | "venta_confirmada", clave: string) =>
  notifyAdvisor({ conversationId, cycle: 1, eventType, dedupeKey: clave, title: "Título del aviso", reason: "Motivo", action: "Acción" });

const filas = (clave: string) => sql<{ recipient_phone: string; channel: string; status: string }[]>`
  select recipient_phone, channel, status from advisor_notifications where dedupe_key = ${clave} order by recipient_phone
`;

beforeAll(async () => {
  await ensureSchema();
  await sql`delete from advisors`;
  await sql`insert into advisors (nombre, telefono, rol, active, prioridad) values ('Ana', ${CON_APP}, 'admin', true, 1), ('Beto', ${SIN_APP}, 'admin', true, 2)`;
  await app.guardarSuscripcion({
    userId: "ana", userName: "Ana", advisorPhone: `+${CON_APP}`,
    suscripcion: { endpoint: "https://push.example.test/ana-telefono", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } },
  });
  app._usarTransportePush(async (sub, cuerpo) => {
    if (pushFalla) throw Object.assign(new Error("caído"), { statusCode: 500 });
    pushes.push({ endpoint: sub.endpoint, aviso: JSON.parse(cuerpo) });
  });
});

beforeEach(() => {
  pushes = [];
  pushFalla = false;
  vi.mocked(wa.sendAdvisorText).mockClear();
});

describe("avisos en la app", () => {
  it("cotización enviada: a quien tiene la app le llega por la app y NO por WhatsApp; al otro, por WhatsApp", async () => {
    const id = await conversacion();
    const r = await avisar(id, "quote_created", "t:cotizacion");
    expect(r.sent).toBe(true);

    const [ana, beto] = await filas("t:cotizacion");
    expect(ana).toMatchObject({ recipient_phone: CON_APP, channel: "app", status: "sent" });
    expect(beto).toMatchObject({ recipient_phone: SIN_APP, channel: "whatsapp", status: "sent" });

    // WhatsApp salió una sola vez, y fue al que no tiene la app.
    expect(vi.mocked(wa.sendAdvisorText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(wa.sendAdvisorText).mock.calls[0][1]).toBe(SIN_APP);
    // Y la app recibió el aviso con el camino al chat.
    expect(pushes).toHaveLength(1);
    expect(pushes[0].aviso.ruta).toBe(`#/ticket/${id}`);
    expect(pushes[0].aviso.cuerpo).toContain("Carla Mendoza");
  });

  it("venta confirmada también va por la app", async () => {
    await avisar(await conversacion(), "venta_confirmada", "t:venta");
    const [ana] = await filas("t:venta");
    expect(ana.channel).toBe("app");
  });

  it("lo urgente (pide un asesor) sale por WhatsApp a TODOS y además suena en la app", async () => {
    await avisar(await conversacion(), "human_requested", "t:humano");
    const todas = await filas("t:humano");
    expect(todas.map((f) => f.channel)).toEqual(["whatsapp", "whatsapp"]);
    expect(vi.mocked(wa.sendAdvisorText)).toHaveBeenCalledTimes(2);
    expect(pushes).toHaveLength(1);
  });

  it("si la app no recibe el aviso, sale por WhatsApp: nadie se queda sin enterarse", async () => {
    pushFalla = true;
    await avisar(await conversacion(), "quote_created", "t:app-caida");
    const todas = await filas("t:app-caida");
    expect(todas.map((f) => f.channel)).toEqual(["whatsapp", "whatsapp"]);
    expect(vi.mocked(wa.sendAdvisorText)).toHaveBeenCalledTimes(2);
  });

  it("el mismo aviso dos veces no vuelve a sonar", async () => {
    const id = await conversacion();
    await avisar(id, "quote_created", "t:repetido");
    pushes = [];
    vi.mocked(wa.sendAdvisorText).mockClear();
    const r = await avisar(id, "quote_created", "t:repetido");
    expect(r.skipped).toBe(true);
    expect(pushes).toHaveLength(0);
    expect(vi.mocked(wa.sendAdvisorText)).not.toHaveBeenCalled();
  });

  it("el historial de un asesor trae solo los suyos, con el canal; sin asesor, uno por aviso", async () => {
    const deAna = await app.historialDeAvisos(CON_APP);
    expect(deAna.length).toBeGreaterThan(0);
    expect(deAna.find((a) => a.evento === "venta_confirmada")?.canal).toBe("app");
    expect(deAna.find((a) => a.evento === "human_requested")?.canal).toBe("whatsapp");

    const todos = await app.historialDeAvisos(null);
    const claves = await sql<{ n: number }[]>`select count(distinct dedupe_key)::int as n from advisor_notifications`;
    expect(todos).toHaveLength(claves[0].n);
  });

  it("apagar las notificaciones devuelve a ese asesor a WhatsApp", async () => {
    await app.borrarSuscripcion("https://push.example.test/ana-telefono");
    expect((await app.asesoresConApp()).size).toBe(0);
    await avisar(await conversacion(), "quote_created", "t:sin-app");
    const todas = await filas("t:sin-app");
    expect(todas.map((f) => f.channel)).toEqual(["whatsapp", "whatsapp"]);
    expect(pushes).toHaveLength(0);
  });
});

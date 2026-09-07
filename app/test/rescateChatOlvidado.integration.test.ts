import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * EL RELOJ DEL CHAT OLVIDADO (29-ago-2026, decisión de Manuel: 12 horas).
 *
 * Conv 10201: un asesor tomó el chat, el cliente mandó 26 mensajes en 3 días
 * —con cotización y visita acordadas— y nadie contestó. La red del 8-ago solo
 * devolvía el chat al bot cuando el cliente VOLVÍA a escribir; si no insistía,
 * el silencio era permanente. `rescatarChatsOlvidados` es el reloj que
 * faltaba: barre, devuelve al bot, contesta y le avisa al asesor.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_rescate_olvidado_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

/** El turno real no se dispara en la prueba: se registra a quién habría contestado. */
const rescatados: number[] = [];
vi.mock("../src/services/resumeBot.js", () => ({
  resumeBotIfUnanswered: async (id: number) => {
    rescatados.push(id);
    return "resumed";
  },
}));
vi.mock("../src/services/botPower.js", () => ({ isBotActive: async () => true }));
vi.mock("../src/services/advisorNotifications.js", () => ({
  notifyAdvisor: async () => undefined,
  asesoresActivos: async () => [],
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { rescatarChatsOlvidados } = await import("../src/services/hubMaintenance.js");

const HORAS = 3_600_000;
/** Un jueves a las 10:00 en Quito, dentro del horario: el reloj de estas pruebas. */
const AHORA = new Date("2026-09-03T15:00:00.000Z");

async function chat(
  phone: string,
  opts: {
    horasSinRespuesta: number;
    asesorRespondio?: boolean;
    optOut?: boolean;
    molesto?: boolean;
    pausaVigente?: boolean;
    assignedTo?: "human" | "bot";
    referencia?: Date;
  },
): Promise<number> {
  const ref = (opts.referencia ?? AHORA).getTime();
  const ultimoDelCliente = new Date(ref - opts.horasSinRespuesta * HORAS);
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (
      phone, name, status, stage, current_cycle, assigned_to,
      last_customer_message_at, last_assistant_message_at,
      opted_out_at, negative_sentiment_at, bot_paused_until
    ) values (
      ${phone}, 'Cliente', 'open', 'cotizacion_enviada', 1, ${opts.assignedTo ?? "human"},
      ${ultimoDelCliente},
      ${opts.asesorRespondio ? new Date(ref) : new Date(ultimoDelCliente.getTime() - HORAS)},
      ${opts.optOut ? new Date(ref) : null},
      ${opts.molesto ? new Date(ref) : null},
      ${opts.pausaVigente ? new Date(ref + 5 * HORAS) : null}
    )
    returning id
  `;
  return Number(conv.id);
}

async function estado(id: number) {
  const [fila] = await sql<{ assigned_to: string }[]>`
    select assigned_to from conversations where id=${id}
  `;
  return fila.assigned_to;
}

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("rescatarChatsOlvidados · el reloj de las 12 horas", () => {
  it("EL CASO: 13 h sin respuesta del asesor → vuelve al bot, contesta y avisa", async () => {
    const id = await chat("593990000001", { horasSinRespuesta: 13 });

    const resultados = await rescatarChatsOlvidados({ ahora: AHORA });

    expect(await estado(id)).toBe("bot");
    expect(rescatados).toContain(id);
    expect(resultados.map((r) => r.id)).toContain(id);
    const alertas = await sql<{ summary: string }[]>`
      select summary from bot_alerts where conversation_id=${id} and type='rescate_chat_olvidado'
    `;
    expect(alertas).toHaveLength(1);
    expect(alertas[0].summary).toMatch(/12 h sin respuesta/);
  });

  it("con 5 h todavía no: el asesor tiene su margen", async () => {
    const id = await chat("593990000002", { horasSinRespuesta: 5 });
    await rescatarChatsOlvidados({ ahora: AHORA });
    expect(await estado(id)).toBe("human");
  });

  it("si el asesor ya contestó, el chat es suyo y no se toca", async () => {
    const id = await chat("593990000003", { horasSinRespuesta: 13, asesorRespondio: true });
    await rescatarChatsOlvidados({ ahora: AHORA });
    expect(await estado(id)).toBe("human");
  });

  it("el opt-out no se rescata: «no me escriban más» no vence", async () => {
    const id = await chat("593990000004", { horasSinRespuesta: 13, optOut: true });
    await rescatarChatsOlvidados({ ahora: AHORA });
    expect(await estado(id)).toBe("human");
  });

  it("el cliente molesto tampoco: devolverle el bot es peor que el silencio", async () => {
    const id = await chat("593990000005", { horasSinRespuesta: 13, molesto: true });
    await rescatarChatsOlvidados({ ahora: AHORA });
    expect(await estado(id)).toBe("human");
  });

  it("si un asesor ACABA de tomar el chat (pausa vigente), el reloj no se lo arrebata", async () => {
    // Hallazgo de la revisión del 29-ago: el mensaje del cliente es viejo,
    // pero el asesor lo reclamó hace un momento — ese chat ya es suyo.
    const id = await chat("593990000007", { horasSinRespuesta: 13, pausaVigente: true });
    await rescatarChatsOlvidados({ ahora: AHORA });
    expect(await estado(id)).toBe("human");
  });

  it("fuera de la ventana de 24 h no hay texto libre que mandar: no se toca", async () => {
    const id = await chat("593990000006", { horasSinRespuesta: 30 });
    await rescatarChatsOlvidados({ ahora: AHORA });
    expect(await estado(id)).toBe("human");
  });
});

/**
 * FAMILIA H (auditoría 2-6 sep-2026): diez chats recibieron una respuesta del
 * bot entre las 21:48 y las 05:16, doce horas después del último mensaje del
 * cliente, ignorando lo que el asesor ya había contestado por WhatsApp
 * (conv 4734: «Ya llegué / no hay las llantas» → a las 21:48 el bot le pidió
 * la medida; conv 14864: el asesor ya había corregido la medida y el bot a
 * las 02:47 habló de la vieja). El reloj no miraba la hora ni los ecos.
 */
const { getFollowUpPolicy } = await import("../src/services/followUps.js");
const { getOrCreateConversation } = await import("../src/services/conversations.js");

describe.sequential("rescatarChatsOlvidados · ni de madrugada ni sobre el asesor", () => {

  it("a las 02:47 no se rescata nada aunque lleve 13 h; a las 10:00 sí", async () => {
    const madrugada = new Date("2026-09-04T07:47:00.000Z"); // 02:47 en Quito, viernes
    const id = await chat("593999000221", { horasSinRespuesta: 13, referencia: madrugada });
    await rescatarChatsOlvidados({ horas: 12, ahora: madrugada });
    expect(await estado(id)).toBe("human");
    expect(rescatados).not.toContain(id);
    const manana = new Date("2026-09-04T15:00:00.000Z"); // 10:00 en Quito, mismo viernes
    await rescatarChatsOlvidados({ horas: 12, ahora: manana });
    expect(await estado(id)).toBe("bot");
    expect(rescatados).toContain(id);
    expect((await getFollowUpPolicy()).neverOutsideHours).toBeDefined();
  });

  it("si el asesor contestó por eco (OWNER) después del cliente, el chat es suyo", async () => {
    const id = await chat("593999000222", { horasSinRespuesta: 13 });
    await sql`
      insert into messages (conversation_id, role, content, direction, type, status, author_kind, cycle, created_at)
      values (${id}, 'assistant', 'Le confirmo: sí tenemos la 285/70R17', 'outbound', 'text', 'sent', 'owner', 1,
        ${new Date(AHORA.getTime() - 12 * HORAS)})
    `;
    await rescatarChatsOlvidados({ horas: 12, ahora: AHORA });
    expect(await estado(id)).toBe("human");
    expect(rescatados).not.toContain(id);
  });

  it("un «👍» sobre una venta cerrada no reabre el ciclo (conv 16277)", async () => {
    const phone = "593999000223";
    const conv = await getOrCreateConversation(phone, "Willian");
    await sql`update conversations set status='closed', closed_reason='perdido', closed_at=now(), stage='perdido' where id=${conv.id}`;
    const sinReabrir = await getOrCreateConversation(phone, "Willian", false);
    expect(sinReabrir.status).toBe("closed");
    expect(sinReabrir.current_cycle).toBe(conv.current_cycle);
    const reabierta = await getOrCreateConversation(phone, "Willian", true);
    expect(reabierta.status).toBe("open");
    expect(reabierta.current_cycle).toBe(conv.current_cycle + 1);
  });
});

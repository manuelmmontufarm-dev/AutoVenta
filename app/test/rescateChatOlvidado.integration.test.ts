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

async function chat(
  phone: string,
  opts: {
    horasSinRespuesta: number;
    asesorRespondio?: boolean;
    optOut?: boolean;
    molesto?: boolean;
    pausaVigente?: boolean;
    assignedTo?: "human" | "bot";
  },
): Promise<number> {
  const ultimoDelCliente = new Date(Date.now() - opts.horasSinRespuesta * HORAS);
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (
      phone, name, status, stage, current_cycle, assigned_to,
      last_customer_message_at, last_assistant_message_at,
      opted_out_at, negative_sentiment_at, bot_paused_until
    ) values (
      ${phone}, 'Cliente', 'open', 'cotizacion_enviada', 1, ${opts.assignedTo ?? "human"},
      ${ultimoDelCliente},
      ${opts.asesorRespondio ? new Date() : new Date(ultimoDelCliente.getTime() - HORAS)},
      ${opts.optOut ? new Date() : null},
      ${opts.molesto ? new Date() : null},
      ${opts.pausaVigente ? new Date(Date.now() + 5 * HORAS) : null}
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

    const resultados = await rescatarChatsOlvidados();

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
    await rescatarChatsOlvidados();
    expect(await estado(id)).toBe("human");
  });

  it("si el asesor ya contestó, el chat es suyo y no se toca", async () => {
    const id = await chat("593990000003", { horasSinRespuesta: 13, asesorRespondio: true });
    await rescatarChatsOlvidados();
    expect(await estado(id)).toBe("human");
  });

  it("el opt-out no se rescata: «no me escriban más» no vence", async () => {
    const id = await chat("593990000004", { horasSinRespuesta: 13, optOut: true });
    await rescatarChatsOlvidados();
    expect(await estado(id)).toBe("human");
  });

  it("el cliente molesto tampoco: devolverle el bot es peor que el silencio", async () => {
    const id = await chat("593990000005", { horasSinRespuesta: 13, molesto: true });
    await rescatarChatsOlvidados();
    expect(await estado(id)).toBe("human");
  });

  it("si un asesor ACABA de tomar el chat (pausa vigente), el reloj no se lo arrebata", async () => {
    // Hallazgo de la revisión del 29-ago: el mensaje del cliente es viejo,
    // pero el asesor lo reclamó hace un momento — ese chat ya es suyo.
    const id = await chat("593990000007", { horasSinRespuesta: 13, pausaVigente: true });
    await rescatarChatsOlvidados();
    expect(await estado(id)).toBe("human");
  });

  it("fuera de la ventana de 24 h no hay texto libre que mandar: no se toca", async () => {
    const id = await chat("593990000006", { horasSinRespuesta: 30 });
    await rescatarChatsOlvidados();
    expect(await estado(id)).toBe("human");
  });
});

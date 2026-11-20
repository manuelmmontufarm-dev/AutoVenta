import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * «COTIZACIÓN ENVIADA» SIN COTIZACIÓN (simulador Competimotor, 18-nov, CM27).
 *
 * Tras «ok esa, 4» el bot no cotizó, pero el clasificador barato leyó «el
 * cliente confirmó un único modelo y cantidad» y dejó la etapa en
 * `cotizacion_enviada` con CERO cotizaciones en el ciclo (r1 y r2). Esa etapa
 * es un hecho de la base: solo vale si la cotización existe.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_cot_sin_cot_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: JSON.stringify({ stage: "cotizacion_enviada" }) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      },
    };
  },
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { classifyStage } = await import("../src/agent/classifier.js");

async function conversacion(phone: string, ciclo = 1) {
  const [fila] = await sql<{ id: number; phone: string; name: string; stage: string; current_cycle: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size)
    values (${phone}, 'Cliente', 'open', 'seleccionando', ${ciclo}, '195/65R15')
    returning id, phone, name, stage, current_cycle
  `;
  return fila;
}
const etapa = async (id: number) => (await sql<{ stage: string }[]>`select stage from conversations where id=${id}`)[0].stage;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("el clasificador no pone cotizacion_enviada sin una cotización del ciclo", () => {
  it("CM27: «ok esa, 4» sin cotización → la etapa sigue en seleccionando", async () => {
    const fila = await conversacion("593900002701");
    await classifyStage(fila as never, "ok esa, 4", "Perfecto. ¿Se la cotizo? 😊");
    expect(await etapa(fila.id)).toBe("seleccionando");
  });

  it("con una cotización de OTRO ciclo tampoco", async () => {
    const fila = await conversacion("593900002702", 2);
    await sql`insert into quotes (conversation_id, items, subtotal, tax, total, cycle) values (${fila.id}, '[]'::jsonb, 87, 13, 100, 1)`;
    await classifyStage(fila as never, "ok esa, 4", "¿Se la cotizo?");
    expect(await etapa(fila.id)).toBe("seleccionando");
  });

  it("caso sano: con la cotización del ciclo, avanza", async () => {
    const fila = await conversacion("593900002703");
    await sql`insert into quotes (conversation_id, items, subtotal, tax, total, cycle) values (${fila.id}, '[]'::jsonb, 87, 13, 100, 1)`;
    await classifyStage(fila as never, "ok esa, 4", "Listo, le cotizo…");
    expect(await etapa(fila.id)).toBe("cotizacion_enviada");
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EL CLASIFICADOR, FORZADO A DECIR «GANADO», NO CIERRA UN PEDIDO VIVO
 * (auditoría 19-oct-2026, familia 7-C, chat 462).
 *
 * «Las Falken ya las compré 205 60 16. Ahora necesito las Kenda 195 60 15…»:
 * la primera mitad cuenta una compra pasada, la segunda es la venta de hoy. El
 * modelo barato del clasificador puede leer «ya las compré» igual que lo leía
 * la regla; cerrar como ganado borra el ciclo y el mensaje siguiente saluda de
 * cero. Igual que con «perdido» (`cierrePerdido.integration.test.ts`), el
 * permiso para cerrar lo da la evidencia del texto, no la opinión del modelo.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_s5_ganado_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const respuestaClasificador = vi.hoisted(() => ({ stage: "ganado" }));
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: JSON.stringify({ stage: respuestaClasificador.stage }) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      },
    };
  },
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { classifyStage } = await import("../src/agent/classifier.js");

const CHAT_462 =
  "Las Falken ya las compré 205 60 16.\nAhora necesito las Kenda 195 60 15 será que puedo pagar con tarjeta sin incremento?";

async function conversacion(phone: string) {
  const [fila] = await sql<{ id: number; phone: string; name: string; stage: string; current_cycle: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size)
    values (${phone}, 'Sixto', 'open', 'seguimiento_venta', 5, '195/60R15')
    returning id, phone, name, stage, current_cycle
  `;
  return fila;
}
const estado = (id: number) => sql<{ stage: string; status: string }[]>`select stage, status from conversations where id=${id}`;

beforeAll(async () => { await ensureSchema(); });
beforeEach(() => { respuestaClasificador.stage = "ganado"; });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("«ya compré X, ahora necesito Y» no es ganado", () => {
  it("EL CASO 462: con el modelo diciendo «ganado», la venta sigue abierta", async () => {
    const fila = await conversacion("593900000462");
    await classifyStage(fila as never, CHAT_462, "Con tarjeta no es más caro…");
    expect((await estado(fila.id))[0]).toEqual({ stage: "seguimiento_venta", status: "open" });
  });

  it("caso sano: «ya compré, gracias» cierra como ganado", async () => {
    const fila = await conversacion("593900000463");
    await classifyStage(fila as never, "ya compré, gracias", "¡Gracias por su compra!");
    expect((await estado(fila.id))[0]).toEqual({ stage: "ganado", status: "closed" });
  });
});

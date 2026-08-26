/**
 * El guardián revisa EL CICLO VIGENTE, no la vida entera del cliente.
 *
 * Caso real (26-ago, conv 3 ciclo 5): tras reabrir el ciclo, el revisor leyó
 * el «al de quito sur / mañana» del ciclo anterior y «corrigió» la pregunta
 * de visita nueva —con sus dos links— por un «Como ya me indicó, puede pasar
 * mañana por Quito Sur» que el cliente jamás dijo en este ciclo. La causa:
 * `armarContexto` cargaba los mensajes sin filtrar por ciclo.
 */
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const BASE = `autoventa_guardian_ctx_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { armarContexto } = await import("../src/services/guardian.js");

beforeAll(async () => {
  await ensureSchema();
});

describe("armarContexto · el ciclo cerrado no contamina al vigente", () => {
  it("los mensajes del ciclo viejo no entran al contexto del revisor", async () => {
    const [conv] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle)
      values ('593999111222', 'Cliente', 'open', 'seleccionando', 2)
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values
        (${conv.id}, 1, 'user', 'inbound', 'al de quito sur', 'text'),
        (${conv.id}, 1, 'assistant', 'outbound', 'Perfecto: mañana en Depot Tire Quito Sur.', 'text'),
        (${conv.id}, 2, 'user', 'inbound', 'Necesito una AT para mi pickup 4x4', 'text')
    `;

    const contexto = await armarContexto(conv.id, 2, "¿Qué día puede pasar y cuál local?");

    expect(contexto).toContain("pickup 4x4");
    expect(contexto).not.toMatch(/al de quito sur/i);
    expect(contexto).not.toMatch(/mañana en Depot Tire/i);
  });
});

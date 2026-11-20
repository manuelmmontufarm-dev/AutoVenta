/**
 * EL CLIENTE QUE VUELVE NO RECIBE LA PRESENTACIÓN OTRA VEZ (simulador
 * Competimotor, 18-nov, CM31).
 *
 * «ya compré, gracias» cerró el ciclo 1 (ganado); «buenas, ahora necesito 4 de
 * 265 70 16 pa la camioneta» abrió el 2 y el bot se presentó completo otra vez.
 * La presentación miraba solo el ciclo actual. El /restart y el silencio de
 * más de 12 h siguen dando la bienvenida (regla del 31-ago).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { esClienteQueVuelve } from "../src/domain/clienteQueVuelve.js";
import { MENSAJE_DE_REINICIO } from "../src/domain/reinicio.js";

const BASE = `autoventa_cliente_vuelve_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
let sql: typeof import("../src/db/client.js").sql;
let ultimoSalienteDeOtroCiclo: typeof import("../src/services/conversations.js").ultimoSalienteDeOtroCiclo;

async function conversacion(phone: string, cycle: number) {
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Cliente', 'open', 'nuevo', ${cycle}) returning id
  `;
  return conv.id;
}
async function saliente(id: number, cycle: number, content: string, autor = "bot", haceHoras = 0) {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, type, author_kind, content, created_at)
    values (${id}, ${cycle}, 'assistant', 'outbound', 'text', ${autor}, ${content}, now() - make_interval(hours => ${haceHoras}))
  `;
}

describe.sequential("¿el cliente ya nos conoce?", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.unsafe(`create database ${BASE}`);
    process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.SELLER_PHONE = "593000000000";
    process.env.OPENAI_API_KEY = "test";
    sql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    ultimoSalienteDeOtroCiclo = (await import("../src/services/conversations.js")).ultimoSalienteDeOtroCiclo;
  });
  afterAll(async () => {
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });

  it("CM31: ciclo nuevo tras «ya compré» → vuelve (no se presenta)", async () => {
    const id = await conversacion("593900003101", 2);
    await saliente(id, 1, "¡Hola! 👋 Soy el asistente de Competimotor…");
    await saliente(id, 1, "Gracias por avisarnos. Me alegra que ya haya resuelto su compra. Quedamos a las órdenes para otra ocasión. 🤝");
    expect(esClienteQueVuelve(await ultimoSalienteDeOtroCiclo(id))).toBe(true);
  });

  it("después de un /restart → nuevo (la bienvenida se puede probar)", async () => {
    const id = await conversacion("593900003102", 2);
    await saliente(id, 1, "¡Hola! 👋 Soy el asistente de Competimotor…");
    await saliente(id, 1, MENSAJE_DE_REINICIO, "system");
    expect(esClienteQueVuelve(await ultimoSalienteDeOtroCiclo(id))).toBe(false);
  });

  it("tras el silencio largo (más de 12 h) → nuevo: la regla del 31-ago pide presentarse", async () => {
    const id = await conversacion("593900003104", 2);
    await saliente(id, 1, "¡Hola! 👋 Soy el asistente de Competimotor…", "bot", 20);
    expect(esClienteQueVuelve(await ultimoSalienteDeOtroCiclo(id))).toBe(false);
  });

  it("primera conversación (sin otro ciclo) → nuevo; lo del ciclo actual no cuenta", async () => {
    const id = await conversacion("593900003103", 1);
    await saliente(id, 1, "¿Qué medida usa? Ej: 225/65R17");
    expect(esClienteQueVuelve(await ultimoSalienteDeOtroCiclo(id))).toBe(false);
  });
});

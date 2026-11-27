import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * UN SOLO LOCAL: el candado que agrega la pregunta que falta no pregunta «¿a
 * cuál local?» — falta el día (Competimotor, 18-nov-2026).
 *
 * Simulador, 18-nov 19:05: «si cotícemela» → la cotización directa salió con
 * el mapa de Competimotor y el turno terminó en «¿A cuál local le queda mejor
 * ir? 📍», una pregunta sin opciones que el cliente no puede contestar. El que
 * la pegaba era este candado, porque leía `nearest_store` vacío como «falta el
 * local».
 */
process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_insistir_unico_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { insistirConLoQueFalta } = await import("../src/services/insistirCierre.js");

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

async function conversacionCotizada(phone: string, visita = false): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store, visit_date)
    values (${phone}, 'Jenny', 'open', 'cotizacion_enviada', 1, '235/75R15', null,
      ${visita ? new Date("2026-11-20T15:00:00Z") : null})
    returning id
  `;
  await sql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
    values (${fila.id}, 1, ${sql.json([{
      code: "A0100", brand: "HAIDA", design: "AT HD818 LN", sizeLabel: "235/75R15",
      quantity: 4, salePriceWithTax: 139.99, listPriceWithTax: 139.99,
    }])}, 486.92, 73.04, 559.96, 'COT-X', 'AV-X')
  `;
  return fila.id;
}

describe.sequential("insistir con lo que falta · un solo local", () => {
  it("sin local guardado falta el DÍA, no el local", async () => {
    const id = await conversacionCotizada("593980007001");
    const r = await insistirConLoQueFalta(id, 1, "Listo, le cotizo la *HAIDA AT HD818 LN* 👍");
    expect(r.agregado).toBe("dia");
    // Sprint 2 (auditoría 26-nov): con cotización, la pregunta con dos salidas («hoy» según la hora).
    expect(r.texto).toMatch(/¿(?:Puede acercarse hoy o qué día le agendo la cita|Qué día le agendo la cita)\? 📅/);
    expect(r.texto).not.toMatch(/a cu[aá]l local/i);
    // El mapa ya salió con la cotización: acá no se repite.
    expect(r.texto).not.toContain("maps.app.goo.gl");
  });

  it("con la visita ya registrada no agrega nada", async () => {
    const id = await conversacionCotizada("593980007002", true);
    const r = await insistirConLoQueFalta(id, 1, "Perfecto, le esperamos.");
    expect(r.agregado).toBeNull();
  });
});

describe.sequential("«dónde quedan» · un solo local", () => {
  const MAPA = "📍 *Competimotor* (Vía Quevedo km 1½ y Juan León Mera): https://maps.app.goo.gl/QTFCzK2KDRXULRwz7";

  it("«Aquí queda nuestro local» + el mapa una vez + la pregunta del día; la dirección en prosa se va", async () => {
    const { conElLocalUnico } = await import("../src/services/prepararSalida.js");
    const [fila] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle) values ('593980007003', 'Jenny', 'open', 'nuevo', 1)
      returning id
    `;
    // El turno del simulador del 18-nov, tal como lo dejó el guardián.
    const delGuardian = "Estamos en Santo Domingo.\n\nCompetimotor: Vía Quevedo km 1½ y Juan León Mera #834.";
    const texto = await conElLocalUnico(delGuardian, MAPA, fila.id);
    const bloques = texto.split("\n---\n");
    expect(bloques[0]).toBe("Estamos en Santo Domingo.");
    expect(bloques[1]).toBe(`Aquí queda nuestro local:\n${MAPA}`);
    expect(bloques[2]).toMatch(/^¿Qué día cree que puede ir\?/);
    expect(texto.split("maps.app.goo.gl").length - 1).toBe(1);
    expect(texto.match(/Juan León Mera/g)).toHaveLength(1);
    expect(texto).not.toMatch(/a cu[aá]l local/i);
  });

  it("si el turno ya pregunta otra cosa, no se suma la del día", async () => {
    const { conElLocalUnico } = await import("../src/services/prepararSalida.js");
    const [fila] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle) values ('593980007004', 'Jenny', 'open', 'nuevo', 1)
      returning id
    `;
    const texto = await conElLocalUnico("Estamos en Santo Domingo. ¿Qué medida usa?", MAPA, fila.id);
    expect(texto).not.toContain("¿Qué día");
    expect(texto).toContain("Aquí queda nuestro local:");
  });
});

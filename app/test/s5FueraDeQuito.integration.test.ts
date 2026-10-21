import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * QUIEN ESTÁ FUERA DE QUITO NO RECIBE «¿A CUÁL LOCAL?» NI «¿QUÉ DÍA PASA?»
 * (auditoría 19-oct-2026, familia 7-A), por la puerta real del candado que
 * agrega la pregunta que falta.
 *
 *   27932 · 15-oct 17:36 «Enq parte de Manabi están» → mapas
 *           15-oct 17:37 «Gracias las necesito para MANABI» → «¿A cuál local le queda mejor ir…?»
 *   8924  · 20-oct 00:52 «Soy de provincia..» / «Tungurahua Cantón Pillaro.»
 *           → «¿Qué día cree que puede pasar por Depot Tire Quito Sur?» (tres veces)
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_s5_fuera_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { insistirConLoQueFalta } = await import("../src/services/insistirCierre.js");
const { porQueNoPasaPorElLocal, registrarDondeEstaElCliente } = await import("../src/services/dondeEstaElCliente.js");

async function chat(phone: string, entrantes: string[], local: string | null = null): Promise<number> {
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, nearest_store)
    values (${phone}, 'Cliente', 'open', 'cotizacion_enviada', 1, '175/50R13', ${local}) returning id
  `;
  await sql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
    values (${c.id}, 1, ${sql.json([{ code: "K1", brand: "KENDA", design: "KR33", sizeLabel: "155R13", quantity: 4, salePriceWithTax: 66.86, listPriceWithTax: 89.15 }])},
      232.56, 34.88, 267.44, 'COT-S5', 'AV-S5')
  `;
  for (const [i, texto] of entrantes.entries()) {
    await sql`
      insert into messages (conversation_id, role, content, direction, type, cycle, created_at)
      values (${c.id}, 'user', ${texto}, 'inbound', 'text', 1, now() - make_interval(secs => ${60 - i}))
    `;
  }
  return c.id;
}

const SIN_PREGUNTA = "En Manabí no tenemos local; el asesor ya fue notificado para revisar si le pueden ayudar con su caso desde allá. 🤝";

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("el candado de la pregunta que falta respeta al cliente de provincia", () => {
  it("27932: «parte de Manabí» y después «las necesito para MANABI» → no se agrega el local", async () => {
    const id = await chat("593900027932", ["Mi carro usa en Rin 175 50 13 esta necesito 4 llantas", "Enq parte de Manabi están", "Más información"]);
    const r = await insistirConLoQueFalta(id, 1, SIN_PREGUNTA, "Gracias las necesito para \nMANABI");
    expect(r.agregado).toBeNull();
    expect(r.texto).toBe(SIN_PREGUNTA);
    expect(await porQueNoPasaPorElLocal(id, 1, "Gracias las necesito para \nMANABI")).toBe("fuera_de_cobertura");
  });

  it("8924: «Soy de provincia» + «Tungurahua Cantón Pillaro» → tampoco el día (aunque eligió Quito Sur antes)", async () => {
    const id = await chat("593900008924", ["Quito sur", "Soy de provincia..", "Tungurahua Cantón Pillaro."], "Depot Tire Quito Sur");
    const r = await insistirConLoQueFalta(id, 1, "Gracias, un asesor revisa la opción para provincia.", "La kr29");
    expect(r.agregado).toBeNull();
  });

  it("caso sano: el cliente de Cumbayá sigue recibiendo la pregunta del día", async () => {
    const id = await chat("593900000777", ["vivo en Cumbayá", "Cumbayá"], "Depot Tire Cumbayá");
    const r = await insistirConLoQueFalta(id, 1, "Perfecto, *Depot Tire Cumbayá*.", "Cumbayá");
    expect(r.agregado).toBe("dia");
  });
});

describe.sequential("dónde está el cliente es un hecho de la ficha", () => {
  it("se guarda cuando lo dice y vale en el ciclo siguiente sin releer sus mensajes", async () => {
    const [c] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle) values ('593900027933', 'Marco', 'open', 'nuevo', 1) returning id
    `;
    await registrarDondeEstaElCliente(c.id, 1, "Enq parte de Manabi están");
    const [ficha] = await sql`select cobertura_estado, cobertura_ciudad, cobertura_ciclo from conversations where id=${c.id}`;
    expect(ficha).toEqual({ cobertura_estado: "fuera", cobertura_ciudad: "Manabí", cobertura_ciclo: 1 });
    // Ningún mensaje guardado: lo que responde es el hecho.
    expect(await porQueNoPasaPorElLocal(c.id, 2, "Hola, ¿tienen 175/50R13?")).toBe("fuera_de_cobertura");
    // Un mensaje que no habla de lugares no lo borra.
    await registrarDondeEstaElCliente(c.id, 2, "Gracias");
    expect(await porQueNoPasaPorElLocal(c.id, 2, null)).toBe("fuera_de_cobertura");
    // Y si dice que viene, en ese ciclo vale el viaje.
    await registrarDondeEstaElCliente(c.id, 2, "El lunes voy a estar en Quito");
    expect(await porQueNoPasaPorElLocal(c.id, 2, null)).toBeNull();
  });
});

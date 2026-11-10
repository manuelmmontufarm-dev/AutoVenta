/**
 * SPRINT 5a (vuelta 2, simulador del 9-nov) — el Guardián sabe que el cliente
 * no puede venir.
 *
 *   40082 · «Yo vivo en pedernales»: el borrador decía bien «Nuestros locales
 *           están en Quito… no tenemos local fuera de Quito». El Guardián mini
 *           lo reescribió con «¿Qué día puede pasar y a cuál local?» y los
 *           mapas; `sin_visita_si_no_puede_venir` quitó todo eso y el turno quedó
 *           vacío («Le consulto con un asesor…»).
 *   39845 · «Estoy por el oriente…»: el Guardián puso la pregunta del día
 *           porque el hecho DÍA DE VISITA PENDIENTE se la pedía.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const BASE = `autoventa_s5a_guardian_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { armarContexto } = await import("../src/services/guardian.js");

async function conversacion(phone: string, cliente: string): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, nearest_store, tire_size)
    values (${phone}, 'Cliente', 'open', 'cotizacion_enviada', 1, 'Depot Tire Quito Sur', '245/75R16') returning id
  `;
  await sql`
    insert into messages (conversation_id, cycle, role, direction, content, type)
    values (${fila.id}, 1, 'user', 'inbound', ${cliente}, 'text')
  `;
  return fila.id;
}

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe("armarContexto · CLIENTE FUERA DE COBERTURA", () => {
  it("40082: «Yo vivo en pedernales» → el hecho prohíbe local, día y mapas, y no pide el día pendiente", async () => {
    const id = await conversacion("593980054001", "Yo vivo en pedernales");
    const contexto = await armarContexto(id, 1, "Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.");
    expect(contexto).toContain("CLIENTE FUERA DE COBERTURA");
    expect(contexto).not.toContain("DÍA DE VISITA PENDIENTE");
  });

  it("39597: «soy de bolivar esta muy aledado» → igual", async () => {
    const id = await conversacion("593980054002", "esq soy de bolivar esta muy aledado muchas gracias");
    const contexto = await armarContexto(id, 1, "Entendido, gracias a usted 🤝");
    expect(contexto).toContain("CLIENTE FUERA DE COBERTURA");
    expect(contexto).not.toContain("DÍA DE VISITA PENDIENTE");
  });

  it("SANO 39329 (revisión ronda 1): «La próxima semana estoy por allá, este rato estoy trabajando en el oriente» → viene: SÍ el día pendiente", async () => {
    const id = await conversacion("593980054004", "La próxima semana estoy por allá, este rato estoy trabajando en el oriente");
    const contexto = await armarContexto(id, 1, "Perfecto, le esperamos.");
    expect(contexto).not.toContain("CLIENTE FUERA DE COBERTURA");
    expect(contexto).toContain("DÍA DE VISITA PENDIENTE");
  });

  it("SANO 39845 (revisión ronda 1): «Estoy por el oriente llego en 15 días…» → viene, no fuera", async () => {
    const id = await conversacion("593980054005", "Estoy por el oriente llego en 15 días asta entonces seguiré cotizando");
    const contexto = await armarContexto(id, 1, "Perfecto, seguimos cotizando por aquí.");
    expect(contexto).not.toContain("CLIENTE FUERA DE COBERTURA");
  });

  it("SANO: el cliente de Quito con local y sin día sigue recibiendo DÍA DE VISITA PENDIENTE", async () => {
    const id = await conversacion("593980054003", "Gracias");
    const contexto = await armarContexto(id, 1, "Con gusto.");
    expect(contexto).not.toContain("CLIENTE FUERA DE COBERTURA");
    expect(contexto).toContain("DÍA DE VISITA PENDIENTE");
  });
});

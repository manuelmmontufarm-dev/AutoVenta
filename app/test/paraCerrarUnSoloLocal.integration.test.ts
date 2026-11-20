import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * PARA CERRAR CON UN SOLO LOCAL (Competimotor, 20-nov-2026).
 *
 * En la reunión dijeron que alguien ya había dado fecha y no salía en la
 * pestaña. Era Erick Acosta (conv 302): cotización de $809.60, «voy el sábado»,
 * visita guardada para el 21-nov. No salía porque la consulta exigía local
 * elegido (`nearest_store` + «Local elegido…»), y con un solo local el bot
 * nunca pregunta cuál: manda el mapa y pide el día. O sea, en un negocio de un
 * local la pestaña quedaba vacía para siempre.
 *
 * Va de integración porque el filtro vive en el SQL.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_para_cerrar_un_local_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { leerParaCerrar } = await import("../src/services/paraCerrar.js");
const { LOCAL_ELEGIDO } = await import("../src/services/conversations.js");

// Viernes 20-nov-2026, 13:00 en Santo Domingo.
const AHORA = new Date("2026-11-20T18:00:00Z");

async function chatCotizado(phone: string, local: { store: string; label: string } | null) {
  const [c] = await sql<{ id: string }[]>`
    insert into conversations (phone, name) values (${phone}, 'Erick Acosta') returning id
  `;
  await sql`
    update conversations set
      tire_size = '275/55R20',
      visit_date = '2026-11-21T15:00:00Z',
      customer_commitment = 'voy el sábado',
      last_customer_message_at = '2026-11-20T03:08:43Z',
      nearest_store = ${local?.store ?? null},
      location_label = ${local?.label ?? null}
    where id = ${c.id}
  `;
  await sql`
    insert into quotes (conversation_id, items, subtotal, tax, total, cycle, created_at)
    values (${c.id}, ${sql.json([{ quantity: 4, brand: "SUMAXX", design: "ALL TERRAIN AT" }])},
            704, 105.6, 809.6, 1, '2026-11-20T02:57:28Z')
  `;
  return Number(c.id);
}

const todos = (r: Awaited<ReturnType<typeof leerParaCerrar>>) => [
  ...r.paraCerrar, ...r.empujando, ...r.archivo,
];

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("Para cerrar · negocio de un solo local", () => {
  it("con un solo local, quien cotizó y dio fecha SÍ sale, con el único local", async () => {
    const id = await chatCotizado("593980009155", null);
    const r = await leerParaCerrar(AHORA, "Competimotor");
    const erick = r.paraCerrar.find((c) => c.ticketId === id);
    expect(erick).toBeDefined();
    expect(erick?.local).toBe("Competimotor");
    expect(erick?.visita?.slice(0, 10)).toBe("2026-11-21");
  });

  it("con varios locales sigue exigiendo que el cliente haya elegido uno (Depot)", async () => {
    const sinElegir = await chatCotizado("593980009156", null);
    const elegido = await chatCotizado("593980009157", {
      store: "Cumbayá", label: `${LOCAL_ELEGIDO} por el cliente: Cumbayá`,
    });
    const ids = todos(await leerParaCerrar(AHORA, null)).map((c) => c.ticketId);
    expect(ids).not.toContain(sinElegir);
    expect(ids).toContain(elegido);
  });
});

/**
 * «ESTÁ CARO» TRAS UNA COTIZACIÓN, CON OTRA CANTIDAD (Competimotor, chat 1974,
 * 27-nov-2026). El bot cotizó 4 × MAXXIS MAS1 MARAUDER 255/60R15 ($671.60) y el
 * cliente contestó «Esta  caro solo dos necesito». La respuesta salió con los
 * totales de 4: con cotización, la cantidad salía de la cotización y lo que el
 * cliente dijo después no se leía. Ahora manda lo que dijo, y la ficha queda en 2
 * para que el «sí» que sigue cotice 2.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEGOCIO = "mundillantas";
  delete process.env.IDENTIDAD;
});

const BASE = `autoventa_objecion_cantidad_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
let sql: typeof import("../src/db/client.js").sql;
let svc: typeof import("../src/services/objecionDePrecio.js");

const COTIZADA = [{ code: "MX-MAS1-2556015", brand: "MAXXIS", design: "MAS1 MARAUDER", sizeLabel: "255/60R15", quantity: 4, salePriceWithTax: 167.9 }];

async function conversacion(phone: string, cantidadDeLaFicha = 4) {
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, selected_quantity)
    values (${phone}, 'Cliente', 'open', 'cotizacion', 1, ${cantidadDeLaFicha}) returning id
  `;
  return conv.id;
}
async function mensaje(id: number, dir: "inbound" | "outbound", content: string, at: string) {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, type, author_kind, content, created_at)
    values (${id}, 1, ${dir === "inbound" ? "user" : "assistant"}, ${dir}, 'text', ${dir === "inbound" ? "customer" : "bot"}, ${content}, ${at})
  `;
}
async function cotizacion(id: number, at: string) {
  await sql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, created_at)
    values (${id}, 1, ${sql.json(COTIZADA as never)}, 584, 87.6, 671.6, 'COT-MWZCEM9Q', ${at})
  `;
}

describe.sequential("«está caro» con otra cantidad tras la cotización (1974)", () => {
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
    svc = await import("../src/services/objecionDePrecio.js");
  });
  afterAll(async () => {
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });

  it("1974: «Esta caro solo dos necesito» → los precios por 2 y la ficha queda en 2", async () => {
    const id = await conversacion("593900197401");
    await mensaje(id, "inbound", "255/60/15", "2026-11-27T18:54:00Z");
    await cotizacion(id, "2026-11-27T18:56:00Z");
    await mensaje(id, "outbound", "Cotización COT-MWZCEM9Q enviada por $671.60", "2026-11-27T18:56:05Z");
    await mensaje(id, "inbound", "Esta  caro solo dos necesito", "2026-11-27T18:57:00Z");

    const vio = await svc.loQueVioElCliente(id, 1);
    expect(vio?.cantidad).toBe(2);
    expect(vio?.cantidadCambio).toBe(true);

    const r = await svc.respuestaAObjecionDeLaConversacion(id, 1);
    expect(r).toContain("Para *2 llantas*");
    expect(r).toContain("MAXXIS MAS1 MARAUDER — *$335.80* con tarjeta");
    // «comprando 2 o 4 llantas» es el INCLUYE fijo; lo que no puede volver es el total de 4.
    expect(r).not.toMatch(/671\.60|\*4 llantas\*|— 4 llantas/);
    const [ficha] = await sql<{ selected_quantity: number }[]>`select selected_quantity from conversations where id=${id}`;
    expect(ficha.selected_quantity).toBe(2);
  });

  it("lo que dijo ANTES de la cotización no cuenta: la cotización ya lo trae", async () => {
    const id = await conversacion("593900197402");
    await mensaje(id, "inbound", "necesito 2", "2026-11-27T18:50:00Z");
    await cotizacion(id, "2026-11-27T18:56:00Z");
    await mensaje(id, "inbound", "Esta caro", "2026-11-27T18:57:00Z");
    const vio = await svc.loQueVioElCliente(id, 1);
    expect(vio?.cantidad).toBe(4);
    expect(vio?.cantidadCambio).toBeUndefined();
  });

  it("si repite la misma cantidad cotizada, no hay cambio que anunciar", async () => {
    const id = await conversacion("593900197403");
    await cotizacion(id, "2026-11-27T18:56:00Z");
    await mensaje(id, "inbound", "está caro, necesito 4", "2026-11-27T18:57:00Z");
    const vio = await svc.loQueVioElCliente(id, 1);
    expect(vio?.cantidad).toBe(4);
    expect(vio?.cantidadCambio).toBeUndefined();
  });
});

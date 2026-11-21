/**
 * `resumenComprobables` de punta a punta contra Postgres, en un negocio SIN
 * sistema contable (sin `CONTIFICO_API_KEY` ni facturas por archivo): las
 * ventas salen de `ventas_registradas`. Antes de este cambio devolvía
 * `disponible: false` y el panel decía «Sin Contífico».
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
delete process.env.CONTIFICO_API_KEY;

const BASE = `autoventa_metricas_registro_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { resumenComprobables } = await import("../src/services/metricasComprobables.js");

const mesActual = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit" }).format(new Date());

async function chat(phone: string, name: string, haceDias: number): Promise<number> {
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, created_at) values (${phone}, ${name}, now() - make_interval(days => ${haceDias})) returning id`;
  await sql`insert into messages (conversation_id, role, direction, content) values (${c.id}, 'user', 'inbound', 'precio 205/55R16')`;
  await sql`insert into messages (conversation_id, role, direction, content, author_kind) values (${c.id}, 'assistant', 'outbound', 'Te cotizo', 'bot')`;
  return Number(c.id);
}

async function registro(conversationId: number | null, factura: string | null, monto: number | null, anulada = false) {
  await sql`
    insert into ventas_registradas (vendedor, telefono, tel9, factura, vino_de_whatsapp, conversation_id, dia, monto, origen, anulada_at)
    values ('Panel', '0991234567', '991234567', ${factura}, ${conversationId != null}, ${conversationId}, current_date, ${monto}, 'panel',
      ${anulada ? sql`now()` : null})`;
}

beforeAll(async () => {
  await ensureSchema();
  const jumbo = await chat("593991111111", "Abg Jumbo", 0);
  const luis = await chat("593992222222", "Luis", 0);
  const ana = await chat("593993333333", "Ana", 0);
  await registro(jumbo, "860", 437);
  await registro(luis, "901", 200);
  await registro(luis, "902", 30);       // segunda factura del mismo ticket: se suma
  await registro(ana, "903", 500, true); // anulada: no cuenta
  await registro(null, "904", 115);      // número que nunca escribió: no es del bot
});

afterAll(async () => {
  await sql.end();
  const a = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
  await a.unsafe(`drop database if exists ${BASE}`);
  await a.end();
});

describe("sin sistema contable, Métricas → Ventas sale del registro", () => {
  it("2 ventas (una con 2 facturas), sin la anulada ni la que no tiene chat", async () => {
    const m = await resumenComprobables(mesActual);
    expect(m.disponible).toBe(true);
    expect(m.fuente).toBe("registro");
    expect(m.ventas.n).toBe(2);
    expect(m.ventas.conIva).toBe(667);
    expect(m.ventas.sinIva).toBe(580);
    expect(m.embudo.chats).toBe(3);
    expect(m.embudo.compraron).toBe(2);
    expect(m.registradas.find((r) => r.nombre === "Luis")?.facturas.map((f) => f.numero)).toEqual(["901", "902"]);
    expect(m.participacion.periodo.llantasTienda).toBe(0);
    expect(JSON.stringify(m)).not.toMatch(/59399/); // sin teléfonos
  });
});

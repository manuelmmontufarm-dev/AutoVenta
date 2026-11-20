/**
 * «NO GRACIAS» CIERRA EL CICLO Y «YA COMPRÉ» LLEGA EN EL SIGUIENTE (20-nov).
 *
 * Con `rechazoCierraComoPerdida` (Competimotor) el «no gracias» de CM30 cierra el
 * ciclo como perdido; el «ya compré» siguiente abre otro. El mensaje anterior del
 * cliente tiene que seguir siendo el «no gracias» (misma visita, 12 h): así el
 * cierre es `compra_ajena` (perdida) y no `compra_terminada` (ganada).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tipoDeCierreDelTurno } from "../src/domain/cierreTurno.js";

const BASE = `autoventa_cierre_ciclos_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
let sql: typeof import("../src/db/client.js").sql;
let previousInboundText: typeof import("../src/services/conversations.js").previousInboundText;

async function conversacion(phone: string, cycle: number) {
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Cliente', 'open', 'nuevo', ${cycle}) returning id
  `;
  return conv.id;
}
async function entrante(id: number, cycle: number, content: string, haceHoras = 0) {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, type, author_kind, content, created_at)
    values (${id}, ${cycle}, 'user', 'inbound', 'text', 'customer', ${content}, now() - make_interval(hours => ${haceHoras}))
  `;
}

describe.sequential("el mensaje anterior del cliente, aunque el ciclo haya cambiado", () => {
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
    previousInboundText = (await import("../src/services/conversations.js")).previousInboundText;
  });
  afterAll(async () => {
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });

  it("CM30: «no gracias» (ciclo 1, cerrado) + «ya compre» (ciclo 2) → compra_ajena", async () => {
    const id = await conversacion("593900003001", 2);
    await entrante(id, 1, "no gracias");
    await entrante(id, 2, "ya compre");
    const anterior = await previousInboundText(id);
    expect(anterior).toBe("no gracias");
    expect(tipoDeCierreDelTurno("ya compre", anterior)).toBe("compra_ajena");
  });

  it("un ciclo anterior de hace más de 12 h no cuenta", async () => {
    const id = await conversacion("593900003002", 2);
    await entrante(id, 1, "no gracias", 30);
    await entrante(id, 2, "ya compre");
    expect(await previousInboundText(id)).toBeNull();
  });

  it("dentro del mismo ciclo, como siempre", async () => {
    const id = await conversacion("593900003003", 1);
    await entrante(id, 1, "hola");
    await entrante(id, 1, "no gracias");
    expect(await previousInboundText(id)).toBe("hola");
  });
});

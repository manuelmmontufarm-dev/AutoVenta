import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * UN TURNO VE SOLO LOS MENSAJES QUE ATIENDE (auditoría 19-oct-2026, familia
 * 7-D, chat 29847).
 *
 *   15:33:13 CLIENTE «¡Hola! Me gustaría conseguir más información sobre esto.»
 *   15:33:25 CLIENTE (audio) «¿A cómo sale el rin 14 para auto? … Anchitas.»
 *
 * El audio se transcribe antes de entrar al agrupador y llegó DESPUÉS de que
 * el turno del texto ya había arrancado. La cola FIFO hizo su trabajo —el turno
 * del audio esperó al del texto—, pero el turno del texto leyó los hechos de
 * venta de la base cuando el audio ya estaba guardado: `aroDelCliente` = 14, y
 * mandó la lámina de rin 14. Después el turno del audio la volvió a contestar:
 * otra lámina y una cotización de 165/65R14 que nadie pidió. `getHistory` ya
 * cortaba en el último mensaje del turno; los hechos no.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_s5_turno_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { getAgentSalesFacts } = await import("../src/agent/agent.js");
const { medidasDelPedido } = await import("../src/services/medidasDelPedido.js");
const { enElTurno } = await import("../src/pipeline/corteDelTurno.js");

const TEXTO = "¡Hola! Me gustaría conseguir más información sobre esto.";
const AUDIO = "[El cliente mandó un audio. Dice: Buenos días, buenos días. ¿A cómo sale el rin 14 para auto? Me confirman. Anchitas.]";

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

async function chat(phone: string, segundo: string): Promise<{ id: number; hastaElTexto: number }> {
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle) values (${phone}, 'Salvador', 'open', 'nuevo', 1)
    returning id
  `;
  const [t] = await sql<{ id: number }[]>`
    insert into messages (conversation_id, cycle, role, direction, type, content, created_at)
    values (${c.id}, 1, 'user', 'inbound', 'text', ${TEXTO}, now() - interval '20 seconds') returning id
  `;
  await sql`
    insert into messages (conversation_id, cycle, role, direction, type, content, created_at)
    values (${c.id}, 1, 'user', 'inbound', 'text', ${segundo}, now() - interval '8 seconds')
  `;
  return { id: c.id, hastaElTexto: t.id };
}

describe.sequential("los hechos del turno se cortan en su último mensaje", () => {
  it("EL CASO DEL CHAT: el turno del texto no ve el aro del audio que llegó después", async () => {
    const { id, hastaElTexto } = await chat("593900005001", AUDIO);
    const delTurno = await enElTurno(hastaElTexto, () => getAgentSalesFacts(id));
    expect(delTurno.aroDelCliente).toBeNull();
    // El turno del audio, sin corte (o con el suyo), sí lo ve.
    expect((await getAgentSalesFacts(id)).aroDelCliente).toBe(14);
  });

  it("tampoco ve la medida que el cliente escribió en el mensaje siguiente", async () => {
    const { id, hastaElTexto } = await chat("593900005002", "195/65R15");
    expect((await enElTurno(hastaElTexto, () => getAgentSalesFacts(id))).medidaConfirmadaPorCliente).toBe(false);
    expect(await enElTurno(hastaElTexto, () => medidasDelPedido(id, 1, TEXTO))).toEqual([]);
    expect(await medidasDelPedido(id, 1, "195/65R15")).toEqual(["195/65R15"]);
  });
});

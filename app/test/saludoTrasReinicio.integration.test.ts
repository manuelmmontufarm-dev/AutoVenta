/**
 * EL SALUDO SOBREVIVE AL REINICIO.
 *
 * Simulador, 31-ago-2026: `/restart` y enseguida «hola». La bienvenida salió
 * partida por la mitad — llegó la pregunta suelta «¿Qué medida usa? Ej:
 * 225/65R17» y NADA de la presentación. El culpable no era el saludo sino el
 * candado `sin_calco_reciente`: su consulta miraba los salientes de los últimos
 * 10 minutos SIN filtrar por ciclo, así que veía la bienvenida del ciclo
 * anterior —enviada segundos antes— y se comía el bloque por «repetido».
 *
 * Tras un reinicio, el ciclo viejo es otra conversación: volver a presentarse
 * es lo correcto. Dentro del MISMO ciclo, en cambio, el candado tiene que
 * seguir mordiendo (ese es el caso del 31-ago que lo hizo nacer, conv 3 c20).
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = `autoventa_saludo_reinicio_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let sql: typeof import("../src/db/client.js").sql;
let PASOS: typeof import("../src/services/prepararSalida.js").PASOS;
let firstContactReply: typeof import("../src/domain/firstContact.js").firstContactReply;

const calco = () => {
  const paso = PASOS.find((p) => p.nombre === "sin_calco_reciente");
  if (!paso) throw new Error("el paso sin_calco_reciente ya no existe");
  return paso;
};

async function conversacion(phone: string, cycle: number) {
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle)
    values (${phone}, 'Manuel', 'open', 'nuevo', ${cycle})
    returning id
  `;
  return conv.id;
}

/** Un saliente del bot, en el ciclo que se le diga. */
async function yaDijimos(conversationId: number, cycle: number, content: string) {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, type, author_kind, content)
    values (${conversationId}, ${cycle}, 'assistant', 'outbound', 'text', 'bot', ${content})
  `;
}

describe.sequential("el saludo sobrevive al /restart", () => {
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
    process.env.GRAPH_BASE_URL = "http://127.0.0.1:9";

    sql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    PASOS = (await import("../src/services/prepararSalida.js")).PASOS;
    firstContactReply = (await import("../src/domain/firstContact.js")).firstContactReply;
  });

  afterAll(async () => {
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });

  it("la bienvenida del ciclo anterior no borra la del ciclo nuevo", async () => {
    const id = await conversacion("593900000301", 2);
    // Lo que se dijo ANTES del /restart: la misma bienvenida, hace segundos.
    await yaDijimos(id, 1, firstContactReply());

    const salida = await calco().aplicar(firstContactReply(), {
      conversation: { id, current_cycle: 2 },
    } as never);

    expect(salida).toBe(firstContactReply());
    expect(salida).toContain("Soy el asistente de Depot Tire");
  });

  it("dentro del mismo ciclo el candado sigue mordiendo (conv 3 c20, 31-ago)", async () => {
    const id = await conversacion("593900000302", 2);
    const bloqueDeLocales =
      "CUMBAYÁ 📍: https://maps.app.goo.gl/abc\nQUITO SUR 📍: https://maps.app.goo.gl/xyz";
    await yaDijimos(id, 2, bloqueDeLocales);

    const salida = await calco().aplicar(bloqueDeLocales, {
      conversation: { id, current_cycle: 2 },
    } as never);

    expect(salida).toBeNull();
  });
});

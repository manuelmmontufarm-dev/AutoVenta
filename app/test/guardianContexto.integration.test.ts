/**
 * El guardián revisa EL CICLO VIGENTE, no la vida entera del cliente.
 *
 * Caso real (26-ago, conv 3 ciclo 5): tras reabrir el ciclo, el revisor leyó
 * el «al de quito sur / mañana» del ciclo anterior y «corrigió» la pregunta
 * de visita nueva —con sus dos links— por un «Como ya me indicó, puede pasar
 * mañana por Quito Sur» que el cliente jamás dijo en este ciclo. La causa:
 * `armarContexto` cargaba los mensajes sin filtrar por ciclo.
 */
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const BASE = `autoventa_guardian_ctx_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { armarContexto } = await import("../src/services/guardian.js");

beforeAll(async () => {
  await ensureSchema();
  await sql`
    insert into settings (key, value) values ('store_hours', ${sql.json({
      cumbaya: {
        weekday: { open: "07:45", close: "17:15", closed: false },
        weekend: { open: "08:30", close: "13:00", closed: false },
        excepciones: [],
      },
      quitoSur: {
        weekday: { open: "08:15", close: "18:00", closed: false },
        weekend: { open: "09:00", close: "14:00", closed: false },
        excepciones: [],
      },
    } as never)})
    on conflict (key) do update set value=excluded.value
  `;
});

describe("armarContexto · el ciclo cerrado no contamina al vigente", () => {
  it("los mensajes del ciclo viejo no entran al contexto del revisor", async () => {
    const [conv] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle)
      values ('593999111222', 'Cliente', 'open', 'seleccionando', 2)
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values
        (${conv.id}, 1, 'user', 'inbound', 'al de quito sur', 'text'),
        (${conv.id}, 1, 'assistant', 'outbound', 'Perfecto: mañana en Depot Tire Quito Sur.', 'text'),
        (${conv.id}, 2, 'user', 'inbound', 'Necesito una AT para mi pickup 4x4', 'text')
    `;

    const contexto = await armarContexto(conv.id, 2, "¿Qué día puede pasar y cuál local?");

    expect(contexto).toContain("pickup 4x4");
    expect(contexto).not.toMatch(/al de quito sur/i);
    expect(contexto).not.toMatch(/mañana en Depot Tire/i);
  });
});

/**
 * EL DETECTOR QUE FALTABA: lo que el bot promete vs lo que el sistema anotó.
 *
 * Reproduce el cierre de la conversación 9878 (24-ago). El bot escribió «Listo,
 * jueves de 4 a 5 pm en Depot Tire Quito Sur» y `visit_date` quedó en NULL. El
 * guardián aprobó ese mensaje —y hacía bien, el texto era correcto—, pero no
 * tenía cómo notar que nadie lo había registrado: los hechos solo se escribían
 * cuando existían, así que la ausencia era invisible.
 *
 * Con la ausencia dicha en voz alta, «Visita registrada: (ninguna)» junto a un
 * BOT que acaba de confirmar el jueves es una contradicción que el revisor sí
 * puede ver, y la instrucción 11 le dice cómo llamarla.
 */
describe("armarContexto · la ausencia también es un hecho", () => {
  it("incluye los horarios configurados como hechos verificables", async () => {
    const [conv] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle)
      values ('593998447909', 'Horarios', 'open', 'nuevo', 1)
      returning id
    `;
    const contexto = await armarContexto(conv.id, 1, "Atendemos hasta las 17:15.");
    expect(contexto).toContain("Horarios confirmados:");
    expect(contexto).toContain("Cumbayá: lunes a viernes 07:45–17:15");
    expect(contexto).toContain("Quito Sur: lunes a viernes 08:15–18:00");
  });

  it("dice «(ninguna)» cuando el bot confirmó una visita que nadie registró", async () => {
    const [conv] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle, nearest_store)
      values ('593998447910', 'Cesar', 'open', 'seguimiento_venta', 1, 'Depot Tire Quito Sur')
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values
        (${conv.id}, 1, 'user', 'inbound', 'X eso el juebes', 'text'),
        (${conv.id}, 1, 'assistant', 'outbound', 'Listo, jueves de 4 a 5 pm en Depot Tire Quito Sur.', 'text')
    `;

    const contexto = await armarContexto(conv.id, 1, "Queda avisado para su cotización 🤝");

    expect(contexto).toContain("Visita registrada: (ninguna)");
    expect(contexto).toContain("Local ya elegido: Depot Tire Quito Sur");
    expect(contexto).toContain("jueves de 4 a 5 pm");
  });

  it("escribe la visita con la hora que dijo el cliente, no con el relleno", async () => {
    const [conv] = await sql<{ id: number }[]>`
      insert into conversations (
        phone, name, status, stage, current_cycle, nearest_store, visit_date, visit_time_label
      ) values (
        '593998447911', 'Cesar', 'open', 'seguimiento_venta', 1, 'Depot Tire Quito Sur',
        '2026-08-27T15:00:00Z', 'de 4 a 5 pm'
      ) returning id
    `;
    const contexto = await armarContexto(conv.id, 1, "Le esperamos 🤝");
    expect(contexto).toMatch(/Visita registrada: jueves 27 de agosto de 4 a 5 pm/);
  });

  /*
   * Un seguimiento no contesta a nadie: si le llega la misma vara que a una
   * respuesta, el revisor le exige responder la última pregunta del cliente y
   * corrige de más. Este bloque es lo que le dice qué está mirando.
   */
  it("el modo seguimiento cambia la vara con la que se revisa", async () => {
    const [conv] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle)
      values ('593998447912', 'Cesar', 'open', 'seguimiento_venta', 1)
      returning id
    `;
    const respuesta = await armarContexto(conv.id, 1, "texto", []);
    const seguimiento = await armarContexto(conv.id, 1, "texto", [], { tipo: "seguimiento" });

    expect(respuesta).toContain("== BORRADOR QUE EL BOT QUIERE ENVIAR ==");
    expect(respuesta).not.toMatch(/SEGUIMIENTO AUTOMÁTICO/);
    expect(seguimiento).toContain("== SEGUIMIENTO QUE EL BOT QUIERE ENVIAR ==");
    expect(seguimiento).toMatch(/ESTO ES UN SEGUIMIENTO AUTOMÁTICO/);
    expect(seguimiento).toMatch(/CONFIRMA y recuerda/);
  });
});

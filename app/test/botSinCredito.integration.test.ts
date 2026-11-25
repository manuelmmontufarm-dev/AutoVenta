import { createServer, type Server } from "node:http";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EL TURNO ENTERO, CON OPENAI SIN CRÉDITO (24-nov-2026).
 *
 * `avisosASoporte.integration.test.ts` prueba el servicio. Esta prueba el
 * CABLE: el agente de verdad (`runAgent`), contra un OpenAI de mentira que
 * contesta lo mismo que contestó el real ese día —
 *
 *   429 «You have no credits remaining. Add credits to continue using the API…»
 *
 * — y comprueba que a Manuel le llega UN aviso aunque fallen seis chats a la
 * vez, que al cliente no se le pide repetir, que con el bot apagado a propósito
 * no llega nada y que cuando OpenAI vuelve a contestar llega el «volvió».
 */
const BASE = `autoventa_sin_credito_${process.pid}`;
const admin = postgres(`postgresql://${process.env.USER}@localhost/postgres`, { prepare: false, max: 1 });

vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return { ...real, sendAdvisorText: vi.fn(async () => "wamid.TEXTO"), sendAdvisorTemplate: vi.fn(async () => "wamid.PLANTILLA") };
});

let sql: typeof import("../src/db/client.js").sql;
let agent: typeof import("../src/agent/agent.js");
let soporte: typeof import("../src/services/avisosASoporte.js");
let botPower: typeof import("../src/services/botPower.js");
let stub: Server;
/** Lo que contesta el OpenAI de mentira: sin crédito, o una respuesta normal. */
let sinCredito = true;
let pushes: { endpoint: string; aviso: { titulo: string; cuerpo: string } }[] = [];

async function turno(nombre: string, telefono: string): Promise<{ id: number; respuesta: string }> {
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, stage, tire_size, last_customer_message_at)
    values (${telefono}, ${nombre}, 'nuevo', '205/55R16', now())
    on conflict (phone) do update set name = excluded.name
    returning id
  `;
  const respuesta = await agent.runAgent({
    conversation: { id: c.id, phone: telefono, name: nombre, stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: telefono,
    currentUserText: "cuánto cuestan las 205/55R16",
  } as never, "cuánto cuestan las 205/55R16");
  return { id: Number(c.id), respuesta };
}

const avisos = () => sql<{ clase: string; titulo: string; cuerpo: string; push_enviados: number }[]>`
  select clase, titulo, cuerpo, push_enviados from avisos_a_soporte order by id
`;

/** El aviso sale sin frenar el turno: se espera a que quede anotado. */
async function esperarAvisos(cuantos: number, ms = 5000): Promise<Awaited<ReturnType<typeof avisos>>> {
  const hasta = Date.now() + ms;
  for (;;) {
    const filas = await avisos();
    if (filas.length >= cuantos || Date.now() > hasta) return filas;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe.sequential("OpenAI sin crédito, de punta a punta", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.unsafe(`create database ${BASE}`);

    stub = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        if (sinCredito) {
          // `retry-after-ms` solo acorta la espera del reintento del SDK en la prueba.
          res.writeHead(429, { "Content-Type": "application/json", "retry-after-ms": "5" });
          res.end(JSON.stringify({ error: {
            message: "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
            type: "insufficient_quota", param: null, code: "insufficient_quota",
          } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "stub", choices: [{ index: 0, finish_reason: "stop",
            message: { role: "assistant", content: "En 205/55R16 tengo Falken y Kenda 🛞 ¿Cuántas llantas necesita?" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }));
      });
    });
    await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));

    process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${BASE}`;
    process.env.OPENAI_API_KEY = "stub";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(stub.address() as { port: number }).port}/v1`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.BOT_POWER_CACHE_MS = "0";

    sql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    agent = await import("../src/agent/agent.js");
    soporte = await import("../src/services/avisosASoporte.js");
    botPower = await import("../src/services/botPower.js");
    const app = await import("../src/services/avisosEnLaApp.js");

    await sql`delete from advisors`;
    await sql`
      insert into advisors (nombre, telefono, rol, active, prioridad, ventana_hasta)
      values ('Manuel Montufar', '593990008763', 'admin', true, 1, now() + interval '10 hours')
    `;
    await app.guardarSuscripcion({
      userId: "manuel", userName: "Manuel Montufar", advisorPhone: "593990008763",
      suscripcion: { endpoint: "https://push.example.test/manuel-iphone", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } },
    });
    app._usarTransportePush(async (sub, cuerpo) => {
      pushes.push({ endpoint: sub.endpoint, aviso: JSON.parse(cuerpo) });
    });
    // Un turno sano antes de empezar: una base recién creada siembra los prompts
    // por etapa en el primer turno, y seis primeros turnos a la vez chocan en esa
    // siembra. En producción los prompts ya existen; acá se dejan sembrados.
    sinCredito = false;
    expect((await turno("Calentamiento", "593990000299")).respuesta).toContain("¿Cuántas llantas necesita?");
  }, 60_000);

  beforeEach(async () => {
    // Los avisos salen sin frenar el turno: se deja asentar lo del caso anterior.
    await new Promise((r) => setTimeout(r, 300));
    pushes = [];
    await sql`delete from avisos_a_soporte`;
    await sql`delete from incidentes_del_bot`;
    await botPower.setBotPower({ activo: true });
    soporte.olvidarIncidentesAbiertos();
  });

  afterAll(async () => {
    await new Promise<void>((r) => stub.close(() => r()));
    delete process.env.OPENAI_BASE_URL;
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });

  it("seis chats fallan a la vez: al cliente no se le pide repetir y a Manuel le llega exactamente UN aviso", async () => {
    sinCredito = true;
    const turnos = await Promise.all(
      Array.from({ length: 6 }, (_, i) => turno(`Cliente ${i + 1}`, `59399000030${i}`)),
    );
    for (const t of turnos) {
      expect(t.respuesta).toMatch(/problema técnico/);
      expect(t.respuesta).not.toMatch(/repit/i);
    }

    const filas = await esperarAvisos(1);
    // Un momento más por si algún otro aviso viniera detrás: no tiene que venir ninguno.
    await new Promise((r) => setTimeout(r, 400));
    expect(await avisos()).toHaveLength(1);
    expect(filas[0].clase).toBe("caida");
    expect(filas[0].titulo).toMatch(/el bot no está respondiendo$/);
    expect(filas[0].cuerpo).toMatch(/^Se acabó el crédito de OpenAI\. Chat afectado: Cliente \d \(59399000030\d\)\./);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].endpoint).toBe("https://push.example.test/manuel-iphone");

    const [incidente] = await sql<{ causa: string; fallos: number; conversaciones: string[] }[]>`
      select causa, fallos, conversaciones from incidentes_del_bot where estado = 'abierto'
    `;
    expect(incidente.causa).toBe("sin_credito");
    expect(incidente.fallos).toBe(6);
    expect(incidente.conversaciones).toHaveLength(6);
  }, 60_000);

  it("con el bot apagado a propósito, el mismo fallo no le avisa a nadie", async () => {
    sinCredito = true;
    await botPower.setBotPower({ activo: false, motivo: "cargando el catálogo" });
    const t = await turno("Prueba del dueño", "593990000400");
    expect(t.respuesta).toMatch(/problema técnico/);
    await new Promise((r) => setTimeout(r, 500));
    expect(await avisos()).toHaveLength(0);
    expect(pushes).toHaveLength(0);
    expect(await sql`select 1 from incidentes_del_bot`).toHaveLength(0);
  }, 60_000);

  it("cuando OpenAI vuelve a contestar, llega UN «volvió a responder»", async () => {
    sinCredito = true;
    await turno("Cliente caído", "593990000500");
    expect(await esperarAvisos(1)).toHaveLength(1);

    // Se recarga. El incidente lleva un rato sin fallos nuevos.
    sinCredito = false;
    await sql`update incidentes_del_bot set abierto_at = now() - interval '83 minutes', ultimo_fallo_at = now() - interval '10 minutes'`;
    soporte.olvidarIncidentesAbiertos();
    const [a, b] = await Promise.all([
      turno("Cliente atendido", "593990000501"),
      turno("Otro atendido", "593990000502"),
    ]);
    expect(a.respuesta).toContain("¿Cuántas llantas necesita?");
    expect(b.respuesta).toContain("¿Cuántas llantas necesita?");

    const filas = await esperarAvisos(2);
    await new Promise((r) => setTimeout(r, 400));
    expect((await avisos()).map((f) => f.clase)).toEqual(["caida", "vuelta"]);
    expect(filas[1].titulo).toMatch(/el bot volvió a responder$/);
    expect(filas[1].cuerpo).toContain("Estuvo sin responder 1 h 23 min");
    expect(filas[1].cuerpo).toContain("1 chat quedó sin respuesta");
    expect(await sql`select 1 from incidentes_del_bot where estado = 'abierto'`).toHaveLength(0);
  }, 60_000);
});

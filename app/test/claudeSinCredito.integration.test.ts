import { createServer, type Server } from "node:http";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EL TURNO ENTERO, CON ANTHROPIC SIN SALDO (27-nov-2026).
 *
 * `respaldoDeClaude.casos.test.ts` prueba `completarChat` caso por caso. Esta
 * prueba el CABLE: el agente de verdad (`runAgent`) con el vendedor en Claude,
 * contra un Anthropic de mentira que contesta lo que contesta el real cuando se
 * acaba el crédito —
 *
 *   400 invalid_request_error «Your credit balance is too low to access the Anthropic API…»
 *
 * — y un OpenAI de mentira sano (el respaldo). Comprueba que el cliente recibe
 * la respuesta de gpt-5.5, que `ai_runs` dice quién contestó y por qué, que a
 * soporte le llega UN aviso naranja que nombra a Anthropic (no a OpenAI) aunque
 * fallen varios chats, que mientras dura la pausa Anthropic no se vuelve a
 * tocar, y que cuando Claude vuelve llega el «Claude volvió a contestar».
 */
const BASE = `autoventa_claude_sin_credito_${process.pid}`;
const admin = postgres(`postgresql://${process.env.USER}@localhost/postgres`, { prepare: false, max: 1 });

vi.mock("../src/wa/client.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/wa/client.js")>();
  return { ...real, sendAdvisorText: vi.fn(async () => "wamid.TEXTO"), sendAdvisorTemplate: vi.fn(async () => "wamid.PLANTILLA") };
});

let sql: typeof import("../src/db/client.js").sql;
let agent: typeof import("../src/agent/agent.js");
let chat: typeof import("../src/agent/chat.js");
let openaiStub: Server;
let anthropicStub: Server;
let anthropicSinCredito = true;
let llamadasAnthropic = 0;

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

const avisos = () => sql<{ clase: string; titulo: string; cuerpo: string }[]>`
  select clase, titulo, cuerpo from avisos_a_soporte order by id
`;
async function esperarAvisos(cuantos: number, ms = 5000): Promise<Awaited<ReturnType<typeof avisos>>> {
  const hasta = Date.now() + ms;
  for (;;) {
    const filas = await avisos();
    if (filas.length >= cuantos || Date.now() > hasta) return filas;
    await new Promise((r) => setTimeout(r, 50));
  }
}

function servir(manejar: (cuerpo: Record<string, unknown>, res: import("node:http").ServerResponse) => void): Promise<Server> {
  const s = createServer((req, res) => {
    let crudo = "";
    req.on("data", (c) => { crudo += c; });
    req.on("end", () => manejar(JSON.parse(crudo || "{}"), res));
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r(s)));
}
const puerto = (s: Server) => (s.address() as { port: number }).port;

describe.sequential("Anthropic sin saldo, de punta a punta", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.unsafe(`create database ${BASE}`);

    openaiStub = await servir((_cuerpo, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "stub", choices: [{ index: 0, finish_reason: "stop",
          message: { role: "assistant", content: "En 205/55R16 tengo Falken y Kenda 🛞 ¿Cuántas llantas necesita?" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }));
    });
    anthropicStub = await servir((cuerpo, res) => {
      llamadasAnthropic += 1;
      if (anthropicSinCredito) {
        res.writeHead(400, { "Content-Type": "application/json", "x-should-retry": "false" });
        res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error",
          message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." },
        request_id: "req_prueba" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "msg_ok", type: "message", role: "assistant", model: cuerpo.model,
        content: [{ type: "text", text: "Con Claude: en 205/55R16 tengo Falken y Kenda. ¿Cuántas llantas necesita?" }],
        stop_reason: "end_turn", stop_sequence: null, stop_details: null,
        usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }));
    });

    process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${BASE}`;
    process.env.OPENAI_API_KEY = "stub";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${puerto(openaiStub)}/v1`;
    process.env.ANTHROPIC_API_KEY = "sk-ant-prueba";
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${puerto(anthropicStub)}`;
    process.env.OPENAI_MODEL = "claude-sonnet-5-5";
    process.env.OPENAI_ESCALATION_MODEL = "claude-sonnet-5-5";
    delete process.env.AI_CLAUDE_RESPALDO_MODEL;
    delete process.env.OPENAI_CANARY_MODEL_VENDEDOR;
    delete process.env.OPENAI_CANARY_MODEL;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.BOT_POWER_CACHE_MS = "0";

    sql = (await import("../src/db/client.js")).sql;
    await (await import("../src/db/schema.js")).ensureSchema();
    agent = await import("../src/agent/agent.js");
    chat = await import("../src/agent/chat.js");
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
    app._usarTransportePush(async () => undefined);
    // Siembra los prompts por etapa (ver botSinCredito.integration.test.ts).
    anthropicSinCredito = false;
    expect((await turno("Calentamiento", "593990000699")).respuesta).toContain("Con Claude");
  }, 60_000);

  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 300));
    await sql`delete from avisos_a_soporte`;
    await sql`delete from incidentes_del_bot`;
    await sql`delete from ai_runs`;
    chat._olvidarPausasDeClaude();
    llamadasAnthropic = 0;
  });

  afterAll(async () => {
    await new Promise<void>((r) => openaiStub.close(() => r()));
    await new Promise<void>((r) => anthropicStub.close(() => r()));
    for (const v of ["OPENAI_BASE_URL", "ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "OPENAI_MODEL", "OPENAI_ESCALATION_MODEL"]) delete process.env[v];
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });

  it("cuatro chats a la vez: todos reciben la respuesta de gpt-5.5, ai_runs lo dice y soporte recibe UN aviso que nombra a Anthropic", async () => {
    anthropicSinCredito = true;
    const turnos = await Promise.all(
      Array.from({ length: 4 }, (_, i) => turno(`Cliente ${i + 1}`, `59399000070${i}`)),
    );
    for (const t of turnos) {
      expect(t.respuesta).toContain("¿Cuántas llantas necesita?");
      expect(t.respuesta).not.toMatch(/problema técnico|repit/i);
    }

    const runs = await sql<{ model: string; route: string; tools: string[]; error: string | null }[]>`
      select model, route, tools, error from ai_runs where call_type = 'chat' order by id
    `;
    expect(runs).toHaveLength(4);
    for (const r of runs) {
      expect(r.model).toBe("gpt-5.5");
      expect(r.error).toBeNull();
      expect(r.tools.some((t) => t.startsWith("respaldo_claude:sin_credito"))).toBe(true);
    }

    const filas = await esperarAvisos(1);
    await new Promise((r) => setTimeout(r, 400));
    expect(await avisos()).toHaveLength(1);
    expect(filas[0].clase).toBe("claude_respaldo");
    expect(filas[0].titulo).toMatch(/Claude no contesta, responde gpt-5\.5$/);
    expect(filas[0].cuerpo).toMatch(/^Se acabó el crédito de Anthropic \(Claude\)\. El bot sigue respondiendo con gpt-5\.5/);
    expect(filas[0].cuerpo).toContain("console.anthropic.com");
    // El incidente es de otro tipo: no se confunde con «el bot no responde».
    const incidentes = await sql<{ tipo: string; causa: string }[]>`select tipo, causa from incidentes_del_bot where estado = 'abierto'`;
    expect(incidentes).toEqual([{ tipo: "claude_con_respaldo", causa: "sin_credito" }]);
    // Ninguna llamada de más a Anthropic: las que llegaron juntas probaron, las de después no.
    const antes = llamadasAnthropic;
    await turno("Cliente 5", "593990000710");
    expect(llamadasAnthropic).toBe(antes);
  }, 60_000);

  it("cuando Claude vuelve, llega UN «Claude volvió a contestar»", async () => {
    anthropicSinCredito = true;
    await turno("Cliente caído", "593990000720");
    expect(await esperarAvisos(1)).toHaveLength(1);

    // Se recargó. Pasó la pausa y el incidente lleva un rato sin fallos nuevos.
    anthropicSinCredito = false;
    chat._olvidarPausasDeClaude();
    await sql`update incidentes_del_bot set abierto_at = now() - interval '40 minutes', ultimo_fallo_at = now() - interval '10 minutes'`;
    const t = await turno("Cliente atendido", "593990000721");
    expect(t.respuesta).toContain("Con Claude");

    const filas = await esperarAvisos(2);
    await new Promise((r) => setTimeout(r, 400));
    expect((await avisos()).map((f) => f.clase)).toEqual(["claude_respaldo", "vuelta"]);
    expect(filas[1].titulo).toMatch(/Claude volvió a contestar$/);
    expect(filas[1].cuerpo).toContain("Contestó gpt-5.5 durante 40 min");
    expect(await sql`select 1 from incidentes_del_bot where estado = 'abierto'`).toHaveLength(0);
  }, 60_000);
});

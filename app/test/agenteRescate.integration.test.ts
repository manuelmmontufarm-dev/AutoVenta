import { createServer, type Server } from "node:http";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_rescate_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let agent: typeof import("../src/agent/agent.js");
let stub: Server;
let llamadasConTools = 0;
let llamadasSinTools = 0;

/**
 * La causa #1 del «tuve un problema procesando» (7 casos en producción el
 * 5-ago): el modelo se queda en bucle llamando herramientas hasta agotar las
 * 8 rondas. Este stub reproduce exactamente eso — SIEMPRE pide otra herramienta
 * mientras el agente se las ofrezca — y verifica que el rescate final (una
 * llamada sin herramientas) responde al cliente en vez de rendirse.
 */
describe.sequential("Rescate del agente al agotar las rondas", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);

    // Stub de OpenAI: con tools → siempre tool_call; sin tools → texto útil.
    stub = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}");
        const usaTools = Array.isArray(parsed.tools) && parsed.tools.length > 0;
        if (usaTools) llamadasConTools += 1; else llamadasSinTools += 1;
        const message = usaTools
          ? { role: "assistant", content: null, tool_calls: [{ id: `call_${llamadasConTools}`, type: "function", function: { name: "tipos_de_llanta", arguments: "{}" } }] }
          : { role: "assistant", content: "En su medida tengo Falken y Kenda listas 🛞 ¿Cuántas llantas necesita?" };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "stub", choices: [{ index: 0, message, finish_reason: usaTools ? "tool_calls" : "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
      });
    });
    await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
    const puerto = (stub.address() as { port: number }).port;

    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.OPENAI_API_KEY = "stub";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${puerto}/v1`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";

    const db = await import("../src/db/client.js");
    appSql = db.sql;
    const schema = await import("../src/db/schema.js");
    await schema.ensureSchema();
    agent = await import("../src/agent/agent.js");
  });

  afterAll(async () => {
    await new Promise<void>((r) => stub.close(() => r()));
    delete process.env.OPENAI_BASE_URL;
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("con el modelo en bucle de herramientas, el cliente recibe una respuesta útil, no la disculpa", async () => {
    const [c] = await appSql<{ id: number }[]>`
      insert into conversations (phone, name, stage, tire_size)
      values ('593990000201', 'Bucle Infinito', 'nuevo', '205/55R16')
      returning id
    `;
    const reply = await agent.runAgent({
      conversation: { id: c.id, phone: "593990000201", name: "Bucle Infinito", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
      customerPhone: "593990000201",
      currentUserText: "quiero llantas 205/55R16",
    } as never, "quiero llantas 205/55R16");

    // El rescate respondió con lo que había, sin disculpa ni pedir repetir.
    expect(reply).toContain("¿Cuántas llantas necesita?");
    expect(reply).not.toMatch(/tuve un problema procesando/i);

    // Se agotaron las 8 rondas con herramientas y hubo UNA llamada de rescate.
    expect(llamadasConTools).toBe(8);
    expect(llamadasSinTools).toBe(1);

    // Queda registrado como rescatado — la auditoría distingue rescate de rendición.
    const [run] = await appSql<{ error: string | null }[]>`
      select error from ai_runs where conversation_id=${c.id} order by id desc limit 1
    `;
    expect(run.error).toBe("max_iterations_salvaged");
  });
});

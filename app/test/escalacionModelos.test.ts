import { createServer, type Server } from "node:http";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";

const testDatabase = `autoventa_escalacion_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

const MODELO_PRINCIPAL = "gpt-5.5";
const MODELO_SUPERIOR = "gpt-5.5-superior-test";

/**
 * ESCALACIÓN A MODELO SUPERIOR (7-ago).
 *
 * La falla #1 de producción («tuve un problema procesando») nacía de insistir:
 * 8 rondas con el modelo principal y un RESCATE con ese mismo modelo que
 * acababa de atascarse 8 veces. Ahora, a partir de la iteración 4, atiende el
 * modelo de escalación con todo el contexto del turno, y el rescate SIEMPRE es
 * suyo. Lo que se prueba aquí es exactamente eso: QUÉ modelo pidió el agente en
 * cada llamada, y qué modelo quedó registrado en la auditoría.
 *
 * Se mockea igual que test/agenteRescate.integration.test.ts: un stub HTTP en
 * lugar del endpoint de OpenAI. Con stub se ve el `model` REAL que viaja en
 * cada request — un vi.mock del SDK solo vería el argumento, no lo que se envía.
 */
let stub: Server;
let puerto = 0;

/** Cada llamada al "OpenAI" stub, en orden. `conTools` distingue el rescate. */
let llamadas: { model: string; conTools: boolean; reasoningEffort?: string }[] = [];
/** "bucle" = pide herramientas para siempre (agota las rondas); "cierra" = responde ya. */
let modoStub: "bucle" | "cierra" = "bucle";

/** Conexiones abiertas por cada grafo de módulos (uno por variante de env). */
const conexiones: (typeof import("../src/db/client.js").sql)[] = [];

/**
 * config se lee UNA vez al importarse, así que para cambiar el env hay que
 * recargar el grafo entero (vi.resetModules + import dinámico) — el patrón que
 * ya usa el repo para levantar el agente con env de prueba.
 */
async function cargarApp(escalationModel: string | null) {
  vi.resetModules();
  process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
  process.env.OPENAI_API_KEY = "stub";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${puerto}/v1`;
  process.env.OPENAI_MODEL = MODELO_PRINCIPAL;
  if (escalationModel) process.env.OPENAI_ESCALATION_MODEL = escalationModel;
  else delete process.env.OPENAI_ESCALATION_MODEL;
  process.env.WHATSAPP_TOKEN = "test";
  process.env.WHATSAPP_APP_SECRET = "test";
  process.env.WHATSAPP_VERIFY_TOKEN = "test";
  process.env.WHATSAPP_PHONE_ID = "test";

  const db = await import("../src/db/client.js");
  conexiones.push(db.sql);
  const schema = await import("../src/db/schema.js");
  await schema.ensureSchema();
  const agent = await import("../src/agent/agent.js");
  return { sql: db.sql, agent };
}

async function conversacionNueva(
  sql: typeof import("../src/db/client.js").sql,
  phone: string,
  name: string,
): Promise<number> {
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, stage, tire_size)
    values (${phone}, ${name}, 'nuevo', '205/55R16')
    returning id
  `;
  return c.id;
}

function contexto(id: number, phone: string, name: string) {
  return {
    conversation: { id, phone, name, stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: phone,
    currentUserText: "quiero llantas 205/55R16",
  } as never;
}

describe.sequential("Escalación a modelo superior", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);

    stub = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}") as { model?: string; tools?: unknown[]; reasoning_effort?: string };
        const conTools = Array.isArray(parsed.tools) && parsed.tools.length > 0;
        llamadas.push({ model: parsed.model ?? "", conTools, reasoningEffort: parsed.reasoning_effort });
        const pideTool = conTools && modoStub === "bucle";
        const message = pideTool
          ? { role: "assistant", content: null, tool_calls: [{ id: `call_${llamadas.length}`, type: "function", function: { name: "tipos_de_llanta", arguments: "{}" } }] }
          : { role: "assistant", content: "En su medida tengo Falken y Kenda listas 🛞 ¿Cuántas llantas necesita?" };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "stub",
          choices: [{ index: 0, message, finish_reason: pideTool ? "tool_calls" : "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }));
      });
    });
    await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
    puerto = (stub.address() as { port: number }).port;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => stub.close(() => r()));
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_ESCALATION_MODEL;
    delete process.env.OPENAI_MODEL;
    for (const conexion of conexiones) await conexion.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  }, 60_000);

  describe("con OPENAI_ESCALATION_MODEL distinto al principal", () => {
    let sql: typeof import("../src/db/client.js").sql;
    let conversationId = 0;

    beforeAll(async () => {
      const app = await cargarApp(MODELO_SUPERIOR);
      sql = app.sql;
      modoStub = "bucle";
      llamadas = [];
      conversationId = await conversacionNueva(sql, "593990000301", "Bucle Escalado");
      await app.agent.runAgent(contexto(conversationId, "593990000301", "Bucle Escalado"), "quiero llantas 205/55R16");
    }, 60_000);

    it("(a) las 4 primeras llamadas van con el principal y de la 5ª en adelante con el de escalación", () => {
      const delLoop = llamadas.filter((l) => l.conTools);
      // El bucle infinito de herramientas agota las 8 rondas, como en producción.
      expect(delLoop).toHaveLength(8);
      expect(delLoop.slice(0, 4).map((l) => l.model)).toEqual(Array(4).fill(MODELO_PRINCIPAL));
      expect(delLoop.slice(4).map((l) => l.model)).toEqual(Array(4).fill(MODELO_SUPERIOR));
    });

    it("(b) el rescate (la llamada sin herramientas) usa el modelo de escalación", () => {
      const rescates = llamadas.filter((l) => !l.conTools);
      expect(rescates).toHaveLength(1);
      expect(rescates[0].model).toBe(MODELO_SUPERIOR);
      expect(rescates[0].reasoningEffort).toBe("medium");
    });

    it("GPT-5.5 con function tools usa reasoning none (contrato real de Chat Completions)", () => {
      expect(llamadas.filter((l) => l.conTools).every((l) => l.reasoningEffort === "none")).toBe(true);
    });

    it("(d) la auditoría registra el modelo que respondió: el escalado, no el de config", async () => {
      // ai_runs es el destino real del campo `model` de logAiRun; leer la fila
      // prueba el valor de punta a punta, no solo el argumento de la función.
      const [run] = await sql<{ model: string; error: string | null }[]>`
        select model, error from ai_runs where conversation_id=${conversationId} order by id desc limit 1
      `;
      expect(run.error).toBe("max_iterations_salvaged");
      expect(run.model).toBe(MODELO_SUPERIOR);
    });

    it("(d) si el principal cierra en la primera ronda, la auditoría lo registra a ÉL", async () => {
      modoStub = "cierra";
      llamadas = [];
      const id = await conversacionNueva(sql, "593990000302", "Cierra Rápido");
      const { runAgent } = await import("../src/agent/agent.js");
      const respuesta = await runAgent(contexto(id, "593990000302", "Cierra Rápido"), "quiero llantas 205/55R16");

      expect(respuesta).toContain("¿Cuántas llantas necesita?");
      expect(llamadas.map((l) => l.model)).toEqual([MODELO_PRINCIPAL]);
      const [run] = await sql<{ model: string; error: string | null }[]>`
        select model, error from ai_runs where conversation_id=${id} order by id desc limit 1
      `;
      expect(run.error).toBeNull();
      expect(run.model).toBe(MODELO_PRINCIPAL);
    }, 30_000);
  });

  describe("sin OPENAI_ESCALATION_MODEL (el default de hoy)", () => {
    let sql: typeof import("../src/db/client.js").sql;
    let conversationId = 0;

    beforeAll(async () => {
      const app = await cargarApp(null);
      sql = app.sql;
      modoStub = "bucle";
      llamadas = [];
      conversationId = await conversacionNueva(sql, "593990000303", "Sin Escalacion");
      await app.agent.runAgent(contexto(conversationId, "593990000303", "Sin Escalacion"), "quiero llantas 205/55R16");
    }, 60_000);

    it("(c) TODAS las llamadas usan el principal: sin variable, nada cambia", () => {
      expect(llamadas).toHaveLength(9); // 8 rondas + rescate
      expect(llamadas.every((l) => l.model === MODELO_PRINCIPAL)).toBe(true);
    });

    it("(c) y la auditoría sigue registrando el modelo principal", async () => {
      const [run] = await sql<{ model: string }[]>`
        select model from ai_runs where conversation_id=${conversationId} order by id desc limit 1
      `;
      expect(run.model).toBe(MODELO_PRINCIPAL);
    });
  });
});

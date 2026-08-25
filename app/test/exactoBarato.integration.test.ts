import { createServer, type Server } from "node:http";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";

const testDatabase = `autoventa_exacto_barato_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

const MODELO_PRINCIPAL = "gpt-5.5";
const MODELO_BARATO = "gpt-5.4-mini-test";

/**
 * CANARY DEL TURNO EXACTO (25-ago).
 *
 * El 45 % de las corridas termina en `exact_tool_reply`: el texto que ve el
 * cliente lo compone la HERRAMIENTA y el modelo solo enruta. Con
 * OPENAI_EXACT_TOOL_MODEL las dos primeras rondas de las etapas no rutinarias
 * van con el modelo barato, con una regla dura: el barato SOLO puede enrutar.
 *
 * Lo que se prueba aquí, con el mismo stub HTTP de escalacionModelos.test.ts
 * (se ve el `model` REAL que viaja en cada request):
 *  (a) el barato cierra un turno exacto él solo, y la auditoría lo registra;
 *  (b) si el barato contesta TEXTO, ese texto NO llega al cliente: la ronda
 *      se repite con el principal y responde él;
 *  (c) si el barato llama `generar_cotizacion`, NO se ejecuta (cero filas en
 *      quotes por su culpa) y la ronda pasa al principal;
 *  (d) sin la variable, nada cambia;
 *  (e) las etapas rutinarias siguen siendo del canary de OPENAI_ROUTINE_MODEL;
 *  (f) con rollout 0, la variable puesta no alcanza a ninguna conversación.
 */
let stub: Server;
let puerto = 0;

let llamadas: { model: string; conTools: boolean }[] = [];
/** Guion del stub: una respuesta por llamada, en orden. Al agotarse, texto. */
let guion: Array<{ tool?: string; args?: string; texto?: string }> = [];

const conexiones: (typeof import("../src/db/client.js").sql)[] = [];

async function cargarApp(opts: { exactModel?: string | null; rollout?: string | null }) {
  vi.resetModules();
  process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
  process.env.OPENAI_API_KEY = "stub";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${puerto}/v1`;
  process.env.OPENAI_MODEL = MODELO_PRINCIPAL;
  delete process.env.OPENAI_ROUTINE_MODEL;
  delete process.env.OPENAI_ESCALATION_MODEL;
  if (opts.exactModel) process.env.OPENAI_EXACT_TOOL_MODEL = opts.exactModel;
  else delete process.env.OPENAI_EXACT_TOOL_MODEL;
  if (opts.rollout != null) process.env.AI_EXACT_TOOL_ROLLOUT = opts.rollout;
  else delete process.env.AI_EXACT_TOOL_ROLLOUT;
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

/** Con id % 100 controlado: el rollout es por conversación y hay que poder fijarlo. */
async function conversacionNueva(
  sql: typeof import("../src/db/client.js").sql,
  phone: string,
  stage = "nuevo",
): Promise<number> {
  const [c] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, stage, tire_size)
    values (${phone}, 'Prueba Exacto', ${stage}, '205/55R16')
    returning id
  `;
  return c.id;
}

function contexto(id: number, phone: string, stage = "nuevo") {
  return {
    conversation: { id, phone, name: "Prueba Exacto", stage, bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: phone,
    customerName: "Prueba Exacto",
    currentUserText: "no sé mi medida, ¿dónde la veo?",
  } as never;
}

describe.sequential("Canary del turno exacto (OPENAI_EXACT_TOOL_MODEL)", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);

    stub = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}") as { model?: string; tools?: unknown[] };
        const conTools = Array.isArray(parsed.tools) && parsed.tools.length > 0;
        llamadas.push({ model: parsed.model ?? "", conTools });
        const paso = guion.shift();
        const message = paso?.tool
          ? { role: "assistant", content: null, tool_calls: [{ id: `call_${llamadas.length}`, type: "function", function: { name: paso.tool, arguments: paso.args ?? "{}" } }] }
          : { role: "assistant", content: paso?.texto ?? "Respuesta final del guion agotado." };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "stub",
          choices: [{ index: 0, message, finish_reason: paso?.tool ? "tool_calls" : "stop" }],
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
    delete process.env.OPENAI_EXACT_TOOL_MODEL;
    delete process.env.AI_EXACT_TOOL_ROLLOUT;
    delete process.env.OPENAI_MODEL;
    for (const conexion of conexiones) await conexion.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  }, 60_000);

  describe("con la variable puesta", () => {
    let sql: typeof import("../src/db/client.js").sql;
    let agent: typeof import("../src/agent/agent.js");

    beforeAll(async () => {
      const app = await cargarApp({ exactModel: MODELO_BARATO });
      sql = app.sql;
      agent = app.agent;
    }, 60_000);

    it("(a) el barato cierra un turno exacto él solo y la auditoría lo registra a ÉL", async () => {
      llamadas = [];
      // guia_medida devuelve mensaje_para_enviar aunque la imagen no salga:
      // es el turno exacto de manual, sin efectos que firmen nada.
      guion = [{ tool: "guia_medida", args: JSON.stringify({ aro: null, lo_pidio_el_cliente: true }) }];
      const id = await conversacionNueva(sql, "593990000401");
      const respuesta = await agent.runAgent(contexto(id, "593990000401"), "no sé mi medida");

      expect(llamadas.map((l) => l.model)).toEqual([MODELO_BARATO]);
      expect(respuesta).toContain("aro");
      const [run] = await sql<{ model: string; route: string }[]>`
        select model, route from ai_runs where conversation_id=${id} order by id desc limit 1
      `;
      expect(run.route).toBe("exact_tool_reply");
      expect(run.model).toBe(MODELO_BARATO);
    }, 30_000);

    it("(b) el texto del barato NUNCA llega al cliente: la misma ronda la repite el principal", async () => {
      llamadas = [];
      guion = [
        { texto: "TEXTO DEL BARATO QUE NO DEBE SALIR" },
        { texto: "Respuesta del principal, esta sí 🛞" },
      ];
      const id = await conversacionNueva(sql, "593990000402");
      const respuesta = await agent.runAgent(contexto(id, "593990000402"), "¿y qué me recomienda?");

      expect(llamadas.map((l) => l.model)).toEqual([MODELO_BARATO, MODELO_PRINCIPAL]);
      expect(respuesta).toContain("esta sí");
      expect(respuesta).not.toContain("NO DEBE SALIR");
      const [run] = await sql<{ model: string; tools: string[] }[]>`
        select model, tools from ai_runs where conversation_id=${id} order by id desc limit 1
      `;
      expect(run.model).toBe(MODELO_PRINCIPAL);
      expect(run.tools).toContain("escalado_a_cerebro:texto");
    }, 30_000);

    it("(c) generar_cotizacion pedida por el barato NO se ejecuta: escala sin firmar nada", async () => {
      llamadas = [];
      guion = [
        { tool: "generar_cotizacion", args: JSON.stringify({ codigo_producto: "X", cantidad: 4 }) },
        { texto: "Le preparo la cotización enseguida." },
      ];
      const id = await conversacionNueva(sql, "593990000403");
      await agent.runAgent(contexto(id, "593990000403"), "cotíceme 4");

      expect(llamadas.map((l) => l.model)).toEqual([MODELO_BARATO, MODELO_PRINCIPAL]);
      const [{ count }] = await sql<{ count: string }[]>`
        select count(*)::text as count from quotes where conversation_id=${id}
      `;
      expect(count).toBe("0");
      const [run] = await sql<{ tools: string[] }[]>`
        select tools from ai_runs where conversation_id=${id} order by id desc limit 1
      `;
      expect(run.tools).toContain("escalado_a_cerebro:generar_cotizacion");
    }, 30_000);

    it("(e) las etapas rutinarias no cambian: siguen con el canary de OPENAI_ROUTINE_MODEL", async () => {
      llamadas = [];
      guion = [{ texto: "Seguimos pendientes de su visita 🏁" }];
      const id = await conversacionNueva(sql, "593990000404", "cotizacion_enviada");
      const respuesta = await agent.runAgent(contexto(id, "593990000404", "cotizacion_enviada"), "gracias");

      // Sin OPENAI_ROUTINE_MODEL, routineModel = principal: una sola llamada, suya,
      // y el texto del barato jamás entra en juego.
      expect(llamadas.map((l) => l.model)).toEqual([MODELO_PRINCIPAL]);
      expect(respuesta).toContain("visita");
    }, 30_000);
  });

  describe("apagado", () => {
    it("(d) sin la variable, nada cambia: todas las llamadas van con el principal", async () => {
      const app = await cargarApp({ exactModel: null });
      llamadas = [];
      guion = [{ texto: "Directo del principal." }];
      const id = await conversacionNueva(app.sql, "593990000405");
      const respuesta = await app.agent.runAgent(contexto(id, "593990000405"), "hola");

      expect(llamadas.map((l) => l.model)).toEqual([MODELO_PRINCIPAL]);
      expect(respuesta).toContain("Directo del principal");
    }, 60_000);

    it("(f) con AI_EXACT_TOOL_ROLLOUT=0 la variable puesta no alcanza a ninguna conversación", async () => {
      const app = await cargarApp({ exactModel: MODELO_BARATO, rollout: "0" });
      llamadas = [];
      guion = [{ texto: "También del principal." }];
      const id = await conversacionNueva(app.sql, "593990000406");
      await app.agent.runAgent(contexto(id, "593990000406"), "hola");

      expect(llamadas.map((l) => l.model)).toEqual([MODELO_PRINCIPAL]);
    }, 60_000);
  });
});

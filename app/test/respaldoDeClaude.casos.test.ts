import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChatCompletion } from "openai/resources/chat/completions";

/**
 * CADA FORMA EN QUE CLAUDE PUEDE FALLAR, Y QUÉ PASA DESPUÉS (27-nov-2026).
 *
 * Depot, Competimotor y el simulador usan la MISMA clave de Anthropic. Si se
 * acaba el saldo, los dos bots viven del respaldo (`AI_CLAUDE_RESPALDO_MODEL`,
 * gpt-5.5). Hasta hoy ese camino solo se había probado con «nadie escucha en el
 * puerto». Acá el SDK de verdad habla con un Anthropic de mentira que contesta
 * lo mismo que el real (formas comprobadas el 27-nov con una llamada real:
 * `404 {"type":"error","error":{"type":"not_found_error",…}}`,
 * `401 … authentication_error «invalid x-api-key»`, `x-should-retry: false`).
 *
 * Para cada caso: ¿contesta gpt-5.5?, ¿cuántas veces se llamó a Anthropic?,
 * ¿se avisa a soporte (una vez, con la causa correcta)?, ¿la llamada siguiente
 * vuelve a esperar a Claude o va directo al respaldo?, ¿qué queda en `ai_runs`?
 */

type Escena =
  | { status: number; cuerpo: unknown; cabeceras?: Record<string, string> }
  | { demoraMs: number };

let servidor: Server;
let escenas: Escena[] = [];
let llamadas: { model: string; fallbacks: unknown; beta: string }[] = [];
let chat: typeof import("../src/agent/chat.js");
let configuracion: typeof import("../src/config.js")["config"];
let fallo: typeof import("../src/domain/falloDelBot.js");
let proveedor: typeof import("../src/domain/falloDelProveedor.js");
let avisos: { tipo: "fallo" | "volvio"; causa?: string }[] = [];

const error = (status: number, tipo: string, mensaje: string, cabeceras: Record<string, string> = {}): Escena => ({
  status,
  cuerpo: { type: "error", error: { type: tipo, message: mensaje }, request_id: "req_prueba" },
  cabeceras: { "x-should-retry": "false", ...cabeceras },
});
const SIN_CREDITO = error(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.");
const CLAVE = error(401, "authentication_error", "invalid x-api-key");
const LIMITE = error(429, "rate_limit_error", "This request would exceed your organization's rate limit of 400,000 output tokens per minute.", { "retry-after": "20", "x-should-retry": "true" });
const SATURADO = error(529, "overloaded_error", "Overloaded", { "x-should-retry": "true" });
const CAIDO = error(500, "api_error", "Internal server error", { "x-should-retry": "true" });
const SIN_MODELO = error(404, "not_found_error", "model: claude-sonet-5-5");

function mensaje(model: string, content: unknown[], extra: Record<string, unknown> = {}): Escena {
  return {
    status: 200,
    cuerpo: {
      id: "msg_prueba", type: "message", role: "assistant", model, content,
      stop_reason: "end_turn", stop_sequence: null, stop_details: null,
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      ...extra,
    },
  };
}
const TEXTO_OK = (model: string) => mensaje(model, [{ type: "text", text: "En 205/55R16 tengo Kenda y Falken. ¿Cuántas necesita?" }]);
const RECHAZO = (model: string) => mensaje(model, [], { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } });

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let crudo = "";
    req.on("data", (c) => { crudo += c; });
    req.on("end", () => {
      const cuerpo = JSON.parse(crudo || "{}") as { model: string; fallbacks?: unknown };
      llamadas.push({ model: cuerpo.model, fallbacks: cuerpo.fallbacks, beta: String(req.headers["anthropic-beta"] ?? "") });
      const escena = escenas.shift() ?? TEXTO_OK(cuerpo.model);
      if ("demoraMs" in escena) {
        const t = setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify((TEXTO_OK(cuerpo.model) as { cuerpo: unknown }).cuerpo)); }, escena.demoraMs);
        res.on("close", () => clearTimeout(t));
        return;
      }
      res.writeHead(escena.status, { "content-type": "application/json", "request-id": "req_prueba", ...(escena.cabeceras ?? {}) });
      res.end(JSON.stringify(escena.cuerpo));
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
  process.env.ANTHROPIC_API_KEY = "sk-ant-prueba";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  delete process.env.AI_CLAUDE_RESPALDO_MODEL;
  chat = await import("../src/agent/chat.js");
  configuracion = (await import("../src/config.js")).config;
  fallo = await import("../src/domain/falloDelBot.js");
  proveedor = await import("../src/domain/falloDelProveedor.js");
  chat._usarAvisosDeClaude({
    fallo: async (input) => { avisos.push({ tipo: "fallo", causa: input.causa }); },
    volvio: async () => { avisos.push({ tipo: "volvio" }); return { quedanAbiertos: false }; },
  });
});
afterAll(async () => {
  chat._usarAvisosDeClaude(null);
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  await new Promise<void>((r) => servidor.close(() => r()));
});
beforeEach(() => {
  escenas = [];
  llamadas = [];
  avisos = [];
  chat._olvidarPausasDeClaude();
  configuracion.anthropic.respaldoOpenAI = "gpt-5.5";
});

/** Un OpenAI de mentira: registra lo que le piden y contesta (o falla, si se le dice). */
function openaiDeMentira(falla?: Error) {
  const pedidos: Record<string, unknown>[] = [];
  const cliente = {
    chat: { completions: { create: async (p: Record<string, unknown>): Promise<ChatCompletion> => {
      pedidos.push(p);
      if (falla) throw falla;
      return {
        id: "x", object: "chat.completion", created: 0, model: String(p.model),
        choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: "Respuesta de gpt-5.5", refusal: null } }],
      };
    } } },
  };
  return { cliente: cliente as never, pedidos };
}

const HERRAMIENTA = { type: "function" as const, function: { name: "buscar_llanta", parameters: { type: "object", properties: {} } } };
const ESQUEMA = { type: "json_schema" as const, json_schema: { name: "revision_guardian", schema: { type: "object" } } };
const vendedor = (openai: never, model = "claude-sonnet-5-5") => chat.completarChat(openai, {
  model, messages: [{ role: "system", content: "Eres el vendedor." }, { role: "user", content: "205/55R16" }],
  tools: [HERRAMIENTA], tool_choice: "auto", parallel_tool_calls: false, max_completion_tokens: 2048,
}, { esfuerzo: "low" });
const guardian = (openai: never, tiempoClaudeMs?: number) => chat.completarChat(openai, {
  model: "claude-haiku-5-5", messages: [{ role: "system", content: "Eres el Guardián." }, { role: "user", content: "BORRADOR" }],
  response_format: ESQUEMA, max_completion_tokens: 2000,
}, { esfuerzo: "low", ...(tiempoClaudeMs ? { tiempoClaudeMs } : {}) });

describe("errores del proveedor: contesta gpt-5.5, una sola llamada a Anthropic, y la siguiente no espera", () => {
  it.each([
    ["saldo agotado (400)", SIN_CREDITO, "sin_credito", true, true],
    ["clave inválida (401)", CLAVE, "clave_invalida", true, true],
    ["modelo mal escrito (404)", SIN_MODELO, "modelo_inexistente", true, false],
    ["límite de uso (429)", LIMITE, "limite_de_uso", false, false],
    ["saturado (529)", SATURADO, "proveedor_caido", false, false],
    ["error del servidor (500)", CAIDO, "proveedor_caido", false, false],
  ] as const)("%s", async (_nombre, escena, causa, avisa, deLaCuenta) => {
    const { cliente, pedidos } = openaiDeMentira();
    escenas = [escena];

    const r = await vendedor(cliente);
    expect(r.choices[0].message.content).toBe("Respuesta de gpt-5.5");
    expect(chat.modeloQueAtendio(r, "claude-sonnet-5-5")).toBe("gpt-5.5");
    expect(chat.marcaDelRespaldo(r)).toBe(`respaldo_claude:${causa}`);
    // Con respaldo no se reintenta (ni el SDK, ni la ronda sin razonamiento).
    expect(llamadas).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ model: "gpt-5.5", tools: [HERRAMIENTA] });
    await new Promise((r) => setTimeout(r, 10));
    expect(avisos).toEqual(avisa ? [{ tipo: "fallo", causa }] : []);

    // La siguiente llamada del MISMO modelo va directo al respaldo: Anthropic no se toca.
    const r2 = await vendedor(cliente);
    expect(llamadas).toHaveLength(1);
    expect(chat.marcaDelRespaldo(r2)).toBe(`respaldo_claude:${causa}:en_pausa`);

    // Otro modelo claude-: si el problema es de la cuenta, también va directo; si no, prueba Claude.
    const g = await guardian(cliente);
    expect(llamadas).toHaveLength(deLaCuenta ? 1 : 2);
    expect(chat.modeloQueAtendio(g, "claude-haiku-5-5")).toBe(deLaCuenta ? "gpt-5.5" : "claude-haiku-5-5");
    // Y avisa una sola vez, aunque hayan sido tres llamadas.
    expect(avisos.filter((a) => a.tipo === "fallo")).toHaveLength(avisa ? 1 : 0);
  });

  it("timeout: el Guardián no se queda sin revisión — Claude tiene su propio tope y el respaldo alcanza", async () => {
    const { cliente } = openaiDeMentira();
    escenas = [{ demoraMs: 5_000 }];
    const inicio = Date.now();
    const g = await guardian(cliente, 300);
    expect(Date.now() - inicio).toBeLessThan(2_000);
    expect(chat.modeloQueAtendio(g, "claude-haiku-5-5")).toBe("gpt-5.5");
    expect(chat.marcaDelRespaldo(g)).toBe("respaldo_claude:proveedor_sin_respuesta");
    expect(llamadas).toHaveLength(1);
    expect(avisos).toEqual([]);
    // Un Haiku lento (pasa de 12 s en <1 % de las revisiones) no saca al Guardián de Claude.
    await guardian(cliente, 300);
    expect(llamadas).toHaveLength(2);
  });

  it("el Guardián de verdad pide a Claude un tope menor que su propio plazo de 20 s", async () => {
    const guardianMod = await import("../src/services/guardian.js");
    expect(guardianMod.GUARDIAN_TIEMPO_CLAUDE_MS).toBeLessThan(guardianMod.GUARDIAN_TIMEOUT_MS - 5_000);
  });

  it("la pausa se acaba: pasado el rato, se vuelve a probar Claude y si contesta, se cierra el aviso", async () => {
    const { cliente } = openaiDeMentira();
    escenas = [SATURADO];
    await vendedor(cliente);
    chat._olvidarPausasDeClaude(); // = pasó el minuto
    const r = await vendedor(cliente);
    expect(chat.modeloQueAtendio(r, "claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
    expect(chat.marcaDelRespaldo(r)).toBeNull();
    expect(llamadas).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 10));
    expect(avisos).toEqual([{ tipo: "volvio" }]);
  });
});

describe("respuestas que no sirven: contesta gpt-5.5, pero sin pausa ni aviso (la próxima es otra petición)", () => {
  it("rechazo de Sonnet 5.5: el servidor ya intentó su respaldo (fallbacks) y aun así rechazó", async () => {
    const { cliente } = openaiDeMentira();
    escenas = [RECHAZO("claude-sonnet-5-5")];
    const r = await vendedor(cliente);
    expect(llamadas[0]).toMatchObject({ fallbacks: "default" });
    expect(llamadas[0].beta).toContain("server-side-fallback-2026-07-01");
    expect(chat.marcaDelRespaldo(r)).toBe("respaldo_claude:rechazo");
    await vendedor(cliente);
    expect(llamadas).toHaveLength(2);
    // (el «volvio» que pueda aparecer es la revisión de arranque, no un aviso)
    expect(avisos.filter((a) => a.tipo === "fallo")).toEqual([]);
  });

  it("rechazo de Haiku 5.5 (sin respaldo del servidor): lo ataja gpt-5.5", async () => {
    const { cliente, pedidos } = openaiDeMentira();
    escenas = [RECHAZO("claude-haiku-5-5")];
    const g = await guardian(cliente);
    expect(llamadas[0].fallbacks).toBeUndefined();
    expect(chat.marcaDelRespaldo(g)).toBe("respaldo_claude:rechazo");
    expect(pedidos[0]).toMatchObject({ model: "gpt-5.5", response_format: ESQUEMA });
  });

  it("respuesta vacía", async () => {
    const { cliente } = openaiDeMentira();
    escenas = [mensaje("claude-sonnet-5-5", [{ type: "thinking", thinking: "", signature: "f" }])];
    expect(chat.marcaDelRespaldo(await vendedor(cliente))).toBe("respaldo_claude:respuesta_vacia");
  });

  it("cortada por max_tokens: ni la frase a medias al cliente ni el JSON roto del Guardián", async () => {
    const { cliente } = openaiDeMentira();
    escenas = [
      mensaje("claude-sonnet-5-5", [{ type: "text", text: "En 205/55R16 tengo la Kenda a $78.50 y la Fal" }], { stop_reason: "max_tokens" }),
      mensaje("claude-haiku-5-5", [{ type: "text", text: '{"veredicto":"corregir","texto_corregido":"En 20' }], { stop_reason: "max_tokens" }),
    ];
    expect(chat.marcaDelRespaldo(await vendedor(cliente))).toBe("respaldo_claude:cortada");
    expect(chat.marcaDelRespaldo(await guardian(cliente))).toBe("respaldo_claude:cortada");
  });

  it("el respaldo DEL SERVIDOR contestó con otro modelo: se registra (y cobra) ese", async () => {
    const { cliente } = openaiDeMentira();
    escenas = [TEXTO_OK("claude-sonnet-5")];
    const r = await vendedor(cliente);
    expect(chat.modeloQueAtendio(r, "claude-sonnet-5-5")).toBe("claude-sonnet-5");
    expect(chat.marcaDelRespaldo(r)).toBeNull();
  });
});

describe("cuando no hay a quién pasarle la llamada", () => {
  it("respaldo apagado: el error sube marcado de Anthropic, con la causa y el texto correctos para soporte", async () => {
    configuracion.anthropic.respaldoOpenAI = null;
    const { cliente } = openaiDeMentira();
    escenas = [SIN_CREDITO];
    const e = await vendedor(cliente).catch((x: unknown) => x);
    expect(fallo.causaDelFallo(e)).toBe("sin_credito");
    expect(fallo.proveedorDelError(e)).toBe("anthropic");
    // Al cliente no se le pide que repita: no se arregla repitiendo.
    expect(proveedor.esFalloDelProveedor(e)).toBe(true);
    const texto = fallo.textoDeCaida({ cliente: "Depot Tire", causa: "sin_credito", chat: null, proveedor: "anthropic" });
    expect(texto.cuerpo).toMatch(/^Se acabó el crédito de Anthropic \(Claude\)\./);
    expect(texto.cuerpo).toContain("console.anthropic.com");
    // Sin respaldo, nada de pausas: cada llamada vuelve a intentar Claude.
    await vendedor(cliente).catch(() => undefined);
    expect(llamadas).toHaveLength(2);
  });

  it("Claude Y OpenAI sin crédito: sube el error de OpenAI (es lo que hay que recargar para que el bot conteste)", async () => {
    const sinCreditoOpenAI = Object.assign(new Error("429 You have no credits remaining. Add credits to continue using the API."), { status: 429 });
    const { cliente } = openaiDeMentira(sinCreditoOpenAI);
    escenas = [SIN_CREDITO];
    const e = await vendedor(cliente).catch((x: unknown) => x);
    expect(e).toBe(sinCreditoOpenAI);
    expect(fallo.causaDelFallo(e)).toBe("sin_credito");
    expect(fallo.proveedorDelError(e)).toBe("openai");
    // Y además se avisó lo de Claude: son dos cuentas que recargar.
    await new Promise((r) => setTimeout(r, 10));
    expect(avisos).toEqual([{ tipo: "fallo", causa: "sin_credito" }]);
  });
});

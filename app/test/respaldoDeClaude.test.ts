import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatCompletion } from "openai/resources/chat/completions";

/**
 * SI CLAUDE FALLA, CONTESTA OPENAI (24-nov-2026).
 *
 * Cuenta nueva de Anthropic = límites bajos y créditos prepagados. Un 429, un
 * «credit balance is too low» o una clave vencida no pueden dejar al cliente
 * sin respuesta: la misma petición sale por el modelo de respaldo, y lo que se
 * registra es el modelo que contestó de verdad.
 */
let chat: typeof import("../src/agent/chat.js");
const servidorMuerto = "http://127.0.0.1:9"; // nadie escucha: falla de conexión inmediata

beforeAll(async () => {
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
  process.env.ANTHROPIC_API_KEY = "sk-ant-doble";
  process.env.ANTHROPIC_BASE_URL = servidorMuerto;
  delete process.env.AI_CLAUDE_RESPALDO_MODEL;
  chat = await import("../src/agent/chat.js");
});
afterAll(() => {
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
});

const respuestaDeOpenAI = (model: string): ChatCompletion => ({
  id: "x", object: "chat.completion", created: 0, model,
  choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: "Hola", refusal: null } }],
});
function openaiDeMentira() {
  const pedidos: Record<string, unknown>[] = [];
  const cliente = { chat: { completions: { create: async (p: Record<string, unknown>) => { pedidos.push(p); return respuestaDeOpenAI(String(p.model)); } } } };
  return { cliente: cliente as never, pedidos };
}
const HERRAMIENTA = { type: "function" as const, function: { name: "buscar_llanta", parameters: { type: "object", properties: {} } } };

describe("respaldo de Claude en OpenAI", () => {
  it("Anthropic no responde: el vendedor contesta por gpt-5.5, con herramientas y sin razonar", async () => {
    const { cliente, pedidos } = openaiDeMentira();
    const r = await chat.completarChat(cliente, {
      model: "claude-fable-5-2", messages: [{ role: "user", content: "205/55R16" }],
      tools: [HERRAMIENTA], tool_choice: "auto", parallel_tool_calls: false, max_completion_tokens: 2048,
    });
    expect(r.choices[0]?.message.content).toBe("Hola");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ model: "gpt-5.5", reasoning_effort: "none", verbosity: "low", tool_choice: "auto", max_completion_tokens: 2048 });
    expect(chat.modeloQueAtendio(r, "claude-fable-5-2")).toBe("gpt-5.5");
  }, 30_000);

  it("el Guardián: su esquema de salida viaja igual al respaldo", async () => {
    const { cliente, pedidos } = openaiDeMentira();
    const formato = { type: "json_schema" as const, json_schema: { name: "v", schema: { type: "object" } } };
    await chat.completarChat(cliente, { model: "claude-haiku-5-5", messages: [{ role: "user", content: "x" }], response_format: formato, max_completion_tokens: 2000 });
    expect(pedidos[0]).toMatchObject({ model: "gpt-5.5", reasoning_effort: "low", response_format: formato });
  }, 30_000);

  it("una respuesta normal no se marca como respaldo, y un modelo de OpenAI no pasa por Claude", async () => {
    const { cliente, pedidos } = openaiDeMentira();
    const r = await chat.completarChat(cliente, { model: "gpt-5.5", messages: [{ role: "user", content: "x" }] });
    expect(pedidos[0]?.model).toBe("gpt-5.5");
    expect(chat.modeloQueAtendio(r, "gpt-5.5")).toBe("gpt-5.5");
  });
});

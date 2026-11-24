import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { levantarDobleDeAnthropic, type Doble } from "./helpers/dobleDeAnthropic.js";

/**
 * EL CAMINO ENTERO, CON EL SDK DE VERDAD Y UN ANTHROPIC DE MENTIRA (22-nov-2026).
 *
 * `chatClaude.test.ts` mira la traducción en memoria. Acá la petición sale por
 * HTTP con el SDK real contra `helpers/dobleDeAnthropic.ts`, que devuelve 400
 * ante lo mismo que rechaza la API real. Si una ronda del vendedor, el rescate
 * o el Guardián arman algo inválido, se ve acá y no con el primer cliente.
 */
let doble: Doble;
let chat: typeof import("../src/agent/chat.js");

beforeAll(async () => {
  doble = await levantarDobleDeAnthropic();
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
  process.env.ANTHROPIC_API_KEY = "sk-ant-doble";
  process.env.ANTHROPIC_BASE_URL = doble.url;
  chat = await import("../src/agent/chat.js");
});
afterAll(async () => {
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  await doble.cerrar();
});

const HERRAMIENTAS = [
  { type: "function" as const, function: { name: "buscar_llanta", description: "Busca", parameters: { type: "object", properties: { medida: { type: "string" } } } } },
  { type: "function" as const, function: { name: "generar_cotizacion", description: "Cotiza", parameters: { type: "object", properties: { code: { type: "string" } } } } },
];
const sinOpenAI = null as never;
const pedir = (model: string, messages: ChatCompletionMessageParam[], extra: Record<string, unknown> = {}) =>
  chat.completarChat(sinOpenAI, { model, messages, tools: HERRAMIENTAS, tool_choice: "auto", parallel_tool_calls: false, max_completion_tokens: 2048, ...extra });
const turno = (): ChatCompletionMessageParam[] => [
  { role: "system", content: "Eres el vendedor." },
  { role: "assistant", content: "¿Qué medida necesita?" },
  { role: "user", content: "hola" },
  { role: "system", content: "HECHO: viene de un anuncio." },
  { role: "user", content: "205/55R16" },
];

describe.each(["claude-fable-5-2", "claude-haiku-5-5", "claude-sonnet-5"])("un turno entero del vendedor con %s", (model) => {
  it("busca, lee el resultado, contesta, y el rescate y la vuelta forzada son peticiones válidas", async () => {
    const antes = doble.peticiones.length;
    const mensajes = turno();

    const r1 = await pedir(model, mensajes);
    expect(r1.choices[0].finish_reason).toBe("tool_calls");
    const llamada = r1.choices[0].message.tool_calls![0];
    mensajes.push(r1.choices[0].message, { role: "tool", tool_call_id: llamada.id, content: '{"opciones":2}' }, { role: "system", content: "RECORDATORIO: ofrece cotizar." });

    // Ronda 2: reenvía el razonamiento de la ronda 1. El doble solo lo acepta
    // si el prefijo (system, herramientas, mensajes) no cambió ni un byte.
    const r2 = await pedir(model, mensajes);
    expect(r2.choices[0].message.content).toContain("¿Le cotizo el juego de 4 llantas?");
    expect(r2.usage!.prompt_tokens_details!.cached_tokens).toBeGreaterThan(0);

    // Rescate: misma lista de herramientas, prohibido llamarlas.
    const rescate = await pedir(model, [...mensajes, { role: "system", content: "Se acabaron los intentos con herramientas." }], { tool_choice: "none" });
    expect(rescate.choices[0].message.tool_calls).toBeUndefined();

    // Vuelta forzada: un system justo después de un texto del asistente.
    mensajes.push(r2.choices[0].message, { role: "system", content: "TE FALTÓ LA OBLIGACIÓN DEL TURNO: cotiza." });
    const r3 = await pedir(model, mensajes);
    expect(r3.choices[0].message.tool_calls![0]).toMatchObject({ type: "function", function: { name: "generar_cotizacion" } });

    const hechas = doble.peticiones.slice(antes);
    expect(hechas.map((p) => p.rechazo)).toEqual([null, null, null, null]);
    // El respaldo del servidor solo va en los modelos que lo tienen (Fable sí; Haiku y Sonnet 5 no).
    expect(hechas.every((p) => String(p.cabeceras["anthropic-beta"]).includes("server-side-fallback-2026-07-01"))).toBe(model === "claude-fable-5-2");
  });
});

describe("cruces de proveedor y de modelo dentro de un turno", () => {
  it("rondas de gpt-5.5 y rescate en Claude", async () => {
    const r = await pedir("claude-fable-5-2", [
      ...turno(),
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "buscar_llanta", arguments: '{"medida":"205/55R16"}' } }] },
      { role: "tool", tool_call_id: "call_1", content: '{"opciones":0}' },
      { role: "system", content: "Se acabaron los intentos con herramientas." },
    ], { tool_choice: "none" });
    expect(r.choices[0].message.content).toBeTruthy();
    expect(doble.peticiones.at(-1)!.rechazo).toBeNull();
  });

  it("la ronda 1 en Haiku y la 2 en Fable: el razonamiento de Haiku no viaja y la petición sigue siendo válida", async () => {
    const mensajes = turno();
    const r1 = await pedir("claude-haiku-5-5", mensajes);
    mensajes.push(r1.choices[0].message, { role: "tool", tool_call_id: r1.choices[0].message.tool_calls![0].id, content: "{}" });
    const r2 = await pedir("claude-fable-5-2", mensajes);
    expect(r2.choices[0].message.content).toBeTruthy();
    expect(doble.peticiones.at(-1)!.rechazo).toBeNull();
    expect(JSON.stringify(doble.peticiones.at(-1)!.cuerpo.messages)).not.toContain('"thinking"');
  });

  it("si el prefijo cambió entre rondas (400 por el razonamiento), se repite sin esos bloques y el turno sale", async () => {
    const mensajes = turno();
    const r1 = await pedir("claude-fable-5-2", mensajes);
    // Alguien edita el system entre la ronda 1 y la 2: el bloque de la ronda 1 ya no vale.
    const editados: ChatCompletionMessageParam[] = [{ role: "system", content: "Eres OTRO vendedor." }, ...mensajes.slice(1), r1.choices[0].message, { role: "tool", tool_call_id: r1.choices[0].message.tool_calls![0].id, content: "{}" }];
    const antes = doble.peticiones.length;
    const r2 = await pedir("claude-fable-5-2", editados);
    expect(r2.choices[0].message.content).toBeTruthy();
    expect(doble.peticiones.slice(antes).map((p) => p.rechazo)).toEqual(["The block is bound to a different conversation.", null]);
  });
});

describe("las otras piezas", () => {
  it("el Guardián con esquema: aprueba lo correcto y corrige el precio inventado", async () => {
    const schema = { type: "object", additionalProperties: false, required: ["veredicto", "texto_corregido", "hallazgos"], properties: { veredicto: { type: "string" }, texto_corregido: { type: "string" }, hallazgos: { type: "array", items: { type: "object" } } } };
    const guardian = (borrador: string) => chat.completarChat(sinOpenAI, {
      model: "claude-haiku-5-5",
      messages: [{ role: "system", content: "Eres el Ángel Guardián." }, { role: "user", content: `BORRADOR: ${borrador}` }],
      response_format: { type: "json_schema", json_schema: { name: "revision_guardian", strict: true, schema } },
      max_completion_tokens: 2000, stream: false,
    });
    expect(JSON.parse((await guardian("KENDA a $78.50")).choices[0].message.content!).veredicto).toBe("aprobar");
    expect(JSON.parse((await guardian("KENDA a $59.90")).choices[0].message.content!).veredicto).toBe("corregir");
    expect(doble.peticiones.at(-1)!.rechazo).toBeNull();
    expect(doble.peticiones.at(-1)!.cuerpo.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
  });

  it("el clasificador (json_object, tope 128) y la redacción con temperatura no rompen", async () => {
    const r = await chat.completarChat(sinOpenAI, { model: "claude-haiku-5-5", max_completion_tokens: 128, temperature: 0.65, response_format: { type: "json_object" }, messages: [{ role: "user", content: "Clasifica. Devuelve SOLO JSON." }] });
    expect(JSON.parse(r.choices[0].message.content!)).toEqual({ stage: "medida_confirmada" });
    expect(doble.peticiones.at(-1)!.rechazo).toBeNull();
  });
});

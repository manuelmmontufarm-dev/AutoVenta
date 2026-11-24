import { beforeAll, describe, expect, it } from "vitest";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * CLAUDE DETRÁS DE LA PUERTA DE CHAT COMPLETIONS (22-nov-2026), ver
 * src/agent/chatClaude.ts. Sin red y sin clave: se prueba la traducción de ida
 * (la petición que saldría hacia Anthropic) y la de vuelta (lo que el bot lee).
 *
 * Cada caso es una forma REAL en que el bot arma `messages`: el turno del
 * vendedor con los hechos detrás del historial, la segunda ronda con el
 * resultado de la herramienta, la vuelta forzada, el rescate, el Guardián con
 * esquema, el clasificador con tope de 128 y la foto de la llanta.
 */
type Modulo = typeof import("../src/agent/chatClaude.js");
let m: Modulo;
let chat: typeof import("../src/agent/chat.js");
let Anthropic: typeof import("@anthropic-ai/sdk").default;

beforeAll(async () => {
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
  m = await import("../src/agent/chatClaude.js");
  chat = await import("../src/agent/chat.js");
  Anthropic = (await import("@anthropic-ai/sdk")).default;
});

const FABLE = "claude-fable-5-2";
const HERRAMIENTA = {
  type: "function" as const,
  function: {
    name: "buscar_llanta",
    description: "Busca llantas por medida",
    parameters: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { medida: { type: "string" } }, required: ["medida"] },
  },
};

/** El turno del vendedor tal como lo arma agent.ts. */
const turno = (extra: ChatCompletionMessageParam[] = []): ChatCompletionMessageParam[] => [
  { role: "system", content: "Eres el vendedor de Depot Tire." },
  { role: "assistant", content: "¿Qué medida necesita?" },
  { role: "user", content: "hola" },
  { role: "system", content: "HECHO: el cliente viene de un anuncio." },
  { role: "system", content: "BENEFICIOS: alineación incluida." },
  { role: "user", content: "205/55R16" },
  ...extra,
];

function respuestaDeClaude(content: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: "msg_1", type: "message", role: "assistant", model: FABLE, content,
    stop_reason: "end_turn", stop_sequence: null, stop_details: null,
    usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 200, output_tokens_details: { thinking_tokens: 25 } },
    ...extra,
  } as never;
}

describe("la petición que sale hacia Claude", () => {
  it("el primer system va arriba; los hechos del turno salen como system DESPUÉS del mensaje del cliente", () => {
    const { cuerpo } = m.aPeticionClaude({ model: FABLE, messages: turno(), tools: [HERRAMIENTA], tool_choice: "auto", parallel_tool_calls: false, max_completion_tokens: 2048 }, { esfuerzo: "low" });
    const system = cuerpo.system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(1);
    expect(system[0].text).toContain("Eres el vendedor de Depot Tire.");
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(cuerpo.messages.map((x) => x.role)).toEqual(["user", "assistant", "user", "system"]);
    // El historial empezaba en el bot: Messages exige que abra el usuario.
    expect(JSON.stringify(cuerpo.messages[0].content)).toContain("mensajes anteriores no incluidos");
    // «hola» y la medida son del mismo lado: un solo turno de usuario, en orden.
    expect((cuerpo.messages[2].content as { text: string }[]).map((b) => b.text)).toEqual(["hola", "205/55R16"]);
    expect(cuerpo.messages[3].content).toBe("HECHO: el cliente viene de un anuncio.\n\nBENEFICIOS: alineación incluida.");
  });

  it("las herramientas pasan sin `$schema`, de a una por ronda, y la cola se cachea", () => {
    const { cuerpo } = m.aPeticionClaude({ model: FABLE, messages: turno(), tools: [HERRAMIENTA], tool_choice: "auto", parallel_tool_calls: false }, { esfuerzo: "low" });
    expect(cuerpo.tools).toEqual([{ name: "buscar_llanta", description: "Busca llantas por medida", input_schema: { type: "object", properties: { medida: { type: "string" } }, required: ["medida"] } }]);
    expect(cuerpo.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect(cuerpo.cache_control).toEqual({ type: "ephemeral" });
    expect(cuerpo.output_config).toEqual({ effort: "low" });
    expect(cuerpo.fallbacks).toBe("default");
  });

  it("el tope de salida tiene piso: el 128 del clasificador no deja a Claude sin texto", () => {
    const { cuerpo } = m.aPeticionClaude({ model: "claude-haiku-5-5", messages: [{ role: "user", content: "Clasifica" }], max_completion_tokens: 128, response_format: { type: "json_object" } }, { esfuerzo: "low" });
    expect(cuerpo.max_tokens).toBe(m.PISO_MAX_TOKENS);
    expect(cuerpo.system).toBeUndefined();
    // Sin herramientas no se marca la cola: nadie la vuelve a leer.
    expect(cuerpo.cache_control).toBeUndefined();
  });

  it("no manda temperatura ni parámetros de GPT, que Claude rechaza con 400", () => {
    const { cuerpo } = m.aPeticionClaude({ model: FABLE, messages: [{ role: "user", content: "x" }], temperature: 0.65, reasoning_effort: "low", verbosity: "low" } as never, { esfuerzo: "medium" });
    expect(Object.keys(cuerpo).sort()).toEqual(["betas", "fallbacks", "max_tokens", "messages", "model", "output_config"]);
  });

  it("el Guardián: su esquema estricto sale como formato de salida", () => {
    const schema = { type: "object", additionalProperties: false, required: ["veredicto"], properties: { veredicto: { type: "string", enum: ["aprobar", "corregir"] } } };
    const { cuerpo } = m.aPeticionClaude({
      model: FABLE,
      messages: [{ role: "system", content: "Eres el revisor." }, { role: "user", content: "BORRADOR: hola" }],
      response_format: { type: "json_schema", json_schema: { name: "revision_guardian", strict: true, schema } },
      max_completion_tokens: 2000,
    }, { esfuerzo: "low" });
    expect(cuerpo.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema } });
    expect(cuerpo.cache_control).toBeUndefined();
  });

  it("la foto de la llanta viaja como imagen en base64", () => {
    const { cuerpo } = m.aPeticionClaude({
      model: FABLE,
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD", detail: "auto" } }, { type: "text", text: "pie de foto" }] }],
    }, { esfuerzo: "low" });
    expect(cuerpo.messages[0].content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
      { type: "text", text: "pie de foto" },
    ]);
  });

  it("un modelo que no acepta system en medio recibe los hechos como recordatorio en el turno del cliente", () => {
    const { cuerpo } = m.aPeticionClaude({ model: "claude-sonnet-5", messages: turno() }, { esfuerzo: "low" });
    expect(cuerpo.messages.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    const ultimo = cuerpo.messages[2].content as { text: string }[];
    expect(ultimo.at(-1)!.text).toBe("<system-reminder>\nHECHO: el cliente viene de un anuncio.\n\nBENEFICIOS: alineación incluida.\n</system-reminder>");
    expect(m.admiteSystemEnMedio("claude-sonnet-5")).toBe(false);
    for (const id of ["claude-fable-5-2", "claude-opus-5-5", "claude-opus-5", "claude-opus-4-8", "claude-sonnet-5-5", "claude-haiku-5-5"]) {
      expect(m.admiteSystemEnMedio(id), id).toBe(true);
    }
  });
});

describe("el loop de herramientas, ronda por ronda", () => {
  const peticion = (messages: ChatCompletionMessageParam[]) => ({ model: FABLE, messages, tools: [HERRAMIENTA], tool_choice: "auto" as const, parallel_tool_calls: false });

  it("la respuesta vuelve con la forma de Chat Completions y los tokens normalizados", () => {
    const r = m.aRespuestaOpenAI(respuestaDeClaude([
      { type: "thinking", thinking: "", signature: "firma-1" },
      { type: "tool_use", id: "toolu_1", name: "buscar_llanta", input: { medida: "205/55R16" } },
    ], { stop_reason: "tool_use" }), peticion(turno()));
    const mensaje = r.choices[0].message;
    expect(r.choices[0].finish_reason).toBe("tool_calls");
    expect(mensaje.content).toBeNull();
    expect(mensaje.tool_calls).toEqual([{ id: "toolu_1", type: "function", function: { name: "buscar_llanta", arguments: '{"medida":"205/55R16"}' } }]);
    // Entrada = sin caché + leído + escrito, como la cuenta OpenAI.
    expect(r.usage!.prompt_tokens).toBe(1200);
    expect(r.usage!.prompt_tokens_details!.cached_tokens).toBe(900);
    expect(r.usage!.completion_tokens).toBe(40);
    expect(r.usage!.completion_tokens_details!.reasoning_tokens).toBe(25);
    expect(chat.tokensEscritosEnCache(r)).toBe(200);
  });

  it("la segunda ronda reenvía el razonamiento TAL CUAL y el prefijo no cambia ni un byte", () => {
    const base = turno();
    const primera = m.aPeticionClaude(peticion(base), { esfuerzo: "low" }).cuerpo;
    const crudo = [
      { type: "thinking", thinking: "", signature: "firma-1" },
      { type: "tool_use", id: "toolu_1", name: "buscar_llanta", input: { medida: "205/55R16" } },
    ];
    const mensaje = m.aRespuestaOpenAI(respuestaDeClaude(crudo, { stop_reason: "tool_use" }), peticion(base)).choices[0].message;
    const segunda = m.aPeticionClaude(peticion([
      ...base,
      mensaje,
      { role: "tool", tool_call_id: "toolu_1", content: '{"opciones":3}' },
      { role: "system", content: "OBLIGACIÓN PENDIENTE: cotiza." },
    ]), { esfuerzo: "low" });
    expect(segunda.usoCrudo).toBe(true);
    const mensajes = segunda.cuerpo.messages;
    expect(JSON.stringify(mensajes.slice(0, primera.messages.length))).toBe(JSON.stringify(primera.messages));
    expect(JSON.stringify(segunda.cuerpo.system)).toBe(JSON.stringify(primera.system));
    expect(JSON.stringify(segunda.cuerpo.tools)).toBe(JSON.stringify(primera.tools));
    expect(mensajes.slice(primera.messages.length)).toEqual([
      { role: "assistant", content: crudo },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: '{"opciones":3}' }] },
      { role: "system", content: "OBLIGACIÓN PENDIENTE: cotiza." },
    ]);
  });

  it("si la ronda anterior fue de OTRO modelo, sus bloques no viajan: se reconstruye sin razonamiento", () => {
    const base = turno();
    const mensaje = m.aRespuestaOpenAI(respuestaDeClaude([
      { type: "thinking", thinking: "", signature: "firma-1" },
      { type: "tool_use", id: "toolu_1", name: "buscar_llanta", input: { medida: "205/55R16" } },
    ], { stop_reason: "tool_use" }), peticion(base)).choices[0].message;
    const otra = m.aPeticionClaude({ ...peticion([...base, mensaje, { role: "tool", tool_call_id: "toolu_1", content: "{}" }]), model: "claude-opus-5-5" }, { esfuerzo: "low" });
    expect(otra.usoCrudo).toBe(false);
    expect(otra.cuerpo.messages.at(-2)).toEqual({ role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "buscar_llanta", input: { medida: "205/55R16" } }] });
  });

  it("una ronda de gpt-5.5 (tool_calls de OpenAI) se le puede pasar a Claude: el rescate cruza de proveedor", () => {
    const { cuerpo } = m.aPeticionClaude({
      ...peticion([
        ...turno(),
        { role: "assistant", content: null, tool_calls: [{ id: "call_9", type: "function", function: { name: "buscar_llanta", arguments: '{"medida":"205/55R16"}' } }] },
        { role: "tool", tool_call_id: "call_9", content: '{"opciones":0}' },
        { role: "system", content: "Se acabaron los intentos con herramientas." },
      ]),
      tool_choice: "none",
    }, { esfuerzo: "low" });
    expect(cuerpo.tool_choice).toEqual({ type: "none" });
    expect(cuerpo.messages.slice(-3)).toEqual([
      { role: "assistant", content: [{ type: "tool_use", id: "call_9", name: "buscar_llanta", input: { medida: "205/55R16" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_9", content: '{"opciones":0}' }] },
      { role: "system", content: "Se acabaron los intentos con herramientas." },
    ]);
  });

  it("la vuelta forzada (system justo después de un texto del asistente) va como recordatorio en un turno de usuario", () => {
    const { cuerpo } = m.aPeticionClaude(peticion([
      ...turno(),
      { role: "assistant", content: "Le recomiendo la Kenda." },
      { role: "system", content: "TE FALTÓ LA OBLIGACIÓN DEL TURNO: llama generar_cotizacion." },
    ]), { esfuerzo: "low" });
    expect(cuerpo.messages.slice(-2)).toEqual([
      { role: "assistant", content: [{ type: "text", text: "Le recomiendo la Kenda." }] },
      { role: "user", content: [{ type: "text", text: "<system-reminder>\nTE FALTÓ LA OBLIGACIÓN DEL TURNO: llama generar_cotizacion.\n</system-reminder>" }] },
    ]);
  });

  it("nunca termina en el asistente", () => {
    const { cuerpo } = m.aPeticionClaude(peticion([...turno(), { role: "assistant", content: "Listo." }]), { esfuerzo: "low" });
    expect(cuerpo.messages.at(-1)!.role).toBe("user");
  });
});

describe("lo que el bot lee de vuelta", () => {
  const peticion = { model: FABLE, messages: [{ role: "user" as const, content: "x" }] };

  it("texto final", () => {
    const r = m.aRespuestaOpenAI(respuestaDeClaude([{ type: "thinking", thinking: "", signature: "f" }, { type: "text", text: " Buenos días. " }]), peticion);
    expect(r.choices[0].message.content).toBe("Buenos días.");
    expect(r.choices[0].finish_reason).toBe("stop");
    expect(r.choices[0].message.tool_calls).toBeUndefined();
  });

  it("con `json_object` devuelve solo el objeto, aunque venga envuelto", () => {
    const r = m.aRespuestaOpenAI(respuestaDeClaude([{ type: "text", text: '```json\n{"stage":"nuevo"}\n```' }]), { ...peticion, response_format: { type: "json_object" } });
    expect(JSON.parse(r.choices[0].message.content!)).toEqual({ stage: "nuevo" });
  });

  it("un rechazo de seguridad es un error, no un texto vacío", () => {
    expect(() => m.aRespuestaOpenAI(respuestaDeClaude([], { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null } }), peticion))
      .toThrow(m.RechazoDeClaude);
  });

  it("sin texto ni herramienta es `empty_response`: el agente entra al rescate en vez de pedir que repita", () => {
    expect(() => m.aRespuestaOpenAI(respuestaDeClaude([{ type: "thinking", thinking: "", signature: "f" }], { stop_reason: "max_tokens" }), peticion))
      .toThrow(/empty_response/);
  });
});

describe("la llamada", () => {
  it("si Claude rechaza la ronda por su razonamiento anterior, se repite UNA vez sin esos bloques", async () => {
    const base: ChatCompletionMessageParam[] = [{ role: "system", content: "S" }, { role: "user", content: "205/55R16" }];
    const peticion = (messages: ChatCompletionMessageParam[]) => ({ model: FABLE, messages, tools: [HERRAMIENTA] });
    const mensaje = m.aRespuestaOpenAI(respuestaDeClaude([
      { type: "thinking", thinking: "", signature: "firma-1" },
      { type: "tool_use", id: "toolu_1", name: "buscar_llanta", input: {} },
    ], { stop_reason: "tool_use" }), peticion(base)).choices[0].message;
    const cuerpos: { messages: { content: unknown }[] }[] = [];
    const r = await m.completarConClaude(
      peticion([...base, mensaje, { role: "tool", tool_call_id: "toolu_1", content: "{}" }]),
      { esfuerzo: "low" },
      {
        crear: async (cuerpo) => {
          cuerpos.push(cuerpo as never);
          if (cuerpos.length === 1) throw new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "The block is bound to a different conversation." } }, "bound", new Headers());
          return respuestaDeClaude([{ type: "text", text: "Tengo 3 opciones." }]);
        },
      },
    );
    expect(cuerpos).toHaveLength(2);
    expect(JSON.stringify(cuerpos[0].messages)).toContain("firma-1");
    expect(JSON.stringify(cuerpos[1].messages)).not.toContain("firma-1");
    expect(r.choices[0].message.content).toBe("Tengo 3 opciones.");
  });

  it("un 429 o un 400 sin razonamiento de por medio sube tal cual, con su `status`", async () => {
    await expect(m.completarConClaude({ model: FABLE, messages: [{ role: "user", content: "x" }] }, { esfuerzo: "low" }, {
      crear: async () => { throw new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "lento" } }, "lento", new Headers()); },
    })).rejects.toMatchObject({ status: 429 });
  });

  it("un modelo gpt- sigue yendo a OpenAI con la petición intacta", async () => {
    const peticion = { model: "gpt-5.5", messages: [{ role: "user" as const, content: "x" }], reasoning_effort: "none" as const };
    let recibida: unknown = null;
    const openai = { chat: { completions: { create: async (p: unknown) => { recibida = p; return { choices: [] }; } } } };
    await chat.completarChat(openai as never, peticion);
    expect(recibida).toBe(peticion);
  });
});

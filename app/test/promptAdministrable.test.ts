import { beforeAll, describe, expect, it } from "vitest";

let buildSystemPrompt: typeof import("../src/agent/prompts.js").buildSystemPrompt;
let AiConfigSchema: typeof import("../src/services/settings.js").AiConfigSchema;

const ocurrencias = (texto: string, fragmento: string) =>
  texto.split(fragmento).length - 1;

describe("el prompt administrable", () => {
  beforeAll(async () => {
    process.env.OPENAI_API_KEY = "test";
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.DATABASE_URL = "postgresql://manue@localhost/autoventa_test";
    ({ buildSystemPrompt } = await import("../src/agent/prompts.js"));
    ({ AiConfigSchema } = await import("../src/services/settings.js"));
  });

  const promptNeutral = () => buildSystemPrompt(AiConfigSchema.parse({ tono: "neutral" }));

  it("tiene una sola política comercial, sin manual histórico pegado detrás", () => {
    const prompt = promptNeutral();

    expect(prompt.length).toBeLessThan(12_000);
    expect(prompt).not.toContain("## Flujo de venta");
    expect(prompt).not.toContain("## El mensaje de entrada");
    expect(prompt).not.toMatch(/\bconv(?:ersaci[oó]n|s)?\.?\s*\d+/i);
    expect(prompt).not.toMatch(/\b\d{1,2}-(?:ago|jul|sep)-20\d\d\b/i);
  });

  it("el tono viene solo de Ajustes y no de una personalidad fija", () => {
    const prompt = promptNeutral();

    expect(ocurrencias(prompt, "Trato profesional y neutro")).toBe(1);
    expect(prompt).not.toMatch(/vendedor quiteño|corto, cálido y directo/i);
  });

  it("manda mensajes breves y deja la pregunta final en una burbuja aparte", () => {
    const prompt = promptNeutral();

    expect(prompt).toContain("Hasta 4 mensajes breves por turno");
    expect(prompt).toContain("La pregunta final va sola en el último mensaje");
    expect(prompt).not.toContain("entrega todo en un solo mensaje");
  });

  it("después de cotizar pide primero el local y recién después el día", () => {
    const prompt = promptNeutral();

    expect(prompt).toContain("Después de cotizar: primero consigue el local; después pregunta el día");
    expect(prompt).not.toMatch(/FECHA \+ LOCAL|van juntos, en la misma pregunta/i);
  });

  it("no ofrece stock incompleto, pero sí cotiza menos de cuatro si el cliente lo pide", () => {
    const prompt = promptNeutral();

    expect(prompt).toContain("No ofrezcas por iniciativa propia un producto con menos de 4 unidades disponibles");
    expect(prompt).toContain("Si el cliente pide explícitamente 1, 2 o 3 llantas, sí puedes cotizar esa cantidad");
    expect(prompt).not.toContain("Nunca ofrezcas 1–3 llantas");
  });

  it("cotiza con aro confirmado sin exigir el vehículo", () => {
    const prompt = promptNeutral();

    expect(prompt).toContain("Con medida o al menos aro confirmado, cotiza sin exigir vehículo");
  });

  it("conserva una sola vez la regla comercial de que si no es no, es sí", () => {
    const prompt = promptNeutral();

    expect(ocurrencias(prompt, "Si no es un NO, es un SÍ")).toBe(1);
  });

  it("cierra con una pregunta útil incluso cuando el plan ya quedó completo", () => {
    const prompt = promptNeutral();

    expect(prompt).toContain("Cierra cada respuesta con una pregunta útil");
    expect(prompt).toContain("¿Le queda alguna otra duda?");
    expect(prompt).toContain("si pidió que no le escriban más");
  });

  it("mantiene Maps como única forma de mandar una ubicación", () => {
    const prompt = promptNeutral();

    expect(ocurrencias(prompt, "ubicacion_locales")).toBe(1);
    expect(prompt).toContain("links de Google Maps");
    expect(prompt).toContain("Nunca escribas la dirección");
  });

  it("no decide en el prompt si se muestra el número de venta", () => {
    const prompt = promptNeutral();

    expect(prompt).not.toMatch(/número de venta|número de cotización|COT-|AV-/i);
  });

  it("la etapa aporta el objetivo y solo añade texto si el administrador lo escribió", () => {
    const prompt = buildSystemPrompt(AiConfigSchema.parse({ tono: "neutral" }), {
      key: "cotizacion_enviada",
      name: "Cotización enviada",
      objective: "Conseguir primero el local y después el día.",
      prompt: "",
      version: 99,
    });

    expect(prompt).toContain("# Fase operativa de este turno: Cotización enviada");
    expect(prompt).toContain("La fase puede avanzar o volver");
    expect(prompt).toContain("Conseguir primero el local y después el día.");
    expect(prompt).not.toContain("Indicación adicional publicada");

    const personalizado = buildSystemPrompt(AiConfigSchema.parse({ tono: "neutral" }), {
      key: "cotizacion_enviada",
      name: "Cotización enviada",
      objective: "Conseguir primero el local y después el día.",
      prompt: "Prioriza clientes de flota cuando ellos mismos lo indiquen.",
      version: 100,
    });
    expect(personalizado).toContain("Prioriza clientes de flota cuando ellos mismos lo indiquen.");

    const noLineal = buildSystemPrompt(AiConfigSchema.parse({ tono: "neutral" }), {
      key: "medida_confirmada",
      name: "Medida confirmada",
      objective: "Presentar opciones reales.",
      prompt: "",
      version: 101,
      storedStage: "seguimiento_venta",
    });
    expect(noLineal).toContain("La tarjeta del Kanban sigue en seguimiento_venta");
    expect(noLineal).toContain("no borres los datos ni la cotización ya conseguida");
  });

  it("manda solo las reglas de la fase operativa elegida", () => {
    const config = AiConfigSchema.parse({ tono: "neutral" });
    const visita = buildSystemPrompt(config, {
      key: "seguimiento_venta",
      name: "seguimiento_venta",
      objective: "Coordinar la visita.",
      prompt: "",
      version: 1,
    });
    const opciones = buildSystemPrompt(config, {
      key: "medida_confirmada",
      name: "medida_confirmada",
      objective: "Mostrar opciones.",
      prompt: "",
      version: 1,
    });

    expect(visita).toContain("ubicacion_locales");
    expect(visita).toContain("primero local y después día");
    expect(visita).not.toContain("fitment_vehiculo");
    expect(visita).not.toContain("menú de PREFERENCIA");
    expect(opciones).toContain("preparar_opciones");
    expect(opciones).toContain("menos de 4 unidades");
    expect(opciones).not.toContain("agendar_visita");
    expect(opciones).not.toContain("Google Maps");
    expect(visita.length).toBeLessThan(4_500);
    expect(opciones.length).toBeLessThan(4_500);
  });
});

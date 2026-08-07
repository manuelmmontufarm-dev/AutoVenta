import { describe, expect, it } from "vitest";

// El módulo importa config (exige env): valores de prueba ANTES del import.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
// Debounce mínimo y tope bajo para ver el efecto del semáforo en la prueba.
process.env.DEBOUNCE_MS = "1";
process.env.PIPELINE_MAX_CONCURRENT = "3";

const { InboundPipeline } = await import("../src/pipeline/inbound.js");
const { config } = await import("../src/config.js");

const MAX = config.pipeline.maxConcurrent;

describe("Pipeline — tope global de handlers en vuelo", () => {
  it(`nunca corren más de ${MAX} handlers a la vez y ninguno se pierde`, async () => {
    let enVuelo = 0;
    let pico = 0;
    const terminados: string[] = [];
    const sueltas: (() => void)[] = [];

    // Handler artificialmente lento: se queda colgado hasta que la prueba lo
    // suelta, así se puede medir cuántos hay dentro en el mismo instante.
    const pipeline = new InboundPipeline(async ({ from }) => {
      enVuelo += 1;
      pico = Math.max(pico, enVuelo);
      await new Promise<void>((resolve) => sueltas.push(resolve));
      enVuelo -= 1;
      terminados.push(from);
    });

    const usuarios = Array.from({ length: MAX * 4 }, (_, i) => `5939000000${i}`);
    for (const [i, from] of usuarios.entries()) pipeline.push(from, `wamid-${i}`, "hola");

    // Deja pasar el debounce y suelta de a poco: en cada vuelta debe haber como
    // mucho MAX handlers dentro.
    await new Promise((r) => setTimeout(r, 20));
    expect(enVuelo).toBe(MAX);
    while (terminados.length < usuarios.length) {
      const soltar = sueltas.shift();
      expect(soltar).toBeDefined();
      soltar?.();
      await new Promise((r) => setTimeout(r, 5));
      expect(enVuelo).toBeLessThanOrEqual(MAX);
    }

    expect(pico).toBe(MAX);
    expect(terminados.sort()).toEqual([...usuarios].sort());
  });

  it("un handler que revienta libera su cupo (la cola no se traba)", async () => {
    let corridos = 0;
    const pipeline = new InboundPipeline(async () => {
      corridos += 1;
      throw new Error("el agente falló");
    });
    for (let i = 0; i < MAX * 2; i += 1) pipeline.push(`59391111${i}`, `wamid-err-${i}`, "hola");
    await new Promise((r) => setTimeout(r, 50));
    expect(corridos).toBe(MAX * 2);
  });
});

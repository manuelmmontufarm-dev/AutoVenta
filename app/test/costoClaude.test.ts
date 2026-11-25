import { beforeAll, describe, expect, it } from "vitest";

/**
 * EL COSTO DE UNA CORRIDA, CON CLAUDE Y CON OPENAI (22-nov-2026).
 * Tarifas del 22-nov-2026 (platform.claude.com/docs/en/about-claude/pricing).
 * Lo que cambia con Claude es un renglón: lo ESCRITO al caché se cobra aparte.
 */
let b: typeof import("../src/services/billing.js");
beforeAll(async () => {
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
  b = await import("../src/services/billing.js");
});

const M = 1_000_000;

describe("costoEnUsd", () => {
  it("gpt-5.5: nada cambia — entrada plena, caché al 10 %, salida", () => {
    expect(b.costoEnUsd("gpt-5.5", { input: M, cached: 600_000, output: 100_000 })).toBeCloseTo(0.4 * 5 + 0.6 * 0.5 + 0.1 * 30, 6);
  });

  it("Fable 5.2: lo leído del caché a $0,20, lo escrito a $10, el resto a $8, la salida a $40", () => {
    const usd = b.costoEnUsd("claude-fable-5-2", { input: M, cached: 600_000, cacheWrite: 300_000, output: 100_000 });
    expect(usd).toBeCloseTo(0.1 * 8 + 0.6 * 0.2 + 0.3 * 10 + 0.1 * 40, 6);
  });

  it("cada modelo con SU tarifa, aunque un id sea prefijo de otro", () => {
    expect(b.tarifaDe("claude-opus-5-5").input).toBe(4);
    expect(b.tarifaDe("claude-opus-5").input).toBe(5);
    expect(b.tarifaDe("claude-sonnet-5-5").output).toBe(10);
    expect(b.tarifaDe("claude-haiku-5-5").input).toBe(0.1);
  });

  it("un claude- desconocido se cobra como el más caro de Claude, no como gpt-5.5", () => {
    expect(b.tarifaDe("claude-algo-nuevo")).toEqual(b.tarifaDe("claude-fable-5-2"));
    expect(b.tarifaDe("modelo-raro")).toEqual(b.tarifaDe("gpt-5.5"));
  });

  it("los contadores nunca cobran más tokens de los que entraron", () => {
    const usd = b.costoEnUsd("claude-fable-5-2", { input: 1000, cached: 900, cacheWrite: 500, output: 0 });
    expect(usd).toBeCloseTo((900 * 0.2 + 100 * 10) / M, 9);
  });
});

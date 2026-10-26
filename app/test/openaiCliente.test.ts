import { describe, expect, it } from "vitest";

/**
 * Manuel, 26-oct 16:17 (conv 3): la primera llamada al modelo se quedó colgada
 * hasta que el SDK la dio por vencida (10 min por defecto; esa vez cortó a los
 * ~90 s) y el reintento recién contestó a las 16:19:10. El cliente del vendedor
 * y del clasificador tiene que tener tope corto y un solo reintento del SDK.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";

const { nuevoClienteOpenAI, OPENAI_TIMEOUT_MS, OPENAI_MAX_RETRIES } = await import("../src/agent/openaiCliente.js");

describe("cliente de OpenAI del bot", () => {
  it("espera a lo sumo 45 s por llamada y reintenta una sola vez", () => {
    const cliente = nuevoClienteOpenAI();
    expect(OPENAI_TIMEOUT_MS).toBe(45_000);
    expect(OPENAI_MAX_RETRIES).toBe(1);
    expect(cliente.timeout).toBe(45_000);
    expect(cliente.maxRetries).toBe(1);
  });
});

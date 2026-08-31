/**
 * Excepción de pruebas del interruptor global: con el bot apagado, solo los
 * teléfonos listados en BOT_APAGADO_EXCEPTO (o el del vendedor, si no hay
 * lista) siguen recibiendo respuesta.
 */
import { afterEach, describe, expect, it } from "vitest";

// La config lee el entorno AL IMPORTARSE: esto va antes del import de src/.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:9/test";

const { contestaAunApagado } = await import("../src/services/botPower.js");

const original = process.env.BOT_APAGADO_EXCEPTO;

afterEach(() => {
  if (original === undefined) delete process.env.BOT_APAGADO_EXCEPTO;
  else process.env.BOT_APAGADO_EXCEPTO = original;
});

describe("contestaAunApagado", () => {
  it("acepta los teléfonos de la lista y rechaza al resto", async () => {
    process.env.BOT_APAGADO_EXCEPTO = "593999111222, 593988777666";
    expect(await contestaAunApagado("593999111222")).toBe(true);
    expect(await contestaAunApagado("593988777666")).toBe(true);
    expect(await contestaAunApagado("593900000000")).toBe(false);
  });

  it("compara solo dígitos: el + y los espacios no cambian quién es", async () => {
    process.env.BOT_APAGADO_EXCEPTO = "+593 99 911 1222";
    expect(await contestaAunApagado("593999111222")).toBe(true);
  });

  it("una lista vacía apaga la excepción del todo (nadie pasa)", async () => {
    process.env.BOT_APAGADO_EXCEPTO = "";
    expect(await contestaAunApagado("593999111222")).toBe(false);
    // Un teléfono vacío tampoco pasa jamás, haya lista o no.
    expect(await contestaAunApagado("")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { esComandoDeReinicio, MENSAJE_DE_REINICIO } from "../src/domain/reinicio.js";

describe("el comando de reinicio", () => {
  it.each(["/restart", "/reiniciar", "/reset", "  /RESTART  ", "/Restart"])(
    "reconoce %s", (texto) => expect(esComandoDeReinicio(texto)).toBe(true),
  );

  it.each([
    "¿qué hace /restart?",
    "restart",
    "necesito /restart para probar",
    "hola",
    "205/55R16",
    "",
  ])("no lo confunde con %s", (texto) => expect(esComandoDeReinicio(texto)).toBe(false));

  it("el aviso dice qué se borró, para que nadie crea que perdió su cotización por error", () => {
    expect(MENSAJE_DE_REINICIO).toMatch(/medida/i);
    expect(MENSAJE_DE_REINICIO).toMatch(/cotizaci[óo]n/i);
    expect(MENSAJE_DE_REINICIO).toMatch(/local/i);
  });
});

import { describe, expect, it } from "vitest";
import { aroEnTexto, aroVigenteDeLaVisita } from "../src/domain/aros.js";

/**
 * Producción, 31-ago-2026, conv 3 c20: el cliente venía de «una rin 15»,
 * rechazó el 185, y la pieza siguiente salió con 205/55R16 — aro 16.
 */
describe("el aro que el cliente tiene sobre la mesa", () => {
  it("EL CASO DE MANUEL: «una rin 15» es aro 15", () => {
    expect(aroEnTexto("una rin 15 porf")).toBe(15);
    expect(aroEnTexto("una rin 15")).toBe(15);
    expect(aroEnTexto("que no quiero 185 que otras tiene que son rin 15")).toBe(15);
  });

  it("la medida completa manda sobre el aro suelto", () => {
    expect(aroEnTexto("tengo rin 15 pero mejor deme una 205/55R16")).toBe(16);
    expect(aroEnTexto("necesito 185/65R15")).toBe(15);
  });

  it("EL CASO QUE NO DEBE DISPARAR: sin aro no se inventa", () => {
    expect(aroEnTexto("hola")).toBeNull();
    expect(aroEnTexto("no puedo esos dias")).toBeNull();
    expect(aroEnTexto("quiero 4 llantas")).toBeNull();
    // «185» solo (ancho suelto) no es un aro.
    expect(aroEnTexto("ya no 185 no me gusta")).toBeNull();
  });

  it("en la visita, la última mención del cliente manda", () => {
    expect(aroVigenteDeLaVisita(["una rin 15", "2", "mejor en rin 16"])).toBe(16);
    expect(aroVigenteDeLaVisita(["una rin 15", "no me gusta la 185", "que otras tiene"])).toBe(15);
    expect(aroVigenteDeLaVisita(["hola", "buenas"])).toBeNull();
  });

  it("EL BORDE: r15 pegado también cuenta, y fuera de rango es ruido", () => {
    expect(aroEnTexto("una r15 economica")).toBe(15);
    expect(aroEnTexto("rin 45")).toBeNull();
  });
});

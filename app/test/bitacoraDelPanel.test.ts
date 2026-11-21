import { describe, expect, it } from "vitest";
import { cuerpoSinSecretos } from "../src/services/accionesDelPanel.js";

describe("bitácora del panel: el cuerpo se guarda sin secretos", () => {
  it("oculta claves, tokens y contraseñas a cualquier profundidad", () => {
    expect(cuerpoSinSecretos({ nombre: "Carlos", clave: "1234", canal: { token: "abc", numero: "099" }, adminKey: "x" }))
      .toEqual({ nombre: "Carlos", clave: "[oculto]", canal: { token: "[oculto]", numero: "099" }, adminKey: "[oculto]" });
  });
  it("recorta textos largos, listas largas y archivos", () => {
    expect((cuerpoSinSecretos("a".repeat(900)) as string).length).toBe(501);
    expect((cuerpoSinSecretos(Array.from({ length: 60 }, (_, i) => i)) as unknown[]).length).toBe(51);
    expect(cuerpoSinSecretos(Buffer.from("hola"))).toBe("[archivo de 4 bytes]");
  });
});

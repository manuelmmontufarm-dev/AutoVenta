import { describe, expect, it } from "vitest";
import { rangoDeAros } from "../src/domain/aros.js";

describe("cómo se le nombran al cliente los aros que hay", () => {
  it("dice rango cuando los aros son corridos", () => {
    expect(rangoDeAros([13, 14, 15, 16, 17, 18, 19, 20])).toBe("13 al 20");
    expect(rangoDeAros([16, 17])).toBe("16 al 17");
  });

  it("enumera cuando hay huecos, para no prometer un aro que no existe", () => {
    // Si se dijera "13 al 17", el del 14 pregunta por un aro que no manejamos.
    expect(rangoDeAros([13, 15, 17])).toBe("13, 15 y 17");
    expect(rangoDeAros([13, 20])).toBe("13 y 20");
  });

  it("ordena y deduplica: el catálogo entrega los aros como caigan", () => {
    expect(rangoDeAros([17, 13, 15, 17, 13])).toBe("13, 15 y 17");
    expect(rangoDeAros([15, 14, 13])).toBe("13 al 15");
  });

  it("un solo aro se dice solo", () => {
    expect(rangoDeAros([13])).toBe("13");
  });

  it("sin stock devuelve null para que el bot se calle en vez de prometer", () => {
    expect(rangoDeAros([])).toBeNull();
  });
});

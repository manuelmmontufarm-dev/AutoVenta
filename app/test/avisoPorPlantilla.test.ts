import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/no_se_usa";
const { avisoEnUnaLinea } = await import("../src/services/avisoPorPlantilla.js");

describe("avisoEnUnaLinea (variable de plantilla de Meta)", () => {
  it("sin saltos de línea, tabs ni espacios repetidos", () => {
    const linea = avisoEnUnaLinea("🛒 *Nueva cotización*\n\nCliente: Juan\t(0991234567)\n   4 × Kenda   205/55R16\n\nAbrir: https://x/admin");
    expect(linea).toBe("🛒 *Nueva cotización* · Cliente: Juan (0991234567) · 4 × Kenda 205/55R16 · Abrir: https://x/admin");
    expect(linea).not.toMatch(/[\n\t]| {2,}/);
  });

  it("se corta con … para no pasarse del límite del cuerpo", () => {
    const linea = avisoEnUnaLinea("a".repeat(2000), 700);
    expect(linea.length).toBe(700);
    expect(linea.endsWith("…")).toBe(true);
  });

  it("vacío no deja la variable en blanco (Meta la rechaza)", () => {
    expect(avisoEnUnaLinea("\n\n  \n")).toBe("revisa el panel");
  });
});

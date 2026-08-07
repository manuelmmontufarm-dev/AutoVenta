import { describe, expect, it } from "vitest";
import { lookupFitment } from "../src/domain/fitment.js";

// El servicio construye el cliente de OpenAI al importarse, así que config.ts
// exige estas variables. No se usa la red: con VITEST activo la investigación
// web se corta y solo corre la ficha local.
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_fitment_falso";

const { researchVehicleFitment } = await import("../src/services/vehicleFitmentResearch.js");

describe("fitment por vehículo y año", () => {
  it("resuelve Highlander 2012 por versión con fuente oficial", () => {
    const fitment = lookupFitment("Toyota", "Highlander", 2012);
    expect(fitment?.sizes).toEqual(["245/65R17", "245/55R19"]);
    expect(fitment?.validated).toBe(true);
    expect(fitment?.sourceUrl).toContain("toyota.com");
  });

  it("no aplica esa ficha fuera del rango de años", () => {
    expect(lookupFitment("Toyota", "Highlander", 2025)).toBeNull();
  });
});

/**
 * El aro del cliente contra la ficha curada. No toca red: con VITEST activo la
 * investigación web se corta sola, así que aquí solo corre la rama local.
 */
describe("researchVehicleFitment con aro del cliente", () => {
  it("el aro descarta la versión que no le sirve y deja la decisión resuelta", async () => {
    const r = await researchVehicleFitment("Toyota", "Highlander", 2012, 19);
    // La ficha tiene 17 y 19; con aro 19 queda una sola y ya no hay qué preguntar.
    expect(r.sizes).toEqual(["245/55R19"]);
    expect(r.status).toBe("verified");
    expect(r.nextQuestion).toBeNull();
  });

  it("sin aro conserva las dos y pregunta la versión", async () => {
    const r = await researchVehicleFitment("Toyota", "Highlander", 2012, null);
    expect(r.sizes).toEqual(["245/65R17", "245/55R19"]);
    expect(r.status).toBe("reference");
    expect(r.nextQuestion).toMatch(/versión/i);
  });

  it("un aro que la ficha no registra no borra las medidas: se ofrecen con su límite dicho", async () => {
    const r = await researchVehicleFitment("Toyota", "Highlander", 2012, 22);
    expect(r.sizes).toEqual(["245/65R17", "245/55R19"]);
    expect(r.status).toBe("reference");
    expect(r.note).toContain("aro 22");
  });

  /**
   * Toda salida trae 'candidatos' con su respaldo — es lo que permite a la tool
   * decir qué medida puede defender y cuál solo ofrecer con reservas.
   */
  it("cada medida viaja con su nivel de confianza", async () => {
    const r = await researchVehicleFitment("Toyota", "Highlander", 2012, 19);
    expect(r.candidatos).toEqual([
      { medida: "245/55R19", confianza: "alta", porque: expect.any(String) },
    ]);
  });

  it("un vehículo inexistente cae en not_found sin candidatos, y ahí entra el candado de la tool", async () => {
    const r = await researchVehicleFitment("MarcaFicticia", "ModeloFicticio", null, null);
    expect(r.status).toBe("not_found");
    expect(r.candidatos).toEqual([]);
    // La pregunta ofrece las dos vías: escribir la medida o mandar la foto.
    expect(r.nextQuestion).toMatch(/medida/i);
    expect(r.nextQuestion).toMatch(/foto/i);
  });
});

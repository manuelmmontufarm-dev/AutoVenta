import { describe, expect, it } from "vitest";
import { lookupFitment, palabrasDeModelo } from "../src/domain/fitment.js";

/**
 * El matcher por palabras (1-sep-2026), medido contra los vehículos que los
 * clientes escribieron DE VERDAD en producción (`conversations.vehicle`).
 * Antes se comparaban cadenas enteras y la mitad de esto no encontraba ficha.
 */
describe("lookupFitment: cómo escribe la gente el modelo", () => {
  it.each([
    // [marca, modelo, año, ficha esperada]
    ["Suzuki", "SZ", 2016, "grand vitara sz"],
    ["Susuki", "Sz", 2016, "grand vitara sz"],
    ["Suzuki", "Gran Vitara SZ", 2012, "grand vitara sz"],
    ["Suzuki", "Vitara SZ 4x2", 2010, "grand vitara sz"],
    ["Suzuki", "Grand Vitara SZ", 2016, "grand vitara sz"],
    ["Chevrolet", "D-Max Hi Ride", 2026, "d-max"],
    ["Chevrolet", "Dmax", 2015, "d-max"],
    ["Toyota", "Fortuner", 2010, "fortuner"],
    ["Toyota", "Prado", 2006, "land cruiser prado"],
    ["Toyota", "Prado Land Cruiser", 2006, "land cruiser prado"],
    ["Toyota", "Yaris sedan", 2006, "yaris sedan"],
    ["Toyota", "4Runner", 1997, "4runner"],
    ["Kia", "Sportage", 2018, "sportage"],
    ["Kia", "Picanto", 2006, "picanto"],
    ["Nissan", "X-Trail", 2009, "x-trail"],
    ["Nissan", "Xtrail", 2020, "x-trail"],
    ["Hyundai", "Tucson", null, "tucson"],
    ["Toyota", "Corolla Cross", 2023, "corolla cross"],
    ["Toyota", "Corolla", 2023, "corolla"],
  ] as const)("%s %s %s → %s", (marca, modelo, anio, esperada) => {
    expect(lookupFitment(marca, modelo, anio)?.model).toBe(esperada);
  });

  it("el Grand Vitara SZ trae las medidas correctas y su confianza", () => {
    const ficha = lookupFitment("Suzuki", "SZ", 2016);
    expect(ficha?.sizes).toEqual(["225/65R17", "225/70R16"]);
    expect(ficha?.confianza).toBe("media");
    expect(ficha?.validated).toBe(false);
  });

  it("un año fuera de todas las fichas del modelo no inventa una", () => {
    expect(lookupFitment("Toyota", "Fortuner", 1999)).toBeNull();
  });

  it("no matchea por una sola letra ni por palabras de carrocería", () => {
    expect(lookupFitment("Nissan", "cabina simple", 2015)).toBeNull();
    expect(lookupFitment("Mazda", "Manzana", null)).toBeNull();
  });

  it("palabrasDeModelo quita año, ruido y aplica sinónimos", () => {
    expect(palabrasDeModelo("Gran Vitara SZ 4x2 2010")).toEqual(["grand", "vitara", "sz"]);
    expect(palabrasDeModelo("D-Max doble cabina 2015")).toEqual(["dmax"]);
  });
});

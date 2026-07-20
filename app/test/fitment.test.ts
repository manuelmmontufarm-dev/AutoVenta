import { describe, expect, it } from "vitest";
import { lookupFitment } from "../src/domain/fitment.js";

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

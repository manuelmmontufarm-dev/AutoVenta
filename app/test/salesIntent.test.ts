import { describe, expect, it } from "vitest";
import {
  canGenerateFinalQuote,
  extractExplicitQuantity,
  extractVehicleYear,
  hasExplicitQuantity,
  isComparisonRequest,
  isExplicitPurchaseConfirmation,
} from "../src/domain/salesIntent.js";

describe("guardas del flujo comercial", () => {
  it("bloquea cotización durante una comparación", () => {
    expect(isComparisonRequest("cuál es mejor entre la Falken y la Kendal")).toBe(true);
    expect(canGenerateFinalQuote("compara estas 3", true)).toBe(false);
  });

  it("exige una cantidad explícita", () => {
    expect(hasExplicitQuantity("quiero tres llantas")).toBe(true);
    expect(canGenerateFinalQuote("la Kenda por favor")).toBe(false);
    expect(canGenerateFinalQuote("quiero 3 llantas Kenda")).toBe(true);
  });

  it("recuerda una cantidad aislada sin confundirla con el año", () => {
    expect(extractExplicitQuantity("4")).toBe(4);
    expect(extractExplicitQuantity("quiero cuatro llantas")).toBe(4);
    expect(extractExplicitQuantity("Chevrolet Trooper 2002")).toBeNull();
    expect(canGenerateFinalQuote("sí, esa", false, true)).toBe(true);
  });

  it("extrae un año vehicular ya informado", () => {
    expect(extractVehicleYear("las que le entren a mi 2002 trooper")).toBe(2002);
    expect(extractVehicleYear("medida 245/75R16")).toBeNull();
  });

  it("solo cierra ganado ante compra ya realizada", () => {
    expect(isExplicitPurchaseConfirmation("ok ya compré las llantas, gracias")).toBe(true);
    expect(isExplicitPurchaseConfirmation("quiero comprar las llantas")).toBe(false);
  });
});

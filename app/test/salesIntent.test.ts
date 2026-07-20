import { describe, expect, it } from "vitest";
import {
  canGenerateFinalQuote,
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

  it("solo cierra ganado ante compra ya realizada", () => {
    expect(isExplicitPurchaseConfirmation("ok ya compré las llantas, gracias")).toBe(true);
    expect(isExplicitPurchaseConfirmation("quiero comprar las llantas")).toBe(false);
  });
});

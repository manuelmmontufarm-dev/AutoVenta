import { describe, expect, it } from "vitest";
import { respondeQueSi } from "../src/domain/ofertaAceptada.js";
import { aceptaLaOferta } from "../src/domain/ofertaVigente.js";
import { extractExplicitQuantity } from "../src/domain/salesIntent.js";

/**
 * PRUEBA COMPETIMOTOR 40 × 3 (18-nov-2026) · familia B: «se traba antes de
 * cotizar». Los textos son los del cliente en las corridas reales del
 * simulador (`mediciones/competimotor-2026-11-19-03-33/corridas/CM27-*`).
 */
describe("CM27 · «ok esa, 4» a la oferta de UNA llanta es el sí con la cantidad", () => {
  it("respondeQueSi lee el sí con la cantidad pegada", () => {
    expect(respondeQueSi("ok esa, 4")).toBe(true);
    expect(respondeQueSi("si esa 2")).toBe(true);
    expect(respondeQueSi("dale ese, cuatro llantas")).toBe(true);
    // lo de antes sigue igual
    expect(respondeQueSi("ok esa")).toBe(true);
    expect(respondeQueSi("esa 4 pero en otra medida?")).toBe(false);
  });

  it("la cantidad sale del mismo mensaje", () => {
    expect(extractExplicitQuantity("ok esa, 4")).toBe(4);
    expect(extractExplicitQuantity("si esas dos")).toBe(2);
    // el modelo del carro no es cantidad
    expect(extractExplicitQuantity("ok esa, para el arrizo 5")).toBe(null);
  });

  it("acepta la oferta de una llanta pegada a la oferta", () => {
    const leida = { oferta: { clase: "una", codigo: "A0001" }, fuente: "hecho", turnosAtras: 0 } as never;
    expect(aceptaLaOferta(leida, "ok esa, 4")).toBe(true);
  });
});

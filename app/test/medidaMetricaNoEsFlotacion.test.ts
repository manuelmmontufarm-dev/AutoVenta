/**
 * «325/30R21» ES UNA MÉTRICA, NO UNA FLOTACIÓN A LA QUE LE FALTA EL ANCHO.
 *
 * Simulador 21-nov-2026 (perfil mundillantas): «Tienen 325/30R21?» → la ruta
 * directa respondió preguntando el ancho, como si fuera «30 R21» (30X9.5R15).
 * `flotacionIncompleta` buscaba «dos dígitos + R + aro» sin mirar si delante
 * había un ancho métrico de tres dígitos.
 */
import { describe, expect, it } from "vitest";
import * as ts from "../src/domain/tireSize.js";

describe("métrica con perfil 30–44: no es flotación incompleta", () => {
  const metricas: Array<[string, string]> = [
    ["325/30R21", "325/30R21"],
    ["325/30 R21", "325/30R21"],
    ["325 30 21", "325/30R21"],
    ["275/35R20", "275/35R20"],
    ["245/35ZR20", "245/35R20"],
    ["23575r15", "235/75R15"],
    ["Tienen 325/30R21?", "325/30R21"],
  ];
  for (const [texto, esperada] of metricas) {
    it(`«${texto}» se lee como ${esperada} y no pide el ancho`, () => {
      expect(ts.flotacionIncompleta(texto)).toBeNull();
      expect(ts.medidaIncompleta(texto)).toBe(false);
      expect(ts.loQueFaltaDeLaMedida(texto)).toBeNull();
      expect(ts.medidaCanonica(texto)).toBe(esperada);
    });
  }
});

describe("las flotaciones siguen siendo flotaciones", () => {
  for (const texto of ["30x9.5R15", "31x10.50R15", "35X12.5R20", "33 12.5 20"]) {
    it(`«${texto}» es una flotación completa`, () => {
      expect(ts.extractFlotationSizes(texto).length).toBe(1);
      expect(ts.flotacionIncompleta(texto)).toBeNull();
    });
  }
});

describe("sin ancho delante, sigue pidiendo el ancho", () => {
  it("«30 R15» suelto es una flotación a la que le falta el ancho", () => {
    expect(ts.flotacionIncompleta("30 R15")).toEqual({ diameter: 30, rim: 15 });
    expect(ts.medidaIncompleta("30 R15")).toBe(true);
  });
  it("«Tienen 30 R21?» también", () => {
    expect(ts.flotacionIncompleta("Tienen 30 R21?")).toEqual({ diameter: 30, rim: 21 });
  });
});

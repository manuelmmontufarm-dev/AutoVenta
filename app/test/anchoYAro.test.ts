/**
 * «235 rin 15» (R-25): el ancho dado con el aro filtra la búsqueda.
 * El caso real es la demo de Mundillantas del 4-nov-2026 (28:14): el bot
 * mostró 205/65, 185/65 y 195/55 a quien pidió 235 en aro 15.
 */
import { describe, expect, it } from "vitest";
import { anchoYAro } from "../src/domain/anchoYAro.js";
import { medidaNoDada } from "../src/domain/medidaConfirmada.js";

describe("anchoYAro", () => {
  it.each([
    ["235 rin 15", 235, 15],
    ["235 R15", 235, 15],
    ["235 r 15", 235, 15],
    ["235 aro 15", 235, 15],
    ["rin 15 235", 235, 15],
    ["tiene la 265 en rin 16?", 265, 16],
    ["265 ring 16", 265, 16],
  ])("lee «%s» como ancho %i aro %i", (texto, ancho, aro) => {
    expect(anchoYAro(texto)).toEqual({ ancho, aro });
  });

  it.each([
    "235/60R15", // medida completa: su propia ruta
    "mejor la 235/60R15 entonces",
    "rin 15", // solo el aro
    "una llanta 235", // solo el ancho
    "quiero 4 llantas", // nada
    "33x12.50R15", // flotación completa
    "120 rin 15", // 120 no es un ancho métrico real
  ])("no inventa ancho+aro en «%s»", (texto) => {
    expect(anchoYAro(texto)).toBeNull();
  });

  it("con medida completa Y ancho+aro suelto, gana el suelto explícito", () => {
    // «tenía 235/60R15 pero ahora quiero 265 rin 16»
    expect(anchoYAro("tenia 235/60R15 pero ahora quiero 265 rin 16")).toEqual({ ancho: 265, aro: 16 });
  });
});

describe("medidaNoDada con «235 rin 15»", () => {
  // R-25: «235 rin 15» ya cuenta como medida escrita por el cliente
  // (extractTireSizes la lee con aspect null), así que el candado de
  // medida inventada NO bloquea una 235/60R15 buscada a partir de eso.
  it("no bloquea una 235/xxR15 cuando el cliente dio «235 rin 15»", () => {
    expect(
      medidaNoDada({
        medida: "235/60R15",
        textos: ["235 rin 15"],
        medidaDeLaFicha: null,
        huboFitment: false,
      }),
    ).toBeNull();
  });

  it("sí bloquea cuando el cliente dio SOLO el aro", () => {
    expect(
      medidaNoDada({
        medida: "235/60R15",
        textos: ["rin 15"],
        medidaDeLaFicha: null,
        huboFitment: false,
      }),
    ).toBe(15);
  });
});

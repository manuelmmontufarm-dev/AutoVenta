import { describe, expect, it } from "vitest";
import {
  extractTireSizes,
  formatTireSize,
  parseTireSize,
} from "../src/domain/tireSize.js";

describe("parseTireSize", () => {
  const cases: [string, string | null][] = [
    // Formatos canónicos
    ["185/65R14", "185/65R14"],
    ["185/65 R14", "185/65R14"],
    ["185/65-14", "185/65R14"],
    // Como escribe la gente por WhatsApp
    ["185 65 14", "185/65R14"],
    ["185-65-14", "185/65R14"],
    ["185.65.14", "185/65R14"],
    ["quiero 4 llantas 205/55r16 porfa", "205/55R16"],
    ["Hola necesito llantas 265/70 R17 para mi camioneta", "265/70R17"],
    // Sin perfil
    ["185 R14", "185R14"],
    ["185R14", "185R14"],
    // Prefijos
    ["LT265/70R17", "265/70R17"],
    ["P205/55R16", "205/55R16"],
    ["205/55ZR16", "205/55R16"],
    // Minúsculas
    ["195/60r15", "195/60R15"],
    // Aro primero, como se dice en Ecuador (conv valle, 1-sep)
    ["Rin 14 60 195", "195/60R14"],
    ["Rin 14 60 195 doble propósito", "195/60R14"],
    ["aro 16 55 205", "205/55R16"],
    // Como escribe la gente: ya funcionaba, no se rompe
    ["185 60 Rin 14", "185/60R14"],
    // No-medidas: no debe alucinar
    ["hola buenas tardes", null],
    ["mi número es 0991234567", null],
    ["el precio era $120.50", null],
    ["999/99R99", null], // fuera de rango
    ["186/65R14", null], // ancho no múltiplo de 5
  ];

  it.each(cases)("%s → %s", (input, expected) => {
    const size = parseTireSize(input);
    expect(size ? formatTireSize(size) : null).toBe(expected);
  });
});

describe("extractTireSizes", () => {
  it("extrae varias medidas de un texto", () => {
    const sizes = extractTireSizes("tengo 185/65R14 adelante y 195/60R15 atrás");
    expect(sizes.map(formatTireSize)).toEqual(["185/65R14", "195/60R15"]);
  });

  it("deduplica", () => {
    const sizes = extractTireSizes("185/65R14 o sea 185 65 14");
    expect(sizes).toHaveLength(1);
  });
});

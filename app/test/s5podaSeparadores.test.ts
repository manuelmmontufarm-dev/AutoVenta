/**
 * Sprint 5, ronda 3: la poda de `podarHechosNuevosDelGuardian` con dos
 * separadores «---» y una línea vacía en medio no deja un bloque vacío (efecto
 * del arreglo de la ronda 2, que dejó de pegar el separador al texto siguiente).
 */
import { describe, expect, it } from "vitest";
import { podarHechosNuevosDelGuardian } from "../src/domain/guardianNoVendeSolo.js";

const WINRUN = { code: "2257016WRMAXCLAWAT", brand: "WINRUN", design: "MAXCLAW A/T" };
const bloques = (t: string) => t.split(/\n\s*-{3,}\s*\n/).map((b) => b.trim());

describe("poda · separadores seguidos", () => {
  it.each([
    "La Falken que le coticé es H/T.\n---\n\n---\nLa *WINRUN MAXCLAW A/T* a $124.76 sí es A/T.\n---\n¿Le ayudo con algo más?",
    "La Falken que le coticé es H/T.\n---\nLa *WINRUN MAXCLAW A/T* a $124.76 sí es A/T.\n\n---\n\n¿Le ayudo con algo más?",
    "La Falken que le coticé es H/T.\n\n---\n\nLa *WINRUN MAXCLAW A/T* a $124.76 sí es A/T.\n---\n\n---\n¿Le ayudo con algo más?",
  ])("sin bloques vacíos ni separador pegado: %j", (correccion) => {
    const salida = podarHechosNuevosDelGuardian("La Falken que le coticé es H/T. ¿Le ayudo con algo más?", correccion, [WINRUN]);
    expect(salida).not.toBeNull();
    expect(bloques(salida!).every((b) => b.length > 0)).toBe(true);
    expect(salida).not.toMatch(/---\S|\S---/);
    expect(salida).not.toContain("WINRUN");
    expect(bloques(salida!)).toEqual(["La Falken que le coticé es H/T.", "¿Le ayudo con algo más?"]);
  });
});

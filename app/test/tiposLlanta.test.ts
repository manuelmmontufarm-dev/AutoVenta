import { beforeAll, describe, expect, it } from "vitest";

type M = typeof import("../src/domain/tireTypes.js");
let m: M;
beforeAll(async () => { m = await import("../src/domain/tireTypes.js"); });

describe("base de tipos de llanta", () => {
  it("normaliza como escribe la gente", () => {
    expect(m.normalizarTipo("at")).toBe("A/T");
    expect(m.normalizarTipo("A T")).toBe("A/T");
    expect(m.normalizarTipo("all terrain")).toBe("A/T");
    expect(m.normalizarTipo("M/T")).toBe("M/T");
    expect(m.normalizarTipo("UHP")).toBe("TURISMO UHP");
    expect(m.normalizarTipo("no existe")).toBe("");
  });

  it("resuelve el tipo por código del catálogo", () => {
    expect(m.tipoDeProducto("356518")).toBe("A/T");
  });

  it("cae al modelo cuando el código no está", () => {
    expect(m.tipoDeProducto("codigo-inventado", "WILDPEAK A/T4W")).toBe("A/T");
    expect(m.tipoDeProducto("codigo-inventado", "modelo inventado")).toBeNull();
  });

  it("ordena las marcas de premium a económica", () => {
    const orden = m.ordenDeMarca();
    expect(orden[0]).toBe("FALKEN");
    expect(orden.at(-1)).toBe("WINRUN");
    expect(m.escalonDeMarca("FALKEN")).toBeLessThan(m.escalonDeMarca("WINRUN"));
    // Una marca desconocida nunca se presenta como premium.
    expect(m.escalonDeMarca("MarcaRara")).toBe(orden.length);
  });

  it("cada tipo explica cuándo va y cuándo no", () => {
    const at = m.infoTipo("A/T");
    expect(at?.cuandoOfrecerla).toBeTruthy();
    expect(at?.noOfrecerlaSi).toBeTruthy();
    expect(m.catalogoDeTipos().length).toBeGreaterThanOrEqual(8);
  });

  it("filtra líneas por aro y tipo", () => {
    const at17 = m.lineasPorAro(17, "A/T");
    expect(at17.length).toBeGreaterThan(0);
    expect(at17.every((l) => m.normalizarTipo(l.tipo) === "A/T")).toBe(true);
    expect(at17.every((l) => l.aros.includes(17))).toBe(true);
  });
});

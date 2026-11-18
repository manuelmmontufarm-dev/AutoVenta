/**
 * Competimotor (Santo Domingo) tiene su propio conocimiento: 45 marcas, con
 * su política (alineación solo con 4 llantas, seguro sin plazos) y nunca los
 * datos de Depot (18/12/6 meses, 86.500 km).
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
const { conocimientoParaElTurno, lonasDeModeloEnMedida } = await import("../src/domain/conocimientoProducto.js");

describe("conocimiento de Competimotor", () => {
  it("alineación solo comprando las 4", () => {
    expect(conocimientoParaElTurno("incluye alineacion y balanceo?")).toMatch(/Comprando las 4 llantas/);
  });
  it("km: no promete cifras de Depot", () => {
    const hecho = conocimientoParaElTurno("cuantos kilometros dura?") ?? "";
    expect(hecho).toMatch(/PROHIBIDO inventar un número de km/);
    expect(hecho).not.toMatch(/86\.500|68\.500|18 meses/);
  });
  it("«¿qué tal la Haida?» trae su marca", () => {
    expect(conocimientoParaElTurno("que tal es la marca haida?")).toMatch(/MARCA HAIDA/);
  });
  it("Kenda sigue siendo taiwanesa", () => {
    expect(conocimientoParaElTurno("las kenda son chinas?")).toMatch(/TAIWANESA/);
  });
  it("«all terrain» a secas no se lee como un modelo de una marca", async () => {
    const { modelosEnTexto } = await import("../src/domain/conocimientoProducto.js");
    expect(modelosEnTexto("busco una all terrain lisa para traccion")).toEqual([]);
  });
  it("las lonas salen del artículo de Fénix", () => {
    expect(lonasDeModeloEnMedida("HD737", "225/70R15")).toEqual([10]);
    expect(conocimientoParaElTurno("de cuantas lonas es?", ["HAIDA HD737 225/70R15"])).toMatch(/225\/70R15: 10 lonas/);
  });
});

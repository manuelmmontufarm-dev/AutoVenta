import { describe, expect, it } from "vitest";
import {
  restriccionesDeLlanta,
  violaRestriccionesDeLlanta,
} from "../src/domain/restriccionesLlanta.js";

describe("memoria de medidas rechazadas", () => {
  it("recuerda el ancho rechazado por roce/consumo", () => {
    const r = restriccionesDeLlanta([
      "no, gracias, 205 muy ancha; con el auto cargado rozan y consume más",
    ]);
    expect(r.anchosRechazados).toEqual([205]);
    expect(violaRestriccionesDeLlanta("205/55R16", r)).toBe(true);
    expect(violaRestriccionesDeLlanta("195/60R16", r)).toBe(false);
  });

  it("la decisión posterior y explícita del cliente rehabilita el ancho", () => {
    const r = restriccionesDeLlanta([
      "205 muy ancha, me roza",
      "ya revisé: deme la 205/55R16",
    ]);
    expect(r.anchosRechazados).toEqual([]);
  });

  // Producción, 31-ago-2026, conv 3 c20 (Manuel Montufar): estos dos mensajes
  // son textuales de la base. El primero no registraba nada («no me gusta» no
  // estaba en el patrón) y el turno siguiente reenvió dos 185.
  it("EL CASO DE MANUEL: «ya no 185 no me gusta» rechaza el 185", () => {
    const r = restriccionesDeLlanta([
      "sabe que esta muy ya no 185 no me gusta que otras tiene",
    ]);
    expect(r.anchosRechazados).toEqual([185]);
    expect(violaRestriccionesDeLlanta("185/65R15", r)).toBe(true);
    expect(violaRestriccionesDeLlanta("195/55R15", r)).toBe(false);
  });

  it("el segundo mensaje de Manuel también rechaza, y el rin 15 no se confunde con un ancho", () => {
    const r = restriccionesDeLlanta([
      "que no quiero 185 que otras tiene que son rin 15",
    ]);
    expect(r.anchosRechazados).toEqual([185]);
  });

  it("EL CASO QUE NO DEBE DISPARAR: hablar de una medida sin rechazarla no la veta", () => {
    expect(restriccionesDeLlanta(["me gusta la kenda en 185/65R15"]).anchosRechazados).toEqual([]);
    expect(restriccionesDeLlanta(["necesito 185/65R15 para mi aveo"]).anchosRechazados).toEqual([]);
  });

  it("EL BORDE: «ya no» pegado a un número también cuenta como rechazo", () => {
    const r = restriccionesDeLlanta(["ya no 205, busco algo mas angosto"]);
    expect(r.anchosRechazados).toContain(205);
  });
});

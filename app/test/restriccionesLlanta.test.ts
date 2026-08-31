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
});

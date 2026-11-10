import { describe, expect, it } from "vitest";
import { hayCompromisoDeCierre } from "../src/domain/compromisoDeCierre.js";
import { datoQueFalta, enCierreComercial } from "../src/domain/preguntaPendiente.js";
import { visitaPendiente } from "../src/domain/visitaPendiente.js";

describe("visitaPendiente", () => {
  it("con local y sin visit_date registrada", () => {
    expect(visitaPendiente({ nearest_store: "Depot Tire Quito Sur", visit_date: null })).toBe(true);
  });

  it("sin local o con día ya anotado, no aplica", () => {
    expect(visitaPendiente({ nearest_store: null, visit_date: null })).toBe(false);
    expect(visitaPendiente({
      nearest_store: "Depot Tire Quito Sur",
      visit_date: new Date("2026-09-05T15:00:00Z"),
    })).toBe(false);
  });
});

describe("hayCompromisoDeCierre", () => {
  it("la cotización formal basta", () => {
    expect(hayCompromisoDeCierre({
      hayCotizacionFormal: true,
      hayPiezaDeOpciones: false,
      productoElegido: false,
      cantidadElegida: false,
    })).toBe(true);
  });

  it("sin PDF pero con pieza de opciones (conv 13909)", () => {
    expect(hayCompromisoDeCierre({
      hayCotizacionFormal: false,
      hayPiezaDeOpciones: true,
      productoElegido: false,
      cantidadElegida: false,
    })).toBe(true);
  });

  it("solo medida en exploración no cuenta", () => {
    expect(hayCompromisoDeCierre({
      hayCotizacionFormal: false,
      hayPiezaDeOpciones: false,
      productoElegido: false,
      cantidadElegida: false,
    })).toBe(false);
  });
});

describe("datoQueFalta con compromiso sin cotización", () => {
  const base = {
    hayCotizacion: false,
    hayCompromisoSinCotizacion: true,
    localElegido: true,
    visitaRegistrada: false,
  };

  it("pide el día cuando el local ya está y la visita no", () => {
    expect(datoQueFalta(base)).toBe("dia");
    expect(enCierreComercial(base)).toBe(true);
  });

  it("sin compromiso ni cotización, no empuja cierre", () => {
    expect(datoQueFalta({
      hayCotizacion: false,
      hayCompromisoSinCotizacion: false,
      localElegido: true,
      visitaRegistrada: false,
    })).toBeNull();
  });
});

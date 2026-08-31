import { describe, expect, it } from "vitest";
import {
  afirmaQueAceptanAceiteDelCliente,
  consultaFueraDeCatalogoActiva,
  preguntaSiPuedeLlevarSuAceite,
} from "../src/domain/alcanceComercial.js";

describe("alcance comercial activo", () => {
  it("un acuse conserva la consulta de cambio de aceite", () => {
    expect(consultaFueraDeCatalogoActiva([
      "Necesito llantas para un Kia 2018",
      "¿Hacen cambio de aceite?",
      "Ok",
    ])).toBe(true);
  });

  it("una intención posterior de llantas vuelve a habilitar el catálogo", () => {
    expect(consultaFueraDeCatalogoActiva([
      "¿Hacen cambio de aceite?",
      "Mejor ayúdeme con llantas 205/55R16",
    ])).toBe(false);
  });

  it("detecta la pregunta y la afirmación peligrosa sobre aceite propio", () => {
    expect(preguntaSiPuedeLlevarSuAceite("¿Puedo llevar mi aceite?")).toBe(true);
    expect(afirmaQueAceptanAceiteDelCliente("Sí, puede llevar su aceite.")).toBe(true);
    expect(afirmaQueAceptanAceiteDelCliente(
      "No puedo confirmarle si aceptan aceite llevado por el cliente.",
    )).toBe(false);
  });
});

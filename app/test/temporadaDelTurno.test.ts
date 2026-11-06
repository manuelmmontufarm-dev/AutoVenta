import { afterEach, describe, expect, it, vi } from "vitest";

// La configuración de Ajustes, sin base: cada prueba fija la suya.
let cfg = { modo: "pruebas" as "apagada" | "pruebas" | "todos", telefonos: ["0993728763"] };
vi.mock("../src/services/settings.js", () => ({
  getTemporadaConfig: async () => cfg,
  temporadaConfigEnMemoria: () => cfg,
}));

const { promocionVigente, segundaLlantaDe, fijarCompuertaDeTemporada } = await import("../src/domain/promocionDeTemporada.js");
const { promoAbiertaPara, conElTelefonoDelTurno, comoVistaPrevia, instalarCompuertaDeTemporada } =
  await import("../src/services/temporadaDelTurno.js");
const { POLITICA_DEPOT } = await import("../src/negocio/politicas/depot.js");
const promo = POLITICA_DEPOT.promocionDeTemporada;
const NOVIEMBRE = new Date("2026-11-10T15:00:00Z");
const MANUEL = "593993728763";
const CLIENTE = "593987654321";

afterEach(() => {
  fijarCompuertaDeTemporada(() => true);
  cfg = { modo: "pruebas", telefonos: ["0993728763"] };
});

describe("quién ve la promo de temporada (Ajustes → temporada_config)", () => {
  it("en «pruebas» solo el número de prueba, escrito de cualquier forma", () => {
    expect(promoAbiertaPara({ telefono: MANUEL }, cfg)).toBe(true);
    expect(promoAbiertaPara({ telefono: "+593 99 372 8763" }, cfg)).toBe(true);
    expect(promoAbiertaPara({ telefono: CLIENTE }, cfg)).toBe(false);
    expect(promoAbiertaPara({ telefono: null }, cfg)).toBe(false);
    expect(promoAbiertaPara(undefined, cfg)).toBe(false);
  });

  it("«pruebas» sin teléfonos = nadie (así nace)", () => {
    expect(promoAbiertaPara({ telefono: MANUEL }, { modo: "pruebas", telefonos: [] })).toBe(false);
  });

  it("«todos» abre a cualquiera; «apagada» cierra hasta la vista previa", () => {
    expect(promoAbiertaPara({ telefono: CLIENTE }, { modo: "todos", telefonos: [] })).toBe(true);
    expect(promoAbiertaPara({ telefono: MANUEL }, { modo: "apagada", telefonos: [MANUEL] })).toBe(false);
    expect(promoAbiertaPara({ telefono: null, vistaPrevia: true }, { modo: "apagada", telefonos: [] })).toBe(false);
    expect(promoAbiertaPara({ telefono: null, vistaPrevia: true }, { modo: "pruebas", telefonos: [] })).toBe(true);
  });
});

describe("la compuerta instalada cierra TODO lo que pasa por promocionVigente", () => {
  it("4 Falken a $75: Manuel ve $210, otro cliente ve $300 y fuera de turno nadie", async () => {
    instalarCompuertaDeTemporada();
    const deManuel = await conElTelefonoDelTurno(MANUEL, async () => segundaLlantaDe(promo, "FALKEN", 4, 75, NOVIEMBRE));
    const deOtro = await conElTelefonoDelTurno(CLIENTE, async () => segundaLlantaDe(promo, "FALKEN", 4, 75, NOVIEMBRE));
    expect(deManuel?.totalConIva).toBe(210);
    expect(deOtro).toBeNull();
    expect(promocionVigente(promo, NOVIEMBRE)).toBe(false);
  });

  it("la vista previa de Ajustes la ve en «pruebas»", async () => {
    instalarCompuertaDeTemporada();
    expect(await comoVistaPrevia(async () => promocionVigente(promo, NOVIEMBRE))).toBe(true);
  });

  it("en «todos» la ve cualquier cliente", async () => {
    instalarCompuertaDeTemporada();
    cfg = { modo: "todos", telefonos: [] };
    expect(await conElTelefonoDelTurno(CLIENTE, async () => promocionVigente(promo, NOVIEMBRE))).toBe(true);
  });
});

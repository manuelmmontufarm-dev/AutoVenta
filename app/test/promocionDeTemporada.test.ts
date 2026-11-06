import { describe, expect, it } from "vitest";
import {
  cuentaDeSegundaLlanta,
  marcaConSegundaLlanta,
  productosEnPromocion,
  promocionVigente,
  segundaLlantaDe,
  serviciosEnPromocion,
} from "../src/domain/promocionDeTemporada.js";
import { POLITICA_DEPOT } from "../src/negocio/politicas/depot.js";

const promo = POLITICA_DEPOT.promocionDeTemporada!;
// 12:00 en Quito = 17:00 UTC.
const en = (dia: string, hora = "17:00") => new Date(`${dia}T${hora}:00Z`);

describe("promoción de temporada (Black Friday de Depot)", () => {
  it("corre todo noviembre en hora de Ecuador y se apaga sola el 1-dic", () => {
    expect(promocionVigente(promo, en("2026-10-31"))).toBe(false);
    expect(promocionVigente(promo, en("2026-11-01", "05:00"))).toBe(true); // 00:00 Quito
    expect(promocionVigente(promo, en("2026-12-01", "04:59"))).toBe(true); // 23:59 del 30 en Quito
    expect(promocionVigente(promo, en("2026-12-01", "05:00"))).toBe(false);
    expect(promocionVigente(undefined, en("2026-11-15"))).toBe(false);
  });

  it("4 llantas a $75: 2 × $75 + 2 × $30 = $210, ahorra $90", () => {
    const s = segundaLlantaDe(promo, "Falken", 4, 75, en("2026-11-15"))!;
    expect(s).toMatchObject({ porcentaje: 60, unidades: 2, precioConIva: 30, ahorroConIva: 90, totalConIva: 210 });
    expect(cuentaDeSegundaLlanta(4, s)).toBe("2 × $75.00 + 2 × $30.00 = $210.00");
  });

  it("solo las pares: 3 llantas llevan una, 1 llanta ninguna", () => {
    expect(segundaLlantaDe(promo, "KENDA", 3, 100, en("2026-11-15"))).toMatchObject({ unidades: 1, totalConIva: 240 });
    expect(segundaLlantaDe(promo, "KENDA", 1, 100, en("2026-11-15"))).toBeNull();
  });

  it("solo Falken y Kenda, y solo en noviembre", () => {
    expect(marcaConSegundaLlanta(promo, "WINRUN", en("2026-11-15"))).toBe(false);
    expect(segundaLlantaDe(promo, "WINRUN", 4, 75, en("2026-11-15"))).toBeNull();
    expect(segundaLlantaDe(promo, "FALKEN", 4, 75, en("2026-12-02"))).toBeNull();
  });

  it("servicios: la tabla ya viene al 50 % y el normal es el doble", () => {
    const alineacion = serviciosEnPromocion(promo, en("2026-11-15")).find((s) => s.servicio === "Alineación" && s.vehiculo === "auto")!;
    expect(alineacion).toMatchObject({ precioPromoConIva: 20, precioNormalConIva: 40, porcentaje: 50 });
    expect(serviciosEnPromocion(promo, en("2026-12-02"))).toEqual([]);
  });

  it("aceites: PVP menos el 40 %", () => {
    const xenon = productosEnPromocion(promo, en("2026-11-15")).find((p) => p.nombre === "SYNTURO XENON 5W30 4X5 GL")!;
    expect(xenon).toMatchObject({ pvpConIva: 90.7, precioPromoConIva: 54.42, porcentaje: 40 });
  });
});

describe("el 60 % es sobre el precio de LISTA, no encima del −25 % (Manuel, 6-nov)", () => {
  const promo = POLITICA_DEPOT.promocionDeTemporada;
  const NOV = new Date("2026-11-15T17:00:00Z");

  it("lista $100, hoy $75: 2 × $75 + 2 × $40 = $230", () => {
    const s = segundaLlantaDe(promo, "FALKEN", 4, { hoyConIva: 75, listaConIva: 100 }, NOV)!;
    expect(s).toMatchObject({ precioNormalConIva: 75, precioConIva: 40, totalConIva: 230, ahorroConIva: 70 });
  });

  it("sin lista (o lista menor que hoy) la base es el precio de hoy", () => {
    expect(segundaLlantaDe(promo, "KENDA", 4, { hoyConIva: 75, listaConIva: null }, NOV)?.precioConIva).toBe(30);
    expect(segundaLlantaDe(promo, "KENDA", 4, { hoyConIva: 75, listaConIva: 60 }, NOV)?.precioConIva).toBe(30);
  });

  it("una par nunca sale más cara que el precio de hoy", () => {
    expect(segundaLlantaDe(promo, "KENDA", 2, { hoyConIva: 30, listaConIva: 100 }, NOV)?.precioConIva).toBe(30);
  });
});

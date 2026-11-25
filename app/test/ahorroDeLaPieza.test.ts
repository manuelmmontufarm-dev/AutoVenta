import { describe, expect, it } from "vitest";

/**
 * EL AHORRO QUE DIBUJA LA PIEZA CON BLACK FRIDAY (24-nov-2026). Visto en el
 * simulador con 4 KENDA KR628 265/70R17: la pieza decía «$252.66 ANTES $252.66»
 * y «Ahorra $555.84 en el juego completo». Con la 2.ª llanta al 60 % la línea
 * se firma a la lista (el 60 % REEMPLAZA el −25 %): el ahorro es solo el de las
 * pares, $303.20. El texto del bot ya lo decía bien (domain/ahorro.ts); la
 * pieza sumaba además el −25 % del catálogo, que no se aplica.
 */
process.env.NEGOCIO = "depot";
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";

const { ahorroDeLaCotizacion } = await import("../src/render/depotPosters.js");
const { segundaLlantaDe } = await import("../src/domain/promocionDeTemporada.js");
const { politica } = await import("../src/negocio/politica.js");

const BF_NOV = new Date("2026-11-24T17:00:00Z");
const linea = (extra: Record<string, unknown>) => ({ quantity: 4, unitConIva: 189.5, pvpConIva: 252.66, ...extra }) as never;

describe("el ahorro de la pieza", () => {
  it("regresión: 4 KR628 R17 con Black Friday = $303.20, no $555.84", () => {
    const bf = segundaLlantaDe(politica.promocionDeTemporada, "KENDA", 4, { hoyConIva: 189.5, listaConIva: 252.66 }, BF_NOV);
    expect(bf?.totalConIva).toBe(707.44);
    expect(ahorroDeLaCotizacion(linea({ segundaLlanta: bf }))).toBe(303.2);
  });

  it("sin Black Friday: el −25 % del catálogo, como siempre (4 × $63.16)", () => {
    expect(ahorroDeLaCotizacion(linea({ segundaLlanta: null }))).toBe(252.64);
  });

  it("Black Friday sin lista conocida (base = hoy): cuenta la rebaja del catálogo y el 60 %", () => {
    const bf = segundaLlantaDe(politica.promocionDeTemporada, "KENDA", 4, { hoyConIva: 189.5 }, BF_NOV);
    // Pares a 189.50 × 0.4 = 75.80: (189.50 − 75.80) × 2 = 227.40, más 4 × 63.16 del catálogo.
    expect(ahorroDeLaCotizacion(linea({ segundaLlanta: bf }))).toBe(480.04);
  });
});

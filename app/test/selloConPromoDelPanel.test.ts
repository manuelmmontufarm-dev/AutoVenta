import { describe, expect, it } from "vitest";

/**
 * EL SELLO «−60 % EN CADA 2.ª LLANTA» Y LAS PROMOCIONES DEL PANEL (25-nov-2026).
 * Manuel cargó por Excel un descuento a las Kenda y pidió comprobar opciones,
 * comparativa y cotización. Con un 20 % (Kenda a $50.30, menos que el par con
 * Black Friday) gana la promo del panel y la cotización sale sin la 2.ª llanta,
 * pero la tarjeta de opciones y la comparativa seguían con el sello del Black
 * Friday al lado del −40 %: prometían las dos cosas.
 */
process.env.NEGOCIO = "depot";
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";

const { toPosterLine } = await import("../src/render/quoteImage.js");

const AHORA = new Date("2026-11-25T15:00:00Z");
const kenda = (unitConIva: number) => ({
  code: "K1", brand: "KENDA", design: "KR23", sizeLabel: "205/55R16", loadSpeedLabel: null, loadSpeedTranslation: null,
  quantity: 1, unitConIva, pvpConIva: 83.82, availability: "available" as const, golpesMeses: 12, fabricaAnios: 5,
  photo: { dataUri: "data:image/png;base64,iVBORw0KGgo=", width: 1, height: 1 }, fotoReferencial: false,
});
const sello = (unit: number, cantidad?: number) =>
  Boolean(toPosterLine(kenda(unit) as never, undefined, undefined, { ahora: AHORA, cantidad }).vitrinaSegundaLlanta);

describe("el sello del Black Friday solo va si es lo que el cliente va a pagar", () => {
  it("sin promo del panel (lista −25 %): el sello va, en opciones y en comparativa", () => {
    expect(sello(62.87, 4)).toBe(true);
    expect(sello(62.87)).toBe(true);
    // Con 3 llantas se sigue anunciando (se mide con un par), como antes.
    expect(sello(62.87, 3)).toBe(true);
  });

  it("20 % del panel ($50.30): gana el panel, el sello no va", () => {
    expect(sello(50.3, 4)).toBe(false);
    expect(sello(50.3)).toBe(false);
  });

  it("5 % del panel ($59.73): el juego con Black Friday sigue más barato, el sello va", () => {
    expect(sello(59.73, 4)).toBe(true);
    const linea = toPosterLine(kenda(59.73) as never, undefined, undefined, { ahora: AHORA, cantidad: 4 });
    expect(linea.vitrinaSegundaLlanta?.cuenta?.totalConIva).toBe(234.7);
  });

  it("4x3 del panel (el juego a $47.15 c/u): el sello no va", () => {
    expect(sello(47.15, 4)).toBe(false);
  });

  it("otra marca nunca lo lleva", () => {
    const michelin = { ...kenda(95.07), brand: "MICHELIN", pvpConIva: 126.76 };
    expect(Boolean(toPosterLine(michelin as never, undefined, undefined, { ahora: AHORA, cantidad: 4 }).vitrinaSegundaLlanta)).toBe(false);
  });
});

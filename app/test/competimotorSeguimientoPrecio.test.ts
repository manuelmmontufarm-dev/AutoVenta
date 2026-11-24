/**
 * LOS SEGUIMIENTOS DE COMPETIMOTOR NO REPITEN P1 NI UN PRECIO QUE YA NO VALE
 * (PR #73 «sin precio viejo» × PR #74 «cotizar con P2 + Black Friday»).
 *
 * Con el catálogo de hoy en P2 (o en Black Friday mientras rige):
 *   - una cotización firmada con el Precio A (antes del cambio) es vieja;
 *   - una firmada con Black Friday sigue viva hasta el 30-nov y después es vieja;
 *   - una firmada con P2 antes de que la llanta entrara a Black Friday es vieja
 *     mientras rige la promo (el P2 es el tachado, no lo que paga hoy).
 */
import { describe, expect, it, vi } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

type CatalogItem = import("../src/domain/catalog.js").CatalogItem;
const CATALOGO: CatalogItem[] = [];
vi.mock("../src/services/catalog.js", async (orig) => ({
  ...(await orig<object>()),
  findByCode: (code: string) => CATALOGO.find((i) => i.code === code),
}));

const { politica } = await import("../src/negocio/politica.js");
const { aplicarPreciosEspeciales } = await import("../src/domain/preciosEspeciales.js");
const { preciosDeHoy } = await import("../src/services/precioViejo.js");
const { montosViejosDeLaCotizacion, sinMontosViejos } = await import("../src/domain/precioViejo.js");

// TOWNHALL 185/65R14 TH-161 (A0477), INV_NOV del 20-nov: A $55.20, B $49.45, C $44.85; Black Friday $42.
const townhall = (): CatalogItem => ({
  id: "A0477", code: "A0477", name: "TOWNHALL 185/65R14 TH-161 86H", brand: "TOWNHALL", design: "TH-161", size: null,
  sizeLabel: "185/65R14", price: 49.45 / 1.15, sourcePrice: 55.2, priceTier: "pvp1",
  prices: { pvp1: 55.2, pvp2: null, pvp3: null, pvp4: null }, taxRate: 0.15,
  customerPriceWithTax: 49.45, minimumPriceWithTax: 49.45, distributorPriceWithTax: 49.45,
  stock: 101, availability: "available", imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "archivo",
  preciosPorPago: { tarjetaConIva: 49.45, efectivoConIva: 44.85 },
});
// La Townhall estuvo en Black Friday del 20 al 24-nov (sección «jueves a lunes»);
// desde el 24-nov solo queda el cuadro rojo. `conLaTownhall` es la lista de antes.
const conLaTownhall = { ...politica.preciosEspeciales!, llantas: [{ codigo: "A0477", medida: "185/65R14", precioConIva: 42 }] };
const catalogoEn = (instante: string, lista = politica.preciosEspeciales) => {
  CATALOGO.length = 0;
  CATALOGO.push(townhall());
  aplicarPreciosEspeciales(CATALOGO, lista, new Date(instante));
};
const cotizada = (precio: number) => ({ total: Math.round(precio * 4 * 100) / 100, items: [{ code: "A0477", quantity: 4, salePriceWithTax: precio }] });
const seguimiento = (precio: number) =>
  `Hola, ¿pudo revisar su cotización por 4 TOWNHALL TH-161 — *$${precio.toFixed(2)} c/u*, *$${(precio * 4).toFixed(2)}* total?`;
const limpiar = (precio: number) =>
  sinMontosViejos(seguimiento(precio), montosViejosDeLaCotizacion(cotizada(precio), preciosDeHoy));

describe("seguimientos de Competimotor con P2 y Black Friday", () => {
  it("una cotización firmada con el Precio A ($55.20) no se repite: hoy vale P2", () => {
    catalogoEn("2026-12-02T10:00:00-05:00");
    const { texto, quitados } = limpiar(55.2);
    expect(quitados).toEqual(["$55.20", "$220.80"]);
    expect(texto).not.toMatch(/\$/);
  });

  it("24-nov: la Townhall salió de la promo (solo queda el cuadro rojo): su $42 firmado ya no se repite", () => {
    catalogoEn("2026-11-25T12:00:00-05:00");
    expect(limpiar(49.45).quitados).toEqual([]);
    expect(limpiar(42).quitados).toEqual(["$42.00", "$168.00"]);
  });

  it("después del cierre: P2 sigue viva y el precio Black Friday ya no", () => {
    catalogoEn("2026-12-06T00:00:00-05:00", conLaTownhall);
    expect(limpiar(49.45).quitados).toEqual([]);
    expect(limpiar(42).quitados).toEqual(["$42.00", "$168.00"]);
  });

  it("mientras rige Black Friday: la de Black Friday vive y la firmada a P2 se va (el P2 es el tachado)", () => {
    catalogoEn("2026-11-25T12:00:00-05:00", conLaTownhall);
    expect(limpiar(42).quitados).toEqual([]);
    expect(limpiar(49.45).quitados).toEqual(["$49.45", "$197.80"]);
  });
});

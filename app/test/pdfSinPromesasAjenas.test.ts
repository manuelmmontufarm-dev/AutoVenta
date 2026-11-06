/**
 * El PDF del cotizador no promete lo que el negocio no confirmó.
 *
 * El 6-nov Manuel sacó un PDF del cotizador de Mundillantas y decía «Cobertura
 * por golpes y estalladuras», «5 AÑOS Fábrica» y «Ahorras $0.00 · -0%»: textos
 * fijos de Depot. Mundillantas tiene las garantías en 0 hasta que Jenny las
 * confirme, y sin precio mínimo no hay descuento que mostrar.
 */
import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
process.env.NEGOCIO = "mundillantas";

const quotePdf = await import("../src/services/quotePdf.js");

const llanta = (code: string, precio: number): CatalogItem => ({
  id: code, code, name: `TOWNHALL 265/70R17 ${code}`, brand: "TOWNHALL", design: code,
  size: null, sizeLabel: "265/70R17", price: precio / 1.15, sourcePrice: precio, priceTier: "pvp1",
  prices: { pvp1: precio, pvp2: null, pvp3: null, pvp4: null }, taxRate: 0.15,
  customerPriceWithTax: precio, minimumPriceWithTax: precio, distributorPriceWithTax: precio,
  stock: 8, availability: "available", imageUrl: null, imageSource: null, loadSpeed: null, active: true,
  source: "archivo",
});

describe("PDF de Mundillantas (garantías en 0, sin precio mínimo)", () => {
  it("la cotización: sin golpes, sin «5 años», sin «Ahorras $0.00» ni apóstrofo en «Disponible»", async () => {
    const quote = quotePdf.buildQuote([{
      code: "TH-AT802", description: "TOWNHALL 265/70R17 TH-AT802", quantity: 4, unitPrice: 170 / 1.15,
      brand: "TOWNHALL", design: "TH-AT802", sizeLabel: "265/70R17",
      listPriceWithTax: 170, salePriceWithTax: 170, availability: "available",
    }], "Jenny", "593");
    const doc = JSON.stringify(await quotePdf.documentoDelPdf(quote));
    expect(doc).not.toMatch(/golpes/i);
    expect(doc).not.toContain("5 años");
    expect(doc).not.toContain("Ahorras");
    expect(doc).not.toContain("PRECIO LISTA");
    expect(doc).toContain("Garantía de fábrica por confirmar con el asesor");
    expect(doc).toContain("$680.00");
    expect(doc).not.toMatch(/[✓⚠]/);
    expect((await quotePdf.renderQuotePdf(quote)).length).toBeGreaterThan(1000);
  });

  it("la comparativa: sin «5 AÑOS», sin «MESES» ni «Antes $X · -0%»", async () => {
    const productos = [llanta("TH-AT802", 170), llanta("TH-MT802", 190)];
    const doc = JSON.stringify(quotePdf.comparisonDocument(productos, [null, null]));
    expect(doc).not.toContain("AÑOS");
    expect(doc).not.toContain("MESES");
    expect(doc).not.toContain("Antes");
    expect(doc).not.toMatch(/[✓⚠]/);
    expect((await quotePdf.renderComparisonPdf(productos)).length).toBeGreaterThan(1000);
  });
});

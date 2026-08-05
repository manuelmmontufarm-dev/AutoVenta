import { beforeAll, describe, expect, it } from "vitest";

let ts: typeof import("../src/domain/tireSize.js");
let cat: typeof import("../src/domain/catalog.js");

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test"; process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test"; process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000"; process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  ts = await import("../src/domain/tireSize.js");
  cat = await import("../src/domain/catalog.js");
});

/*
 * Caso real que le costó una venta a Depot (5-ago-2026): el cliente escribió
 * "30x9.5r15", el bot dijo que no había, y el catálogo tenía 20 unidades de la
 * Falken — escrita "30X9.50R15LT". Misma llanta, dos formas de escribirla.
 */
describe("medidas de flotación (pulgadas)", () => {
  it("reconoce como la escribe el cliente", () => {
    for (const escrito of ["30x9.5r15", "30X9.50R15LT", "31x10.5 R15", "30 x 9.5 r 15"]) {
      expect(ts.extractFlotationSizes(escrito).length, escrito).toBe(1);
    }
  });

  it("no confunde un teléfono ni una medida métrica", () => {
    expect(ts.extractFlotationSizes("0993728763")).toHaveLength(0);
    expect(ts.extractFlotationSizes("205/55R16")).toHaveLength(0);
  });

  it("30x9.5 y 30x9.50 son la MISMA medida", () => {
    const a = ts.formatFlotationSize(ts.extractFlotationSizes("30x9.5r15")[0]);
    const b = ts.formatFlotationSize(ts.extractFlotationSizes("30X9.50R15")[0]);
    expect(a).toBe(b);
    expect(a).toBe("30X9.5R15");
  });

  it("los dos SKUs del catálogo colapsan en la misma etiqueta", () => {
    const falken = cat.extractCatalogSizeLabel("30X9.50R15LT 104Q WILDPEAK M/T FALKEN");
    const kenda = cat.extractCatalogSizeLabel("30X9.5R15LT 104Q KR628 6PR TL");
    expect(falken.sizeLabel).toBe(kenda.sizeLabel);
    expect(falken.sizeLabel).toBe("30X9.5R15");
  });

  it("las métricas siguen intactas", () => {
    const m = cat.extractCatalogSizeLabel("205/55R16 91V KOMET PLUS KR203");
    expect(m.sizeLabel).toBe("205/55R16");
    expect(m.size).not.toBeNull();
  });
});

/**
 * BLACK FRIDAY EN LA COTIZACIÓN (sprint 1, 5-nov-2026).
 *
 * La regla de Depot: las llantas PARES Falken/Kenda de la cotización llevan
 * 60 % menos sobre el precio de HOY. 4 × $75 → 2 × $75 + 2 × $30 = $210.
 *
 * Lo que fijan estas pruebas es que TODOS los que dicen una cifra —la
 * cotización firmada, el PDF de respaldo, el texto del chat, la frase del
 * ahorro, la respuesta al «¿y el 60 %?» y el hecho del Guardián— dicen la
 * misma, y que esa cifra es la de `domain/promocionDeTemporada.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";
import type { SegundaLlanta } from "../src/domain/promocionDeTemporada.js";

process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";

type QuotePdf = typeof import("../src/services/quotePdf.js");
type QuoteMessages = typeof import("../src/services/quoteMessages.js");
type Ahorro = typeof import("../src/domain/ahorro.js");
type Promocion = typeof import("../src/domain/promocion.js");
type Temporada = typeof import("../src/domain/promocionDeTemporada.js");
type Directas = typeof import("../src/services/directSalesRoutes.js");
let quotePdf: QuotePdf;
let qm: QuoteMessages;
let ah: Ahorro;
let pr: Promocion;
let t: Temporada;
let directas: Directas;
let taxRate: number;
let promo: NonNullable<import("../src/negocio/politica.js").PoliticaComercial["promocionDeTemporada"]>;

beforeAll(async () => {
  quotePdf = await import("../src/services/quotePdf.js");
  qm = await import("../src/services/quoteMessages.js");
  ah = await import("../src/domain/ahorro.js");
  pr = await import("../src/domain/promocion.js");
  t = await import("../src/domain/promocionDeTemporada.js");
  directas = await import("../src/services/directSalesRoutes.js");
  taxRate = (await import("../src/config.js")).business.taxRate;
  promo = (await import("../src/negocio/politicas/depot.js")).POLITICA_DEPOT.promocionDeTemporada!;
});

// 12:00 en Quito = 17:00 UTC.
const NOV = new Date("2026-11-15T17:00:00Z");
const DIC = new Date("2026-12-01T17:00:00Z");

/** La línea tal cual la arma `generar_cotizacion` (tools.ts). */
function linea(hoy: number, cantidad: number, lista = hoy, marca = "FALKEN", ahora = NOV) {
  return {
    code: "FK1",
    description: `Llanta ${marca} ZE310 205/55R16`,
    quantity: cantidad,
    unitPrice: hoy / (1 + taxRate),
    brand: marca,
    design: "ZE310",
    sizeLabel: "205/55R16",
    listPriceWithTax: lista > hoy ? lista : hoy,
    salePriceWithTax: hoy,
    segundaLlanta: t.segundaLlantaDe(promo, marca, cantidad, hoy, ahora),
  };
}

describe("buildQuote: el total firmado es EXACTAMENTE el de la cuenta de la promo", () => {
  it.each([
    [75, 4], [75, 3], [58.25, 4], [58.25, 3], [77.66, 4], [77.66, 3], [123.45, 4], [123.45, 3],
    [85.12, 4], [69.99, 2], [101.01, 4], [33.33, 3],
  ])("%s × %s", (hoy, cantidad) => {
    const l = linea(hoy, cantidad);
    const s = l.segundaLlanta!;
    const quote = quotePdf.buildQuote([l], "", "593");
    expect(quote.total).toBe(s.totalConIva);
    // La cuenta que se imprime termina en el mismo total, al centavo.
    expect(t.cuentaDeSegundaLlanta(cantidad, s)).toMatch(new RegExp(`= \\$${quote.total.toFixed(2).replace(".", "\\.")}$`));
    // Subtotal + IVA = total, sin centavo perdido.
    expect(Math.round((quote.subtotal + quote.tax) * 100)).toBe(Math.round(quote.total * 100));
  });

  it("4 × $75 = $210, no $300", () => {
    const quote = quotePdf.buildQuote([linea(75, 4, 100)], "", "593");
    expect(quote.total).toBe(210);
  });

  it("sin la promo (otra marca, una llanta, diciembre) el total es el de siempre", () => {
    for (const l of [linea(75, 4, 100, "WINRUN"), linea(75, 1), linea(75, 4, 100, "FALKEN", DIC)]) {
      expect(l.segundaLlanta).toBeNull();
      const quote = quotePdf.buildQuote([l], "", "593");
      const sub = Math.round(l.quantity * l.unitPrice * 100) / 100;
      const iva = Math.round(sub * taxRate * 100) / 100;
      expect(quote.total).toBe(Math.round((sub + iva) * 100) / 100);
    }
  });

  it("el descuento extra del asesor se resta sobre el total con la promo", () => {
    const quote = quotePdf.buildQuote([linea(75, 4, 100)], "", "593", { amount: 10, reason: "r", condition: "c" });
    expect(quote.originalTotal).toBe(210);
    expect(quote.total).toBe(200);
  });
});

describe("el PDF de respaldo muestra el desglose y el ahorro", () => {
  it("una línea: «2 × $75.00 + 2 × $30.00 (−60 % en la 2.ª llanta · Black Friday)» y el total $210", async () => {
    const quote = quotePdf.buildQuote([linea(75, 4, 100)], "Ana", "593");
    const doc = JSON.stringify(await quotePdf.documentoDelPdf(quote));
    expect(doc).toContain("2 × $75.00 + 2 × $30.00 (−60 % en la 2.ª llanta · Black Friday)");
    expect(doc).toContain("Black Friday: ahorras $90.00 más");
    expect(doc).toContain("$210.00");
    expect(doc).not.toContain("precio de 3");
    // Y se dibuja de verdad, sin tirar.
    expect((await quotePdf.renderQuotePdf(quote)).length).toBeGreaterThan(1000);
  });

  it("el formato de varias líneas también: desglose, total de la línea y el ahorro", async () => {
    const quote = quotePdf.buildQuote([linea(75, 4, 100), { ...linea(80, 1, 80, "WINRUN"), code: "W1" }], "", "593");
    expect(quote.total).toBe(Math.round((210 + 80) * 100) / 100);
    const doc = JSON.stringify(await quotePdf.documentoDelPdf(quote));
    expect(doc).toContain("2 × $75.00 + 2 × $30.00 (−60 % en la 2.ª llanta · Black Friday)");
    expect(doc).toContain(`$${(Math.round(210 / (1 + taxRate) * 100) / 100).toFixed(2)}`);
    expect(doc).toContain("BLACK FRIDAY: −$90.00 CON IVA EN LA 2.ª LLANTA");
  });
});

describe("el ahorro de la cotización suma la promo", () => {
  const items = () => [linea(75, 4, 100)];

  it("catálogo $100 + Black Friday $90 = $190", () => {
    const a = ah.ahorroDeLaCotizacion(items())!;
    expect(a.monto).toBe(190);
    expect(a.montoCatalogo).toBe(100);
    expect(a.segundaLlanta?.ahorroConIva).toBe(90);
    expect(a.porcentaje).toBe(25);
  });

  it("sin rebaja de catálogo igual hay ahorro: el del 60 %", () => {
    const a = ah.ahorroDeLaCotizacion([linea(75, 4)])!;
    expect(a).not.toBeNull();
    expect(a.monto).toBe(90);
    expect(ah.fraseDeAhorro(a)).toBe(
      "*Black Friday*: 60 % menos en su 2.ª y 4.ª llanta — 2 a *$75.00* y 2 a *$30.00*, *$90.00* menos",
    );
  });

  it("con rebaja de catálogo la frase dice las dos y el total", () => {
    const a = ah.ahorroDeLaCotizacion(items())!;
    expect(ah.fraseDeAhorro(a)).toBe(
      "*Black Friday*: 60 % menos en su 2.ª y 4.ª llanta — 2 a *$75.00* y 2 a *$30.00*, *$90.00* menos, "
      + "además del *25 %* de descuento ya aplicado — en total *$190.00* menos",
    );
  });

  it("3 llantas: solo la 2.ª lleva el 60 %", () => {
    const a = ah.ahorroDeLaCotizacion([linea(77.66, 3)])!;
    expect(ah.fraseDeAhorro(a)).toBe(
      "*Black Friday*: 60 % menos en su 2.ª llanta — 2 a *$77.66* y 1 a *$31.06*, *$46.60* menos",
    );
  });

  it("lee la promo del JSON guardado en `quotes.items` (ida y vuelta)", () => {
    const guardado = JSON.parse(JSON.stringify(items()));
    expect(ah.ahorroDeLaCotizacion(guardado)?.monto).toBe(190);
  });

  it("con el 4x3 encendido gana el Black Friday: no se apilan rótulos", () => {
    const a = { ...ah.ahorroDeLaCotizacion(items())!, modo: "3x4" as const };
    expect(ah.fraseDeAhorro(a)).not.toMatch(/4x3|precio de 3/);
    expect(ah.respuestaDelDescuento(a, "¿la promo 3x4 ya está?")).not.toMatch(/4x3|precio de 3/);
    expect(pr.hechoDelAhorro(a, "3x4")).not.toMatch(/se presenta como 4x3 \(/);
  });

  it("la pregunta de visita lleva la frase del Black Friday", () => {
    const q = qm.buildVisitPlanQuestion({
      conDescuentoAutorizado: false,
      locales: ["Cumbayá", "Quito Sur"],
      localElegido: "Cumbayá",
      ahorro: ah.ahorroDeLaCotizacion(items()),
      enlaces: false,
    });
    expect(q).toContain("2 a *$75.00* y 2 a *$30.00*, *$90.00* menos");
  });
});

describe("«el 60 %» y «la segunda a $30» se confirman, no se aclaran", () => {
  const ahorro = () => ah.ahorroDeLaCotizacion([linea(75, 4, 100)])!;

  it.each([
    "el 60%?",
    "o sea la segunda a $30",
    "la 2da a 30?",
    "el 60% son 90 menos",
    "la primera a 75 y la segunda a 30",
    "y el black friday ya está aplicado?",
    "el 25% de descuento y el 60% en la segunda",
  ])("%s → «Así es»", (texto) => {
    expect(ah.hablaDelDescuento(texto)).toBe(true);
    const r = ah.respuestaDelDescuento(ahorro(), texto);
    expect(r).toMatch(/^Así es/);
    expect(r).toContain("*60 %* menos en su 2.ª y 4.ª llanta — 2 a *$75.00* y 2 a *$30.00*, *$90.00* menos");
    expect(r).toContain("*$210.00*");
    expect(ah.respondeElDescuento(r, ahorro())).toBe(true);
  });

  it("llamar descuento al precio de hoy se aclara", () => {
    expect(ah.respuestaDelDescuento(ahorro(), "la promo son 75 menos")).toMatch(
      /^Le aclaro: \*\$75\.00\* es el precio de hoy por llanta, el que pagan la 1\.ª y 3\.ª; la 2\.ª y 4\.ª van a \*\$30\.00\*/,
    );
  });

  it("el total a pagar se aclara", () => {
    expect(ah.respuestaDelDescuento(ahorro(), "el descuento son 210?")).toMatch(/^Le aclaro: \*\$210\.00\* es el total a pagar/);
  });

  it("otro porcentaje se aclara", () => {
    expect(ah.respuestaDelDescuento(ahorro(), "el 50% de descuento?")).toMatch(/^Le aclaro:/);
  });

  it("el IVA no es el descuento", () => {
    expect(ah.hablaDelDescuento("el precio incluye el 15% de IVA?")).toBe(false);
  });

  it("«la 2da» y «las 4 llantas» no son plata", () => {
    expect(ah.cifrasDelCliente("la 2da a $30")).toEqual({ montos: [30], porcentajes: [] });
    expect(ah.cifrasDelCliente("las 4 llantas a 210")).toEqual({ montos: [210], porcentajes: [] });
    expect(ah.cifrasDelCliente("la 2.ª a 30 y la 4ta también")).toEqual({ montos: [30], porcentajes: [] });
  });

  it("sin la promo, las respuestas de siempre no cambian", () => {
    const a = ah.ahorroDeLaCotizacion([linea(75, 4, 100, "WINRUN")])!;
    expect(a.segundaLlanta).toBeUndefined();
    expect(a.monto).toBe(100);
    expect(ah.respuestaDelDescuento(a, "La promoción del 25% q son 100 menos")).toMatch(/^Así es: su cotización ya trae el \*25 %\*/);
  });
});

describe("el Guardián tiene las cifras en sus hechos", () => {
  it("60 %, la par a $30, la cuenta, $90 de la promo, $190 en total y $210 a pagar", () => {
    const a = ah.ahorroDeLaCotizacion([linea(75, 4, 100)])!;
    const hecho = pr.hechoDeLaPromocion(a, "porcentaje")!;
    for (const cifra of ["60 %", "2.ª y 4.ª", "2 × $75.00 + 2 × $30.00 = $210.00", "$30.00", "$45.00", "$90.00", "$190.00", "25 %", "$25.00"]) {
      expect(hecho).toContain(cifra);
    }
    expect(hecho).toMatch(/NO es error/);
    expect(hecho).toMatch(/precio_incorrecto/);
  });
});

describe("el texto del chat cuando la foto no salió", () => {
  const product = {
    id: "FK1", code: "FK1", name: "LLANTA 205/55R16 FALKEN ZE310", brand: "FALKEN", design: "ZE310",
    size: { width: 205, aspect: 55, rim: 16 }, sizeLabel: "205/55R16",
    price: 65.22, sourcePrice: 65.22, priceTier: "pvp1", prices: { pvp1: 65.22, pvp2: null, pvp3: null, pvp4: null },
    taxRate: 0.15, customerPriceWithTax: 100, minimumPriceWithTax: 75, distributorPriceWithTax: 70,
    stock: 8, availability: "available", imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  } satisfies CatalogItem;

  it("trae la cuenta de la promo y el total con la promo, aunque el 4x3 esté encendido", () => {
    const l = linea(75, 4, 100);
    const quote = quotePdf.buildQuote([l], "", "593");
    const texto = qm.buildSingleQuoteMessageDetallado(
      { product, quantity: 4 }, "",
      undefined,
      { unitarioConIva: 75, listaConIva: 100, total: quote.total, segundaLlanta: l.segundaLlanta as SegundaLlanta },
      "3x4",
    );
    expect(texto).toContain("💰 $75.00 c/u (antes $100.00, −25%)");
    expect(texto).toContain("🖤 Black Friday: −60 % en su 2.ª y 4.ª llanta → 2 × $75.00 + 2 × $30.00 = $210.00 ($90.00 menos)");
    expect(texto).toContain("🛞 4 llantas: $210.00");
    expect(texto).not.toMatch(/4x3/);
  });
});

describe("la cotización reenviada recalcula la promo con la fecha de HOY", () => {
  const guardada = () => JSON.parse(JSON.stringify(linea(75, 4, 100)));
  const totales = () => {
    const q = quotePdf.buildQuote([linea(75, 4, 100)], "", "593");
    return { subtotal: q.subtotal, tax: q.tax, total: q.total };
  };

  it("en noviembre: la misma promo y los mismos totales, al centavo", () => {
    const r = directas.reenvioConPromoDeHoy(guardada(), totales(), NOV);
    expect(r.segundaLlanta?.totalConIva).toBe(210);
    expect(r).toMatchObject(totales());
  });

  it("el 1-dic se cae la promo y el total vuelve al de las 4 a precio de hoy", () => {
    const r = directas.reenvioConPromoDeHoy(guardada(), totales(), DIC);
    expect(r.segundaLlanta).toBeNull();
    expect(r.total).toBe(300);
    expect(Math.round((r.subtotal + r.tax) * 100)).toBe(30000);
  });

  it("conserva el descuento del asesor al recalcular", () => {
    const conAsesor = { ...totales(), total: 200 };
    expect(directas.reenvioConPromoDeHoy(guardada(), conAsesor, DIC).total).toBe(290);
  });
});

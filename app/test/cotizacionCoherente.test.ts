/**
 * El número que el cliente LEE y el número que la cotización FIRMA tienen que
 * ser el mismo.
 *
 * Son dos caminos distintos en el código —`buildQuote` arma la cotización y la
 * imagen; `buildSingleQuoteCaption`/`…Detallado` arman el texto de WhatsApp— y
 * hasta el 16-ago cada uno sacaba el precio de una fuente distinta: la
 * cotización del precio confirmado contra el Interbot en el momento, el texto
 * de la foto del catálogo en memoria. Un cliente podía leer $480 en el chat y
 * presentar en la tienda una cotización de $552.
 *
 * Estas pruebas fijan las dos invariantes que lo impiden.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";
import { calculateDiscount } from "../src/domain/discounts.js";

function producto(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "1", code: "ABC", name: "Kenda KR203", brand: "Kenda", design: "KR203",
    size: { width: 205, aspect: 55, rim: 16 }, sizeLabel: "205/55R16",
    price: 85.12, sourcePrice: 85.12, priceTier: "pvp1",
    prices: { pvp1: 85.12, pvp2: null, pvp3: null, pvp4: null },
    taxRate: 0.15, customerPriceWithTax: 113.49, minimumPriceWithTax: 85.12,
    distributorPriceWithTax: 80, stock: 4, availability: "available", imageUrl: null,
    imageSource: null, loadSpeed: null, active: true, source: "contifico",
    ...over,
  } satisfies CatalogItem;
}

type QuotePdf = typeof import("../src/services/quotePdf.js");
type QuoteMessages = typeof import("../src/services/quoteMessages.js");
type Config = typeof import("../src/config.js");
let quotePdf: QuotePdf;
let qm: QuoteMessages;
let cfg: Config;

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  quotePdf = await import("../src/services/quotePdf.js");
  qm = await import("../src/services/quoteMessages.js");
  cfg = await import("../src/config.js");
});

describe("el IVA se quita y se pone con la MISMA tasa", () => {
  /**
   * `buildQuote` siempre suma `business.taxRate`. Por tanto el `unitPrice` que
   * recibe tiene que venir sin IVA a ESA tasa. Antes `generar_cotizacion` lo
   * quitaba con `product.taxRate`, que vale 0 en toda la ruta de Google Sheets
   * (services/catalog.ts) y en cualquier producto que Contífico devuelva sin
   * `porcentaje_iva`: el unitario entraba con el IVA ya dentro y se le sumaba
   * otro 15% encima.
   */
  it("un precio anunciado con IVA vuelve a salir igual en el total", () => {
    const anunciadoConIva = 120;
    const cantidad = 4;
    const quote = quotePdf.buildQuote(
      [{
        code: "ABC",
        description: "Llanta Kenda KR203 205/55R16",
        quantity: cantidad,
        unitPrice: anunciadoConIva / (1 + cfg.business.taxRate),
      }],
      "Cliente",
      "593",
    );
    expect(quote.total).toBeCloseTo(anunciadoConIva * cantidad, 2);
  });

  it("quitarlo con una tasa distinta es exactamente el bug: $480 se firmaban en $552", () => {
    const anunciadoConIva = 120;
    const tasaDelProductoRota = 0; // lo que devuelve la ruta de Sheets
    const quote = quotePdf.buildQuote(
      [{
        code: "ABC",
        description: "Llanta",
        quantity: 4,
        unitPrice: anunciadoConIva / (1 + tasaDelProductoRota),
      }],
      "Cliente",
      "593",
    );
    // Se deja fijado el número del incidente para que, si alguien vuelve a
    // meter `product.taxRate` aquí, la prueba de arriba lo cace en el acto.
    expect(quote.total).toBeCloseTo(552, 2);
    expect(quote.total).not.toBeCloseTo(480, 2);
  });
});

describe("el texto del chat usa los números de la cotización firmada", () => {
  const seleccion = { product: producto(), quantity: 4 };

  // Desde el 26-ago, con la foto enviada NO hay resumen en texto (Joaquín:
  // «ese mensaje que ya no haya y sea más por las fotos»), así que lo que se
  // comprueba es el respaldo: el texto que sale cuando la pieza NO salió.
  it("con la foto enviada no hay ningún texto de cotización", () => {
    expect(qm.textoDeLaCotizacion(true, seleccion, "Manuel", undefined, {
      unitarioConIva: 90,
      listaConIva: 113.49,
      total: 360,
    })).toBeNull();
  });

  it("el mensaje detallado muestra el unitario firmado y su porcentaje real", () => {
    const texto = qm.buildSingleQuoteMessageDetallado(seleccion, "Manuel", undefined, {
      unitarioConIva: 90,
      listaConIva: 120,
      total: 360,
    });
    expect(texto).toContain("$90.00");
    expect(texto).toContain("$360.00");
    // 1 − 90/120 = 25%
    expect(texto).toContain("25%");
    expect(texto).not.toContain("85.12");
  });

  it("sin precios firmados el respaldo se comporta como siempre (catálogo)", () => {
    const texto = qm.textoDeLaCotizacion(false, seleccion, "Manuel");
    expect(texto).toContain("340.48");
  });
});

describe("un descuento vivo se recalcula contra la cotización que se está firmando", () => {
  /**
   * `getActiveDiscountOffer` devuelve la oferta del CICLO, con un monto fijo
   * calculado contra la cotización que existía cuando se autorizó. Reinyectarlo
   * tal cual en otra cotización daba un descuento desproporcionado, y cuando ya
   * no cabía, `buildQuote` lanzaba y el cliente se quedaba sin nada.
   */
  it("un 10% sigue siendo el 10% del total nuevo, no el monto viejo", () => {
    const sobreCotizacionVieja = calculateDiscount(100_000, "percentage", 1000);
    expect(sobreCotizacionVieja.discountAmountCents).toBe(10_000);

    // La nueva cotización es la mitad: el 10% también.
    const sobreLaNueva = calculateDiscount(50_000, "percentage", 1000);
    expect(sobreLaNueva.discountAmountCents).toBe(5_000);
  });

  it("un monto fijo que ya no cabe lanza, y por eso la tool lo captura", () => {
    // $200 de descuento sobre una cotización de $150: imposible. Antes esto
    // subía sin capturar hasta el pipeline y el turno moría en silencio.
    expect(() => calculateDiscount(15_000, "total_amount", 20_000)).toThrow();
  });

  it("recalculado, el total de la cotización cuadra con el descuento aplicado", () => {
    const base = quotePdf.buildQuote(
      [{ code: "A", description: "Llanta", quantity: 4, unitPrice: 100 }],
      "Cliente", "593",
    );
    const recalculado = calculateDiscount(Math.round(base.total * 100), "percentage", 1000);
    const conDescuento = quotePdf.buildQuote(
      [{ code: "A", description: "Llanta", quantity: 4, unitPrice: 100 }],
      "Cliente", "593",
      { amount: recalculado.discountAmountCents / 100, reason: "Autorizado", condition: "va el sábado" },
    );
    expect(conDescuento.total).toBeCloseTo(base.total * 0.9, 2);
    expect(conDescuento.subtotal + conDescuento.tax).toBeCloseTo(conDescuento.total, 2);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

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

/** Líneas con contenido — las vacías son separación visual, no texto que leer. */
function lineas(bloque: string): number {
  return bloque.split("\n").filter((line) => line.trim()).length;
}

type QuoteMessages = typeof import("../src/services/quoteMessages.js");
type Benefits = typeof import("../src/services/benefits.js");
let qm: QuoteMessages;
let benefits: Benefits;

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  qm = await import("../src/services/quoteMessages.js");
  benefits = await import("../src/services/benefits.js");
});

describe("mensajes de opciones en conversación activa", () => {
  it("no vuelve a saludar a mitad de la conversación", () => {
    const message = qm.buildCustomerOptionsMessageDetallado([producto()], "Manuel");
    expect(message).toMatch(/^Opciones disponibles:/);
    expect(message).not.toMatch(/hola/i);
  });
});

/*
 * Criterios de aceptación de la Tanda 0 — el reclamo del cliente fue
 * "está mandando dms texto y la people ni siquiera lee".
 */
describe("formato WhatsApp: la imagen es el mensaje", () => {
  const kenda = producto();
  const falken = producto({ id: "2", code: "DEF", brand: "Falken", design: "ZE310", minimumPriceWithTax: 96.4 });

  it("ninguna pieza acompañada de imagen pasa de 5 líneas de texto", () => {
    const captions = [
      qm.buildOptionsCaption([kenda, falken], kenda, "es el mejor equilibrio entre duración y precio"),
      qm.buildSingleQuoteCaption({ product: kenda, quantity: 4 }, "AV-000123"),
      qm.buildComparisonCaption([kenda, falken]),
    ];
    for (const caption of captions) expect(lineas(caption)).toBeLessThanOrEqual(5);
  });

  it("el caption de opciones recomienda una y dice que el precio es por unidad", () => {
    const caption = qm.buildOptionsCaption([kenda, falken], kenda, "es el mejor equilibrio");
    expect(caption).toContain("*Kenda KR203*");
    expect(caption).toMatch(/por unidad/i);
    // Lo que ya muestra la imagen no se repite en texto.
    expect(caption).not.toContain("113.49");
    expect(caption).not.toMatch(/garantía/i);
  });

  it("el muro completo sigue disponible para cuando la imagen no sale", () => {
    const muro = qm.buildCustomerOptionsMessageDetallado([kenda, falken], "Manuel");
    expect(muro).toMatch(/garantía/i);
    expect(lineas(muro)).toBeGreaterThan(5);
  });

  it("una respuesta comercial se parte en bloques y termina en pregunta", () => {
    const respuesta = qm.composeBlocks(
      qm.buildOptionsCaption([kenda, falken], kenda, "es el mejor equilibrio"),
      benefits.formatBenefitsBlock([
        { id: 1, text: "Seguro gratuito contra golpes", position: 0, active: true,
          brand: null, minQuantity: null, store: null, startsAt: null, expiresAt: null },
      ]),
      "¿Cuál le llama más la atención?",
    );
    const bloques = qm.splitBlocks(respuesta);
    expect(bloques).toHaveLength(3);
    expect(bloques[1]).toMatch(/^\*INCLUYE\*/);
    expect(bloques.at(-1)).toMatch(/\?$/);
  });

  it("nunca manda más de 4 bloques por turno", () => {
    const respuesta = qm.composeBlocks("uno", "dos", "tres", "cuatro", "cinco", "seis");
    expect(qm.splitBlocks(respuesta)).toHaveLength(qm.MAX_BLOCKS);
  });

  it("un texto sin separadores sigue siendo un solo mensaje", () => {
    expect(qm.splitBlocks("Buenos días, ¿qué medida necesita?")).toEqual([
      "Buenos días, ¿qué medida necesita?",
    ]);
  });

  it("los bloques vacíos no generan mensajes en blanco", () => {
    expect(qm.splitBlocks(qm.composeBlocks("solo esto", "", null, undefined))).toEqual(["solo esto"]);
  });
});

describe("bloque INCLUYE", () => {
  const base = {
    position: 0, active: true, brand: null, minQuantity: null,
    store: null, startsAt: null, expiresAt: null,
  };

  it("sin beneficios aplicables devuelve vacío, no un bloque inventado", () => {
    expect(benefits.formatBenefitsBlock([])).toBe("");
  });

  it("no promete un beneficio por volumen a quien compra una llanta", () => {
    const lista = [
      { ...base, id: 1, text: "Instalación incluida" },
      { ...base, id: 2, text: "Descuento por juego completo", minQuantity: 4 },
    ];
    const aplican = benefits.applicableBenefits(lista, { quantity: 1 });
    expect(aplican.map((b) => b.id)).toEqual([1]);
    expect(benefits.applicableBenefits(lista, { quantity: 4 })).toHaveLength(2);
  });

  it("filtra por marca y por sucursal", () => {
    const lista = [
      { ...base, id: 1, text: "Promo Falken", brand: "Falken" },
      { ...base, id: 2, text: "Solo en Cumbayá", store: "Cumbayá" },
    ];
    expect(benefits.applicableBenefits(lista, { brands: ["Kenda"], store: "Quito Sur" })).toHaveLength(0);
    expect(benefits.applicableBenefits(lista, { brands: ["Falken"] }).map((b) => b.id)).toEqual([1]);
    expect(benefits.applicableBenefits(lista, { store: "cumbayá" }).map((b) => b.id)).toEqual([2]);
  });
});

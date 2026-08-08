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
 * La pregunta por el día cierra la cotización y la ubicación. Un "sí me
 * interesa" no se puede agendar; un día sí, y es lo que convierte la última
 * columna del kanban en una lista de trabajo.
 */
describe("pregunta por el día de la visita", () => {
  it("pide una fecha concreta en los dos casos", () => {
    expect(qm.buildVisitDayQuestion(true)).toMatch(/qué día/i);
    expect(qm.buildVisitDayQuestion(false)).toMatch(/qué día/i);
  });

  /*
   * El descuento es el motivo SIEMPRE, porque siempre es verdad: la cotización
   * sale con precio rebajado y su número es lo que la tienda exige para
   * respetarlo. Lo que cambia es cuál descuento se nombra.
   */
  it("da el descuento como motivo en los dos casos", () => {
    expect(qm.buildVisitDayQuestion(true)).toMatch(/descuento/i);
    expect(qm.buildVisitDayQuestion(false)).toMatch(/descuento/i);
  });

  it("solo llama «extra» al descuento cuando hay uno autorizado", () => {
    // Prometer un descuento extra que nadie autorizó sigue prohibido: sin
    // oferta viva el motivo se ancla en el número de cotización.
    expect(qm.buildVisitDayQuestion(true)).toMatch(/extra/i);
    expect(qm.buildVisitDayQuestion(false)).not.toMatch(/extra/i);
    expect(qm.buildVisitDayQuestion(false)).toMatch(/cotización/i);
  });
});

/*
 * Después de la cotización el objetivo del bot son dos datos, no uno. Una fecha
 * sin local no se le puede avisar a nadie y un local sin fecha no entra en
 * ninguna agenda, así que la pregunta va junta o no sirve.
 */
describe("pregunta por fecha y local", () => {
  const locales = ["Cumbayá", "Quito Sur"];

  it("pide el día y el local en la misma pregunta", () => {
    const pregunta = qm.buildVisitPlanQuestion({ conDescuentoAutorizado: false, locales });
    expect(pregunta).toMatch(/qué día/i);
    expect(pregunta).toMatch(/local/i);
    expect(pregunta).toMatch(/Cumbayá/);
    expect(pregunta).toMatch(/Quito Sur/);
  });

  it("usa el descuento como motivo para que conteste", () => {
    expect(qm.buildVisitPlanQuestion({ conDescuentoAutorizado: false, locales }))
      .toMatch(/descuento/i);
    expect(qm.buildVisitPlanQuestion({ conDescuentoAutorizado: true, locales }))
      .toMatch(/descuento extra/i);
  });

  it("sigue siendo una pregunta legible sin locales configurados", () => {
    const pregunta = qm.buildVisitPlanQuestion({ conDescuentoAutorizado: false, locales: [] });
    expect(pregunta).toMatch(/qué día/i);
    expect(pregunta).not.toMatch(/¿\s*\?/);
    expect(lineas(pregunta)).toBe(1);
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
      qm.buildSingleQuoteCaption({ product: kenda, quantity: 4 }, "AV-000123"),
      qm.buildComparisonCaption([kenda, falken]),
    ];
    for (const caption of captions) expect(lineas(caption)).toBeLessThanOrEqual(5);
  });

  // Joaquín, 6-ago, viendo un chat real: «este mensaje le quitaría porque se
  // vuelve una cadena muy larga y los mijines ya no leen». El preámbulo con la
  // recomendación desapareció; el turno cierra ofreciéndola.
  it("las opciones cierran ofreciendo la recomendación, sin adelantarla", () => {
    expect(qm.PREGUNTA_RECOMENDACION).toBe("¿Necesita alguna recomendación?");
    expect(lineas(qm.PREGUNTA_RECOMENDACION)).toBe(1);
  });

  it("el muro completo sigue disponible para cuando la imagen no sale", () => {
    const muro = qm.buildCustomerOptionsMessageDetallado([kenda, falken], "Manuel");
    expect(muro).toMatch(/garantía/i);
    expect(lineas(muro)).toBeGreaterThan(5);
  });

  it("con la imagen enviada el turno son 2 bloques: INCLUYE y la pregunta", () => {
    const respuesta = qm.composeBlocks(
      null, // el caption de presentación ya no existe
      benefits.formatBenefitsBlock([
        { id: 1, text: "Seguro gratuito contra golpes", position: 0, active: true,
          brand: null, minQuantity: null, store: null, startsAt: null, expiresAt: null },
      ]),
      qm.PREGUNTA_RECOMENDACION,
    );
    const bloques = qm.splitBlocks(respuesta);
    expect(bloques).toHaveLength(2);
    expect(bloques[0]).toMatch(/^\*INCLUYE\*/);
    expect(bloques.at(-1)).toBe(qm.PREGUNTA_RECOMENDACION);
    // Nada de la cadena vieja: ni «Yo iría por», ni precios repetidos.
    expect(respuesta).not.toMatch(/yo ir[íi]a/i);
    expect(respuesta).not.toContain("113.49");
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

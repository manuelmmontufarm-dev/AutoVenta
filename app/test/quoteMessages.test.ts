import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

describe("mensajes de opciones en conversación activa", () => {
  it("no vuelve a saludar a mitad de la conversación", async () => {
    process.env.WHATSAPP_TOKEN ||= "test";
    process.env.WHATSAPP_APP_SECRET ||= "test";
    process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
    process.env.WHATSAPP_PHONE_ID ||= "test";
    process.env.SELLER_PHONE ||= "593000000000";
    process.env.OPENAI_API_KEY ||= "test";
    process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
    const { buildCustomerOptionsMessage } = await import("../src/services/quoteMessages.js");
    const product = {
      id: "1", code: "ABC", name: "Kenda KR203", brand: "Kenda", design: "KR203",
      size: { width: 205, aspect: 55, rim: 16 }, sizeLabel: "205/55R16",
      price: 85.12, sourcePrice: 85.12, priceTier: "pvp1", prices: { pvp1: 85.12, pvp2: null, pvp3: null, pvp4: null },
      taxRate: 0.15, customerPriceWithTax: 113.49, minimumPriceWithTax: 85.12,
      distributorPriceWithTax: 80, stock: 4, availability: "available", imageUrl: null,
      imageSource: null, loadSpeed: null, active: true, source: "contifico",
    } satisfies CatalogItem;
    const message = buildCustomerOptionsMessage([product], "Manuel");
    expect(message).toMatch(/^Opciones disponibles:/);
    expect(message).not.toMatch(/hola/i);
  });
});

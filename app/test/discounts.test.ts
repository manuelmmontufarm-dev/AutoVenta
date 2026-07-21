import { describe, expect, it } from "vitest";
import {
  buildDiscountCustomerMessage,
  calculateDiscount,
  detectManualDiscount,
} from "../src/domain/discounts.js";

describe("Descuentos comerciales estructurados", () => {
  it("calcula un monto total sin alterar el precio base", () => {
    expect(calculateDiscount(50_000, "total_amount", 2_000)).toEqual({
      baseTotalCents: 50_000,
      discountAmountCents: 2_000,
      finalTotalCents: 48_000,
    });
  });

  it("detecta porcentaje, monto y precio final escritos por un asesor", () => {
    expect(detectManualDiscount("Te ofrezco 10% de descuento si vienes el sábado")).toMatchObject({
      kind: "percentage", valueCents: 1000, condition: "vienes el sabado",
    });
    expect(detectManualDiscount("Hay un descuento de $20 si va esta semana")).toMatchObject({
      kind: "total_amount", valueCents: 2000,
    });
    expect(detectManualDiscount("Con la oferta te la dejo en $400 si confirmas hoy")).toMatchObject({
      kind: "final_price", valueCents: 40000,
    });
    expect(detectManualDiscount("La medida es 205/55 R16 e incluye IVA 15%")).toBeNull();
    expect(detectManualDiscount("5% si recoge esta semana")).toMatchObject({
      kind: "percentage", valueCents: 500, condition: "recoge esta semana",
    });
  });

  it("muestra el porcentaje y el ahorro exacto en el mensaje", () => {
    const text = buildDiscountCustomerMessage({
      discountAmountCents: 2125, finalTotalCents: 40375,
      percentage: 5, condition: "recoge esta semana",
    });
    expect(text).toContain("5% ($21.25)");
    expect(text).toContain("$403.75");
  });

  it("genera un mensaje breve con valores determinísticos", () => {
    const text = buildDiscountCustomerMessage({
      quoteNumber: "COT-10-D3", discountAmountCents: 2000,
      finalTotalCents: 48000, condition: "vienes el sábado",
    });
    expect(text).toContain("$20.00");
    expect(text).toContain("$480.00");
    expect(text).toContain("si vienes el sábado");
  });

  it("proyecta el mismo descuento en los totales de la cotización", async () => {
    process.env.WHATSAPP_TOKEN ||= "test";
    process.env.WHATSAPP_APP_SECRET ||= "test";
    process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
    process.env.WHATSAPP_PHONE_ID ||= "test";
    process.env.SELLER_PHONE ||= "593000000000";
    process.env.OPENAI_API_KEY ||= "test";
    process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
    const { buildQuote } = await import("../src/services/quotePdf.js");
    const quote = buildQuote(
      [{ code: "A", description: "Llanta", quantity: 4, unitPrice: 100 }],
      "Cliente", "593", { amount: 20, reason: "Autorizado", condition: "va el sábado" },
    );
    expect(quote.originalTotal).toBe(460);
    expect(quote.discountAmount).toBe(20);
    expect(quote.total).toBe(440);
    expect(quote.subtotal + quote.tax).toBe(440);
  });
});

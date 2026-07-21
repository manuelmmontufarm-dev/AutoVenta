import { describe, expect, it } from "vitest";
import { buildContextualFollowUpMessage, inferProductCode } from "../src/domain/followUpMessages.js";

describe("Redacción contextual de seguimientos", () => {
  it("genera intentos distintos, breves y humanos para una cotización", () => {
    const context = {
      name: "Luca van Goor",
      stage: "cotizacion_enviada" as const,
      tireSize: "215/65R16",
      quoteNumber: "COT-1042",
    };
    const first = buildContextualFollowUpMessage(context, "in_window_first");
    const second = buildContextualFollowUpMessage(context, "in_window_second");
    expect(first).not.toBe(second);
    expect(first).toContain("📄");
    expect(first).toContain("COT-1042");
    expect(second).toContain("🛞");
    expect(first.toLowerCase()).not.toMatch(/^hola/);
  });

  it("retoma compromisos reales sin fabricar una fecha", () => {
    const message = buildContextualFollowUpMessage({
      stage: "seguimiento_venta",
      customerCommitment: "voy esta semana",
      nearestStore: "Depot Tire El Inca",
    }, "in_window_second");
    expect(message).toContain("voy esta semana");
    expect(message).toContain("Depot Tire El Inca");
    expect(message).not.toMatch(/lunes|martes|miércoles|jueves|viernes|sábado|domingo/i);
  });

  it("solo menciona el descuento autorizado con sus valores exactos", () => {
    const message = buildContextualFollowUpMessage({
      stage: "cotizacion_enviada",
      activeDiscountAmount: 20,
      activeDiscountFinalTotal: 440,
      activeDiscountCondition: "va el sábado",
    }, "in_window_first");
    expect(message).toContain("$20.00");
    expect(message).toContain("$440.00");
    expect(message).toContain("va el sábado");
  });

  it("reconoce el modelo que un asesor escribió manualmente", () => {
    expect(inferProductCode("QUE SI QUIERES LAS R380")).toBe("R380");
    expect(inferProductCode("la medida es R16")).toBeNull();
  });
});

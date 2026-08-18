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

  /*
   * Chat de +593 99 874 7699 (18-ago). El cliente contestó «al sur» y «el
   * viernes por favor», quedó registrado —y los dos seguimientos siguientes le
   * citaron su propia frase para volver a preguntarle el día. Con el día y el
   * local en la mano no queda ninguna pregunta que hacer.
   */
  describe("visita ya agendada (chat 99 874 7699)", () => {
    const AHORA = new Date("2026-08-18T14:00:00.000Z"); // martes 09:00 en Guayaquil
    const VIERNES = new Date("2026-08-21T15:00:00.000Z");
    const contexto = {
      stage: "seguimiento_venta" as const,
      customerCommitment: "el viernes por favor",
      nearestStore: "Depot Tire Quito Sur",
      visitDate: VIERNES,
    };

    it("no vuelve a preguntar el día ni el local en ninguno de los dos intentos", () => {
      for (const kind of ["in_window_first", "in_window_second"] as const) {
        const mensaje = buildContextualFollowUpMessage(contexto, kind, AHORA);
        expect(mensaje).not.toMatch(/qué día/i);
        expect(mensaje).not.toMatch(/cuál local/i);
        expect(mensaje).toMatch(/viernes/i);
        expect(mensaje).toMatch(/Depot Tire Quito Sur/);
      }
    });

    it("sin local todavía sigue preguntando: ahí la pregunta es nueva", () => {
      const mensaje = buildContextualFollowUpMessage(
        { ...contexto, nearestStore: null }, "in_window_second", AHORA,
      );
      expect(mensaje).toMatch(/qué día/i);
    });

    it("cuando el día prometido ya pasó, propone reagendar y dice por qué", () => {
      const mensaje = buildContextualFollowUpMessage(
        contexto, "in_window_first", new Date("2026-08-25T14:00:00.000Z"),
      );
      expect(mensaje).toMatch(/viernes 21 de agosto/i);
      expect(mensaje).toMatch(/qué día/i);
    });
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

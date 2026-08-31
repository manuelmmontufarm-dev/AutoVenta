import { describe, expect, it } from "vitest";
import { elegirFaseOperativa } from "../src/agent/faseOperativa.js";

describe("fase operativa · el cliente puede moverse sin romper el Kanban", () => {
  it("vuelve de seguimiento a opciones cuando pide otra medida", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "seguimiento_venta",
      texto: "Mejor necesito otra medida 205/55R16, ¿qué opciones tienen?",
      tieneCotizacion: true,
    })).toBe("medida_confirmada");
  });

  it("vuelve de cotización a comparación cuando el cliente reabre la elección", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "cotizacion_enviada",
      texto: "¿Qué diferencia hay entre la Falken y la Kenda?",
      tieneCotizacion: true,
    })).toBe("seleccionando");
  });

  it("salta hacia cotización cuando el cliente ya eligió", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "medida_confirmada",
      texto: "Hágame la cotización de la Falken por 4 llantas",
      tieneCotizacion: false,
    })).toBe("cotizacion_enviada");
  });

  it("salta a visita aunque la tarjeta siga al principio", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "nuevo",
      texto: "Puedo ir mañana al local de Quito Sur",
      tieneCotizacion: false,
    })).toBe("seguimiento_venta");
  });

  it.each([
    "235/75/15",
    "195/50/16",
    "205 55 16",
    "255 70 R16",
    "165/80/R13",
    "225/65R17",
    "31x10.50R15LT",
    "7.00R15",
  ])("usa el lector real para la medida escrita como en WhatsApp: %s", (texto) => {
    expect(elegirFaseOperativa({
      etapaGuardada: "seguimiento_venta",
      texto,
      tieneCotizacion: true,
    })).toBe("medida_confirmada");
  });

  it("un día de entrega del vehículo no inventa una visita", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "medida_confirmada",
      texto: "Me entregan la camioneta el jueves de esta semana",
      tieneCotizacion: false,
    })).toBe("nuevo");
  });

  it("un día seco sí es visita cuando responde la pregunta del bot", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "cotizacion_enviada",
      texto: "el jueves",
      tieneCotizacion: true,
      ultimoMensajeBot: "¿Qué día puede pasar por Depot Tire?",
    })).toBe("seguimiento_venta");
  });

  it("la intención explícita de pasar sigue siendo visita", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "medida_confirmada",
      texto: "Quiero pasar el jueves",
      tieneCotizacion: false,
    })).toBe("seguimiento_venta");
  });

  it("una objeción de presupuesto vuelve a elección de alternativas", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "seguimiento_venta",
      texto: "No se ajusta a mi presupuesto",
      tieneCotizacion: true,
    })).toBe("seleccionando");
  });

  it("un pedido de presupuesto sí va a cotización", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "seleccionando",
      texto: "Necesito un presupuesto para 4 llantas",
      tieneCotizacion: false,
    })).toBe("cotizacion_enviada");
  });

  it("«tengo una oferta» no se confunde con un vehículo", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "seguimiento_venta",
      texto: "Tengo una oferta más económica",
      tieneCotizacion: true,
    })).toBe("seguimiento_venta");
  });

  it("una marca y modelo reales sí se reconocen como vehículo", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "seguimiento_venta",
      texto: "Tengo una Toyota Hilux 2022",
      tieneCotizacion: false,
    })).toBe("nuevo");
  });

  it("una respuesta ambigua conserva la etapa cercana", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "seleccionando",
      texto: "Ya gracias mijín",
      tieneCotizacion: false,
    })).toBe("seleccionando");
  });

  it("un sí a la pregunta de cotizar salta a cotización aunque diga solo gracias", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "seleccionando",
      texto: "Gracias mijín",
      tieneCotizacion: false,
      aceptoCotizar: true,
    })).toBe("cotizacion_enviada");
  });

  it("una conversación cerrada nunca se reabre por este selector", () => {
    expect(elegirFaseOperativa({
      etapaGuardada: "perdido",
      texto: "Otra medida 205/55R16",
      tieneCotizacion: false,
    })).toBe("perdido");
  });

  it.each([
    ["Para arrizo 5", "nuevo"],
    ["Las 3 de ir marcas manejan ustedes", "nuevo"],
    ["paso pasado las 5", "seleccionando"],
  ] as const)("un número de otra cosa no inventa una fase: %s", (texto, etapaGuardada) => {
    expect(elegirFaseOperativa({
      etapaGuardada,
      texto,
      tieneCotizacion: false,
    })).toBe(etapaGuardada);
  });

  it.each([
    ["¿Me manda la ubicación de Quito Sur?", "seguimiento_venta"],
    ["¿Cuánto dura la Falken y qué garantía tiene?", "seleccionando"],
    ["Quiero 20 llantas Kenda", "cotizacion_enviada"],
  ] as const)("reconoce la necesidad explícita: %s", (texto, esperada) => {
    expect(elegirFaseOperativa({
      etapaGuardada: "nuevo",
      texto,
      tieneCotizacion: false,
    })).toBe(esperada);
  });
});

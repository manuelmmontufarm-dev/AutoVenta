import { describe, expect, it } from "vitest";
import {
  elegirFaseOperativa,
  herramientasParaElTurno,
} from "../src/agent/faseOperativa.js";

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

describe("herramientas del turno · carga solo lo necesario", () => {
  const publicadas = [
    "buscar_llanta", "buscar_catalogo", "buscar_por_aro_y_tipo", "tipos_de_llanta",
    "guia_medida", "opciones_sin_medida", "fitment_vehiculo", "preparar_opciones",
    "enviar_comparacion", "generar_cotizacion", "reenviar_cotizacion",
    "local_mas_cercano", "notificar_vendedor",
  ];

  it("otra medida en seguimiento recibe búsqueda y opciones, no herramientas de visita", () => {
    const tools = herramientasParaElTurno("medida_confirmada", publicadas);
    expect(tools).toEqual(expect.arrayContaining([
      "buscar_llanta", "buscar_por_aro_y_tipo", "preparar_opciones",
    ]));
    expect(tools).not.toContain("local_mas_cercano");
    expect(tools).not.toContain("notificar_vendedor");
    expect(tools.length).toBeLessThan(publicadas.length);
  });

  it("visita recibe cierre y no arrastra el catálogo entero", () => {
    const tools = herramientasParaElTurno("seguimiento_venta", publicadas);
    expect(tools).toEqual(expect.arrayContaining([
      "local_mas_cercano", "notificar_vendedor", "reenviar_cotizacion",
    ]));
    expect(tools).not.toContain("buscar_catalogo");
    expect(tools).not.toContain("fitment_vehiculo");
  });

  it("nunca habilita una herramienta que el administrador no publicó", () => {
    expect(herramientasParaElTurno("cotizacion_enviada", ["generar_cotizacion"]))
      .toEqual(["generar_cotizacion"]);
  });
});

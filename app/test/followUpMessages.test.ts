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
    // Sin número de cotización desde el 26-ago (Joaquín): el seguimiento la
    // nombra por su medida, que es lo que el cliente reconoce.
    expect(first).not.toMatch(/COT-|AV-/);
    expect(first).toContain("215/65R16");
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

    /*
     * 26-ago: estos dos mensajes pasaron de estar cancelados a salir de verdad.
     * El primero devuelve el plan y abre la puerta a preguntas; el segundo es el
     * «no se olvide». Los dos en «usted», como el resto del cierre — en el chat
     * del 24-ago el bot trataba de usted y el seguimiento le salió con «tu
     * visita», delatando que lo escribía otra parte del sistema.
     */
    it("el primero confirma el plan y ofrece resolver dudas", () => {
      const mensaje = buildContextualFollowUpMessage(
        { ...contexto, visitTimeLabel: "de 4 a 5 pm" }, "in_window_first", AHORA,
      );
      expect(mensaje).toMatch(/le esperamos/i);
      expect(mensaje).toMatch(/viernes 21 de agosto de 4 a 5 pm/i);
      expect(mensaje).toMatch(/pregunta/i);
      expect(mensaje).not.toMatch(/\btu\b|\bte\b/i);
    });

    it("el segundo es el «no se olvide», con la cotización a mano", () => {
      const mensaje = buildContextualFollowUpMessage(
        { ...contexto, visitTimeLabel: "de 4 a 5 pm", quoteNumber: "COT-MT7H1534" },
        "in_window_second", AHORA,
      );
      expect(mensaje).toMatch(/no se olvide/i);
      expect(mensaje).toMatch(/viernes 21 de agosto de 4 a 5 pm/i);
      // La lleva a mano, pero sin recitar su número (26-ago, Joaquín).
      expect(mensaje).toMatch(/lleve a mano su cotización/i);
      expect(mensaje).not.toMatch(/COT-|AV-/);
      expect(mensaje).not.toMatch(/qué día/i);
    });

    /*
     * La hora que lleva dentro `visitDate` es relleno (las 10:00 con las que se
     * construye un día de la semana). Solo se escribe la que dijo el cliente.
     */
    it("sin franja dicha no aparece ninguna hora", () => {
      const mensaje = buildContextualFollowUpMessage(contexto, "in_window_first", AHORA);
      expect(mensaje).toMatch(/viernes 21 de agosto/i);
      expect(mensaje).not.toMatch(/\d{1,2}:\d{2}|\b(?:am|pm)\b/i);
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

  /*
   * «Si a las ~3 horas no contesta, que el seguimiento mande las ubicaciones
   * (los dos links)» — Joaquín, reunión del 25-ago. El caso es el cliente que
   * recibió la cotización y la pregunta por día y local y no contestó ninguna
   * de las dos: repetirle la pregunta pelada no le agrega nada; el dato que le
   * falta para poder contestar es dónde queda cada local.
   */
  describe("los mapas del seguimiento (pedido de Joaquín, 25-ago)", () => {
    const MAPAS_DOS = "📍 *Depot Tire Cumbayá*: https://maps.example/c\n📍 *Depot Tire Quito Sur*: https://maps.example/s";
    const MAPA_UNO = "📍 *Depot Tire Quito Sur*: https://maps.example/s";
    const base = {
      stage: "cotizacion_enviada" as const,
      quoteNumber: "COT-1042",
      storeLinks: MAPAS_DOS,
    };

    it("con cotización y sin local todavía, van los dos links", () => {
      for (const kind of ["in_window_first", "in_window_second"] as const) {
        const mensaje = buildContextualFollowUpMessage(base, kind);
        expect(mensaje).toContain(MAPAS_DOS);
        // Los mapas van al final: el mensaje sigue empezando por lo que se
        // quiere decir, no por dos URLs.
        expect(mensaje.indexOf("http")).toBeGreaterThan(20);
      }
    });

    it("con el local ya elegido va solo el suyo, no los dos", () => {
      const mensaje = buildContextualFollowUpMessage(
        { ...base, nearestStore: "Depot Tire Quito Sur", storeLinks: MAPA_UNO }, "in_window_first",
      );
      expect(mensaje).toContain(MAPA_UNO);
      expect(mensaje.match(/https?:\/\/\S+/g) ?? []).toHaveLength(1);
    });

    it("con día y local confirmados no va ninguno: no queda nada que preguntar", () => {
      const mensaje = buildContextualFollowUpMessage({
        ...base,
        stage: "seguimiento_venta",
        nearestStore: "Depot Tire Quito Sur",
        customerCommitment: "el viernes por favor",
        visitDate: new Date("2026-08-21T15:00:00.000Z"),
      }, "in_window_first", new Date("2026-08-18T14:00:00.000Z"));
      expect(mensaje).not.toMatch(/https?:\/\//);
    });

    it("sin cotización no van: todavía no hay visita que coordinar", () => {
      const mensaje = buildContextualFollowUpMessage(
        { ...base, quoteNumber: null }, "in_window_first",
      );
      expect(mensaje).not.toMatch(/https?:\/\//);
    });

    it("la nota interna del asesor y la plantilla de Meta no los llevan", () => {
      for (const kind of ["advisor_review", "post_window"] as const) {
        expect(buildContextualFollowUpMessage(base, kind)).not.toMatch(/https?:\/\//);
      }
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

/*
 * EL SKU CRUDO NO SALE AL CLIENTE (pendiente del 27-ago, cerrado 29-ago).
 * `selectedProductCode` es interno («35405026») y llegó a imprimirse tal cual
 * («¿Cómo vio la opción 35405026?»). Al texto va la etiqueta legible o nada.
 */
describe("el SKU crudo nunca sale en el seguimiento", () => {
  it("con etiqueta, sale la etiqueta y no el código", () => {
    const texto = buildContextualFollowUpMessage(
      { stage: "cotizacion_enviada", selectedProductCode: "35405026", selectedProductLabel: "KENDA KR20", tireSize: "205/55R16", quoteNumber: "COT-X" },
      "in_window_second",
    );
    expect(texto).toContain("KENDA KR20");
    expect(texto).not.toContain("35405026");
  });

  it("sin etiqueta (el catálogo ya no conoce el código), la medida lo cubre", () => {
    const texto = buildContextualFollowUpMessage(
      { stage: "seleccionando", selectedProductCode: "35405026", tireSize: "205/55R16" },
      "in_window_first",
    );
    expect(texto).not.toContain("35405026");
    expect(texto).toContain("205/55R16");
  });
});

/**
 * Familia A3 (auditoría 2-6 sep): 42 seguimientos dijeron «compararla con la
 * otra alternativa», 22 de ellos con UNA sola opción en pantalla (conv 13825);
 * 9 volvieron a preguntar la prioridad que el cliente ya había contestado
 * (conv 15193 «Premium»). La plantilla no sabía ni cuántas opciones hubo ni
 * qué contestó el cliente.
 */
describe("la plantilla de seguimiento lee lo que ya pasó", () => {
  const base = { stage: "seleccionando" as const, tireSize: "225/70R16", selectedProductLabel: "KENDA KR50" };

  it("con una sola opción no ofrece comparar con otra", () => {
    const texto = buildContextualFollowUpMessage({ ...base, optionsCount: 1 }, "in_window_first");
    expect(texto).not.toMatch(/otra alternativa|otras opciones/i);
    expect(texto).toContain("KENDA KR50");
  });

  it("con varias opciones habla de las otras, en plural", () => {
    const texto = buildContextualFollowUpMessage({ ...base, optionsCount: 3 }, "in_window_first");
    expect(texto).not.toMatch(/la otra alternativa/i);
    expect(texto).toMatch(/otras opciones/i);
  });

  it("si el cliente ya contestó la prioridad, no se la vuelve a preguntar", () => {
    for (const kind of ["in_window_first", "in_window_second"] as const) {
      const texto = buildContextualFollowUpMessage({ ...base, optionsCount: 3, preferenceAnswered: true }, kind);
      expect(texto).not.toMatch(/prioriz|cuál le gustó|le ayudo a elegir/i);
      expect(texto).toContain("KENDA KR50");
    }
  });

  it("en medida_confirmada con la prioridad contestada tampoco pregunta uso ni presupuesto", () => {
    const texto = buildContextualFollowUpMessage(
      { stage: "medida_confirmada", tireSize: "205/55R16", preferenceAnswered: true, selectedProductLabel: "FALKEN ZE310R" },
      "in_window_second",
    );
    expect(texto).not.toMatch(/duración, comodidad o precio|le ayudo a elegir/i);
  });

  it("sin medida guardada no dice «ya tengo su medida»", () => {
    for (const kind of ["in_window_first", "in_window_second"] as const) {
      const texto = buildContextualFollowUpMessage({ stage: "medida_confirmada", tireSize: null }, kind);
      expect(texto).not.toMatch(/ya tengo su medida|ya con la medida/i);
      expect(texto).toMatch(/medida/i);
    }
  });
});

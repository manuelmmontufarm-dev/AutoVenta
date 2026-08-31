import { describe, expect, it } from "vitest";
import { extractCustomerCommitment, preguntamosElDia } from "../src/domain/customerCommitment.js";

describe("extractCustomerCommitment", () => {
  const now = new Date("2026-07-21T20:00:00.000Z");

  it("detecta un día explícito de visita", () => {
    const result = extractCustomerCommitment("Ok voy a comprar el martes", now);
    expect(result?.text).toContain("martes");
    expect(result?.visitDate?.toISOString()).toBe("2026-07-28T15:00:00.000Z");
  });

  it("detecta una promesa para esta semana", () => {
    expect(extractCustomerCommitment("Sí, paso esta semana", now)?.text).toContain("esta semana");
  });

  it("no convierte una mención sin intención en compromiso", () => {
    expect(extractCustomerCommitment("¿Abren el sábado?", now)).toBeNull();
  });

  /**
   * El bot ahora pregunta el día después de cotizar, y a una pregunta directa
   * se responde seco: "el sábado". Sin el contexto de la pregunta eso no era un
   * compromiso para nadie y la tarjeta quedaba sin fecha justo cuando el cliente
   * sí la había dado.
   */
  it("acepta la respuesta seca cuando fuimos nosotros quienes preguntamos el día", () => {
    expect(extractCustomerCommitment("El sábado", now)).toBeNull();
    const result = extractCustomerCommitment("El sábado", now, { respondiendoAlDia: true });
    expect(result?.visitDate?.toISOString()).toBe("2026-07-25T15:00:00.000Z");
  });

  it("guarda el tramo cuando el cliente no da un día exacto", () => {
    const result = extractCustomerCommitment("Este fin de semana", now, { respondiendoAlDia: true });
    expect(result?.text).toBe("Este fin de semana");
    expect(result?.visitDate).toBeUndefined();
  });

  it("no confunde la hora del día con el día siguiente", () => {
    // "paso en la mañana" es hoy temprano, no mañana: agendarlo un día después
    // movía la tarjeta a una fecha que el cliente nunca dijo.
    expect(extractCustomerCommitment("Paso en la mañana", now)?.visitDate).toBeUndefined();
    expect(extractCustomerCommitment("Paso mañana", now)?.visitDate?.toISOString()).toBe(
      "2026-07-22T15:00:00.000Z",
    );
  });

  it("el día de la semana manda sobre 'mañana'", () => {
    const result = extractCustomerCommitment("Voy mañana miércoles", now, {});
    expect(result?.visitDate?.toISOString()).toBe("2026-07-22T15:00:00.000Z");
  });
});

describe("preguntamosElDia", () => {
  it("reconoce las formas en que el bot pide la fecha", () => {
    expect(preguntamosElDia("¿Qué día podría pasar? Avíseme y le dejo anotado su descuento.")).toBe(true);
    expect(preguntamosElDia("¿Cuándo puede venir al local?")).toBe(true);
    expect(preguntamosElDia("¿Qué fecha le queda mejor?")).toBe(true);
  });

  it("no confunde cualquier pregunta con una pregunta por el día", () => {
    expect(preguntamosElDia("¿Le queda mejor Cumbayá o Quito Sur?")).toBe(false);
    expect(preguntamosElDia("¿Cuántas llantas necesita?")).toBe(false);
    expect(preguntamosElDia(null)).toBe(false);
  });
});

/**
 * V09 del corpus T115, medido el 31-ago-2026 contra producción:
 *   CLIENTE: «paso entre hoy y el lunes»
 *   BOT:     «Perfecto: *lunes 31 de agosto*. Ya quedó registrado.»
 * El cliente nombró DOS momentos y no eligió ninguno; el bot se quedó con el
 * segundo y agendó una visita que nadie pidió. Un rango vale como compromiso
 * («va a pasar») pero NO como fecha: el día sigue debiéndose.
 */
describe("un rango de días no fija fecha", () => {
  const now = new Date("2026-08-31T20:00:00.000Z");

  it.each([
    "paso entre hoy y el lunes",
    "voy entre el jueves y el viernes",
    "paso desde hoy hasta el sábado",
    "voy el lunes o el martes",
  ])("«%s» es compromiso sin fecha", (texto) => {
    const r = extractCustomerCommitment(texto, now, { respondiendoAlDia: true });
    expect(r, texto).not.toBeNull();
    expect(r?.tipo, texto).toBe("tramo");
    expect(r?.visitDate, texto).toBeUndefined();
  });

  it("un día solo SÍ fija la fecha: el rango no se come lo que sí es concreto", () => {
    const r = extractCustomerCommitment("paso el jueves", now, { respondiendoAlDia: true });
    expect(r?.tipo).toBe("fecha");
    expect(r?.visitDate).toBeInstanceOf(Date);
  });

  it("una fecha de calendario manda sobre el rango", () => {
    const r = extractCustomerCommitment("paso el 4 de septiembre", now, { respondiendoAlDia: true });
    expect(r?.tipo).toBe("fecha");
    expect(r?.visitDate?.toISOString()).toContain("2026-09-04");
  });
});

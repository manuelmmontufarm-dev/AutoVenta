import { describe, expect, it } from "vitest";
import { rechazaLosDiasPropuestos } from "../src/domain/customerCommitment.js";

/**
 * Producción, 31-ago-2026, conv 3 c20: «no puedo esos dias» tras la pregunta
 * del día terminó en «aún no queda agendada la visita» sin repreguntar nada.
 */
describe("rechaza los días propuestos", () => {
  it("EL CASO DE MANUEL: «no puedo esos dias» es un rechazo en seco", () => {
    expect(rechazaLosDiasPropuestos("no puedo esos dias")).toBe(true);
  });

  it("otras formas del mismo rechazo", () => {
    expect(rechazaLosDiasPropuestos("esos días no me sirven")).toBe(true);
    expect(rechazaLosDiasPropuestos("ninguno de esos")).toBe(true);
    expect(rechazaLosDiasPropuestos("imposible esos días")).toBe(true);
    expect(rechazaLosDiasPropuestos("esta semana no puedo ningún día")).toBe(true);
  });

  it("EL CASO QUE NO DEBE DISPARAR: si nombra un día, es una respuesta con día", () => {
    expect(rechazaLosDiasPropuestos("no puedo esos dias, mejor el viernes")).toBe(false);
    expect(rechazaLosDiasPropuestos("mañana no puedo, pasado sí")).toBe(false);
    expect(rechazaLosDiasPropuestos("el jueves paso")).toBe(false);
  });

  it("EL BORDE: mensajes sin rechazo de días no disparan", () => {
    expect(rechazaLosDiasPropuestos("¿y la garantía cuánto dura?")).toBe(false);
    expect(rechazaLosDiasPropuestos("no puedo pagar tanto")).toBe(false);
    expect(rechazaLosDiasPropuestos("")).toBe(false);
    expect(rechazaLosDiasPropuestos(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  esPlazoDeDecision, respuestaDePlazoDeDecision, tipoDeCierreDelTurno,
} from "../src/domain/cierreTurno.js";

describe("un plazo no es una despedida", () => {
  it.each([
    "Ya le confirmo por favor en el transcurso del día. Gracias por su amable atención",
    "le confirmo mañana",
    "yo le aviso esta tarde",
    "le escribo luego",
    "yo le aviso",
    "déjame ver y te digo",
  ])("mantiene viva la venta: %s", (texto) => {
    // Chats 18438 y 18454: el cliente pidió tiempo y recibió cierre de venta perdida.
    expect(tipoDeCierreDelTurno(texto)).toBeNull();
    expect(esPlazoDeDecision(texto)).toBe(true);
  });

  it("responde que queda a la espera", () => {
    expect(respuestaDePlazoDeDecision()).toBe("Claro, quedo pendiente de su confirmación 👍");
  });

  it("un rechazo verdadero sigue cerrando", () => {
    expect(tipoDeCierreDelTurno("No gracias")).toBe("rechazo_suave");
  });
});

import { describe, expect, it } from "vitest";
import { diaDelMesSuelto } from "../src/domain/diasEnEspanol.js";
import { extractCustomerCommitment } from "../src/domain/customerCommitment.js";

// 27 de agosto de 2026, 01:45 en Ecuador (06:45 UTC): la hora exacta del caso.
const AHORA = new Date("2026-08-27T06:45:00Z");
const dia = (t: string) => extractCustomerCommitment(t, AHORA, { respondiendoAlDia: true });
const iso = (d?: Date) => d?.toISOString().slice(0, 10);

describe("un día del mes suelto es una fecha (conv 3 c17, producción)", () => {
  it("«el 30» — el mensaje exacto que no se guardó", () => {
    expect(iso(dia("el 30")?.visitDate)).toBe("2026-08-30");
  });

  it.each([
    ["voy el 30", "2026-08-30"],
    ["para el 30", "2026-08-30"],
    ["30", "2026-08-30"],
    ["paso el 3", "2026-09-03"],   // ya pasó este mes → el mes que viene
  ])("%s → %s", (texto, esperado) => {
    expect(iso(dia(texto)?.visitDate)).toBe(esperado);
  });

  it("un día que el mes siguiente no tiene no inventa una fecha", () => {
    // 31 de septiembre no existe: pedido el 27-ago, «el 31» sí cae en agosto.
    expect(diaDelMesSuelto("el 31", new Date("2026-09-15T12:00:00Z"))).toBeNull();
  });
});

describe("y lo que NO es una fecha sigue sin serlo", () => {
  it.each(["4 llantas", "dame 4", "205/55R16", "el 45", "el 0"])("%s", (texto) => {
    expect(dia(texto)?.visitDate).toBeUndefined();
  });

  it("una hora sigue siendo una hora, no el día 4", () => {
    expect(dia("a las 4")?.tipo).toBe("solo_hora");
    expect(dia("de 4 a 5")?.tipo).toBe("solo_hora");
  });

  it("fuera de la pregunta del día, un número suelto no agenda nada", () => {
    expect(extractCustomerCommitment("el 30", AHORA)).toBeNull();
    expect(extractCustomerCommitment("4", AHORA)).toBeNull();
  });
});

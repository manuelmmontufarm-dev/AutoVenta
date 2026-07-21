import { describe, expect, it } from "vitest";
import { extractCustomerCommitment } from "../src/domain/customerCommitment.js";

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
});

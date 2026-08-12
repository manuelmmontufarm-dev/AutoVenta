import { describe, expect, it } from "vitest";

/**
 * Casos especiales de horario (12-ago). Los feriados no se deducen del horario
 * semanal: si el 31 de diciembre Cumbayá cierra a la 13:00 y Quito Sur no abre,
 * el bot solo puede decirlo si alguien lo cargó en Ajustes.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";

const { StoreHoursSchema, formatStoreHours, excepcionDelDia } = await import(
  "../src/services/settings.js"
);

const BASE = StoreHoursSchema.parse({
  cumbaya: { weekday: { open: "08:30", close: "17:30" }, weekend: { open: "08:30", close: "14:30" } },
  quitoSur: { weekday: { open: "08:30", close: "17:30" }, weekend: { open: "08:30", close: "17:30", closed: true } },
});

describe("casos especiales de horario por local", () => {
  it("el horario normal se sigue leyendo igual cuando no hay excepciones", () => {
    const texto = formatStoreHours(BASE, "2026-08-12");
    expect(texto).toContain("Cumbayá: lunes a viernes 08:30–17:30");
    expect(texto).not.toContain("CASOS ESPECIALES");
  });

  it("cada local puede tener un horario distinto el mismo feriado", () => {
    const hours = StoreHoursSchema.parse({
      ...BASE,
      cumbaya: { ...BASE.cumbaya, excepciones: [{ fecha: "2026-08-15", motivo: "Feriado", open: "09:00", close: "13:00" }] },
      quitoSur: { ...BASE.quitoSur, excepciones: [{ fecha: "2026-08-15", motivo: "Feriado", closed: true }] },
    });
    const texto = formatStoreHours(hours, "2026-08-12");
    expect(texto).toContain("CASOS ESPECIALES");
    expect(texto).toContain("Cumbayá el 2026-08-15 (Feriado): 09:00–13:00");
    expect(texto).toContain("Quito Sur el 2026-08-15 (Feriado): cerrado");
  });

  it("la excepción de hoy se marca como HOY para que el bot no la lea como futura", () => {
    const hours = StoreHoursSchema.parse({
      ...BASE,
      cumbaya: { ...BASE.cumbaya, excepciones: [{ fecha: "2026-08-12", motivo: "Inventario", closed: true }] },
    });
    expect(formatStoreHours(hours, "2026-08-12")).toContain("Cumbayá HOY (Inventario): cerrado");
  });

  it("no carga el prompt con feriados de dentro de tres meses", () => {
    const hours = StoreHoursSchema.parse({
      ...BASE,
      cumbaya: { ...BASE.cumbaya, excepciones: [{ fecha: "2026-12-25", motivo: "Navidad", closed: true }] },
    });
    expect(formatStoreHours(hours, "2026-08-12")).not.toContain("Navidad");
  });

  it("excepcionDelDia encuentra la del local y la fecha exacta", () => {
    const hours = StoreHoursSchema.parse({
      ...BASE,
      quitoSur: { ...BASE.quitoSur, excepciones: [{ fecha: "2026-08-15", motivo: "Feriado", closed: true }] },
    });
    expect(excepcionDelDia(hours, "quitoSur", "2026-08-15")?.closed).toBe(true);
    expect(excepcionDelDia(hours, "cumbaya", "2026-08-15")).toBeNull();
    expect(excepcionDelDia(hours, "quitoSur", "2026-08-16")).toBeNull();
  });

  it("una excepción con cierre antes de la apertura se rechaza", () => {
    expect(() =>
      StoreHoursSchema.parse({
        ...BASE,
        cumbaya: { ...BASE.cumbaya, excepciones: [{ fecha: "2026-08-15", open: "18:00", close: "09:00" }] },
      }),
    ).toThrow();
  });
});

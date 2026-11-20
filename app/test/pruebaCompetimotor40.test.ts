/**
 * Dos errores que salieron en la prueba de 40 conversaciones + seguimientos
 * de Competimotor (18-nov-2026, simulador con el bot real):
 *  1. un seguimiento salió el sábado 16:30 con el local cerrado desde las 16:00,
 *     porque la política de seguimientos traía el horario de Depot;
 *  2. la pregunta del día de visita prometía «el descuento de su cotización»,
 *     y Competimotor no tiene descuento.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { recortarAlHorarioDelLocal } = await import("../src/domain/horarioDeSeguimientos.js");
const { buildVisitPlanQuestion } = await import("../src/services/quoteMessages.js");
const { business } = await import("../src/config.js");

const DEPOT_EN_LA_POLITICA = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, d === 0 ? null : { open: "08:30", close: "17:30" }]),
);
const abierto = (open: string, close: string) => ({ open, close, closed: false });
const COMPETIMOTOR = {
  principal: {
    dias: {
      lun: abierto("08:00", "18:00"), mar: abierto("08:00", "18:00"), mie: abierto("08:00", "18:00"),
      jue: abierto("08:00", "18:00"), vie: abierto("08:00", "18:00"), sab: abierto("08:00", "16:00"),
      dom: { open: "08:00", close: "16:00", closed: true },
    },
    excepciones: [],
  },
};

describe("horario de seguimientos dentro del horario del local", () => {
  const h = recortarAlHorarioDelLocal(DEPOT_EN_LA_POLITICA, COMPETIMOTOR);
  it("el sábado corta a las 16:00, cuando cierra Competimotor", () => {
    expect(h[6]).toEqual({ open: "08:30", close: "16:00" });
  });
  it("el domingo sigue cerrado", () => {
    expect(h[0]).toBeNull();
  });
  it("la política solo acorta: entre semana no se alarga a 18:00", () => {
    expect(h[3]).toEqual({ open: "08:30", close: "17:30" });
  });
  it("un día con el local cerrado queda null aunque la política lo tenga", () => {
    const cerradoSabado = { principal: { ...COMPETIMOTOR.principal, dias: { ...COMPETIMOTOR.principal.dias, sab: { open: "08:00", close: "16:00", closed: true } } } };
    expect(recortarAlHorarioDelLocal(DEPOT_EN_LA_POLITICA, cerradoSabado)[6]).toBeNull();
  });
  it("con varios locales vale el tramo más amplio de los que abren", () => {
    const dos = { a: COMPETIMOTOR.principal, b: { ...COMPETIMOTOR.principal, dias: { ...COMPETIMOTOR.principal.dias, sab: abierto("09:00", "17:00") } } };
    expect(recortarAlHorarioDelLocal(DEPOT_EN_LA_POLITICA, dos)[6]).toEqual({ open: "08:30", close: "17:00" });
  });
});

describe("Competimotor no promete un descuento que no tiene", () => {
  it("la pregunta del día con cotización no dice «descuento»", () => {
    const texto = buildVisitPlanQuestion({
      conDescuentoAutorizado: false,
      locales: business.stores.map((s) => s.name),
      conCotizacion: true,
      enlaces: false,
    });
    expect(texto).not.toMatch(/descuento/i);
    expect(texto).toContain("le tienen lista su cotización");
  });
});

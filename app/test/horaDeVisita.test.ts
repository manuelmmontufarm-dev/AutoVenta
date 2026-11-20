import { describe, expect, it } from "vitest";
import { franjaHoraria } from "../src/domain/diasEnEspanol.js";
import { leerVisita } from "../src/domain/fechaDeVisita.js";

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_hora_visita";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
const { StoreHoursSchema, esHoraExacta, localAtiendeALaHora } = await import("../src/services/settings.js");

/**
 * PRUEBA COMPETIMOTOR 40 × 3 (18-nov-2026) · familia D: el horario.
 *
 * CM20 (3/3): «el sabado salgo del trabajo a las 5 y paso» + «a eso de las 5 y
 * media» (agrupados con \n). Se registró la visita del sábado 21 «a las 5 pm»
 * (17:00) aunque el local cierra a las 16:00 los sábados.
 */
const CM20 = "el sabado salgo del trabajo a las 5 y paso\na eso de las 5 y media";
const enQuito = (iso: string) => new Date(`${iso}-05:00`);
const tramo = (open: string, close: string, closed = false) => ({ open, close, closed });
// Competimotor: L–V 08:00–18:00, sábado 08:00–16:00, domingo cerrado.
const COMPETIMOTOR = StoreHoursSchema.parse({
  matriz: {
    dias: {
      lun: tramo("08:00", "18:00"), mar: tramo("08:00", "18:00"), mie: tramo("08:00", "18:00"),
      jue: tramo("08:00", "18:00"), vie: tramo("08:00", "18:00"), sab: tramo("08:00", "16:00"),
      dom: tramo("08:00", "16:00", true),
    },
  },
});

describe("CM20 · la hora que dijo, con sus minutos", () => {
  it("la última hora vale y «y media» son 30 minutos", () => {
    expect(franjaHoraria(CM20)).toEqual({ etiqueta: "a las 5:30 pm", hora: 17, minutos: 30 });
  });

  it("sin minutos la forma es la de siempre (diasConFaltas)", () => {
    expect(franjaHoraria("paso a las 10")).toEqual({ etiqueta: "a las 10 am", hora: 10 });
  });

  it("la visita leída queda a las 17:30 de Quito", () => {
    const visita = leerVisita(CM20, enQuito("2026-11-18T22:30:00"), { respondiendoAlDia: true });
    expect(visita?.visitDate?.toISOString()).toBe("2026-11-21T22:30:00.000Z");
    expect(visita?.visitTimeLabel).toBe("a las 5:30 pm");
  });
});

describe("CM20 · fuera del horario no se agenda", () => {
  it("sábado 17:30 con cierre a las 16:00: no atiende", () => {
    expect(localAtiendeALaHora(COMPETIMOTOR, null, enQuito("2026-11-21T17:30:00"))).toBe(false);
  });

  it("sábado 15:30 y viernes 17:30: sí", () => {
    expect(localAtiendeALaHora(COMPETIMOTOR, null, enQuito("2026-11-21T15:30:00"))).toBe(true);
    expect(localAtiendeALaHora(COMPETIMOTOR, null, enQuito("2026-11-20T17:30:00"))).toBe(true);
  });

  it("CM20 en el lote final: el modelo pasó «5:30 pm» a secas a agendar_visita", () => {
    expect(franjaHoraria("5:30 pm")).toEqual({ etiqueta: "a las 5:30 pm", hora: 17, minutos: 30 });
    expect(esHoraExacta("5:30 pm")).toBe(true);
  });

  it("solo una hora exacta se juzga («en la tarde» no)", () => {
    expect(esHoraExacta("a las 5:30 pm")).toBe(true);
    expect(esHoraExacta("de 4 a 5 pm")).toBe(true);
    expect(esHoraExacta("en la tarde")).toBe(false);
    expect(esHoraExacta(null)).toBe(false);
  });
});

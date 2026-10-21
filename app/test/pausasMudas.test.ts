import { describe, expect, it } from "vitest";
import { quienContesta } from "../src/domain/turnoDelHumano.js";
import { cuandoRevisaElAsesor, type FollowUpPolicy } from "../src/domain/followUps.js";

/**
 * FAMILIA 4 DE LA AUDITORÍA DEL 19-OCT: CLIENTES QUE ESCRIBEN EN HORARIO Y
 * RECIBEN LA PRIMERA RESPUESTA A LAS 08:40 DEL DÍA SIGUIENTE.
 *
 * Horas y textos de producción (UTC; Quito = UTC−5).
 */

const POLITICA: FollowUpPolicy = {
  enabled: true,
  timezone: "America/Guayaquil",
  businessHours: Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, { open: "08:30", close: "17:30" }])),
  enabledStages: [],
  firstDelayMinutes: 180,
  secondBeforeCloseMinutes: 60,
  minimumGapMinutes: 120,
  maxInWindowAttempts: 2,
  maxPostWindowAttempts: 0,
  postWindowGapMinutes: 0,
  advisorAlertDays: 2,
  recommendCloseDays: 5,
  requireConsent: false,
  respectOptOut: true,
  neverOutsideHours: true,
  maxMessagesPerDay: 3,
  pauseOnHumanControl: true,
  stagePrompts: {},
} as unknown as FollowUpPolicy;

describe("una pausa automática no deja mudo a quien acaba de escribir", () => {
  // Chat 26121: el advisor_review venció a las 17:29:05 y pausó 6 h; nadie
  // humano había escrito nunca. «Marcas y precios» a las 17:51:09.
  const PAUSA = new Date("2026-10-14T23:29:05Z");
  const MARCAS = new Date("2026-10-14T17:51:09Z");

  it("26121: pausa de la revisión automática y ninguna persona en el chat → contesta el bot y se avisa", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: PAUSA, motivoDeLaPausa: "revision_automatica",
      autorDelUltimoSaliente: "bot", ultimoSalienteHumanoEn: null, ahora: MARCAS,
    })).toEqual({ contesta: "bot", retoma: "pausa_automatica" });
  });

  it("26134: «Le agradezco....» 29 min después de la revisión de las 16:41 → contesta el bot", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: new Date("2026-10-14T22:41:51Z"), motivoDeLaPausa: "revision_automatica",
      autorDelUltimoSaliente: "bot", ultimoSalienteHumanoEn: null, ahora: new Date("2026-10-14T17:10:45Z"),
    })).toEqual({ contesta: "bot", retoma: "pausa_automatica" });
  });

  it("si una persona escribió en el chat hace poco, la pausa de la revisión se respeta", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: PAUSA, motivoDeLaPausa: "revision_automatica",
      autorDelUltimoSaliente: "bot", ultimoSalienteHumanoEn: new Date("2026-10-14T10:00:00Z"), ahora: MARCAS,
    })).toEqual({ contesta: "humano", motivo: "pausa_vigente" });
  });

  it("25844: el dueño está escribiendo (pausa de persona) → el bot calla, como hoy", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: new Date("2026-10-13T03:20:00Z"),
      motivoDeLaPausa: "persona_escribio", autorDelUltimoSaliente: "owner",
      ultimoSalienteHumanoEn: new Date("2026-10-12T21:30:00Z"), ahora: new Date("2026-10-12T21:42:00Z"),
    })).toEqual({ contesta: "humano", motivo: "pausa_vigente" });
  });

  it("el cliente pidió un asesor, o se pausó desde el panel → el bot calla, como hoy", () => {
    for (const motivo of ["pidio_asesor", "panel", "opt_out", "molesto"]) {
      expect(quienContesta({
        asignadoA: "human", pausaHasta: PAUSA, motivoDeLaPausa: motivo,
        autorDelUltimoSaliente: "bot", ultimoSalienteHumanoEn: null, ahora: MARCAS,
      })).toEqual({ contesta: "humano", motivo: "pausa_vigente" });
    }
  });

  it("una pausa vieja sin motivo guardado se trata como de una persona (despliegue seguro)", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: PAUSA, motivoDeLaPausa: null,
      autorDelUltimoSaliente: "bot", ultimoSalienteHumanoEn: null, ahora: MARCAS,
    })).toEqual({ contesta: "humano", motivo: "pausa_vigente" });
  });
});

describe("«el humano habló último» vence a las 48 h", () => {
  it("12639: el último saliente es del asesor del 31-ago y el cliente vuelve el 15-oct → contesta el bot y avisa", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: new Date("2026-08-31T23:00:00Z"), motivoDeLaPausa: null,
      autorDelUltimoSaliente: "owner", ultimoSalienteHumanoEn: new Date("2026-08-31T17:00:00Z"),
      ahora: new Date("2026-10-15T14:24:00Z"),
    })).toEqual({ contesta: "bot", retoma: "humano_hace_mucho" });
  });

  it("13435: persona del 9-sep, «Necesito llanta para un Kia CARNIVAL» el 16-oct → contesta el bot", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: null, autorDelUltimoSaliente: "advisor",
      ultimoSalienteHumanoEn: new Date("2026-09-09T15:00:00Z"), ahora: new Date("2026-10-16T17:41:00Z"),
    })).toEqual({ contesta: "bot", retoma: "humano_hace_mucho" });
  });

  it("15426: el dueño se despidió anoche y el cliente contesta a las 19 h → sigue siendo del humano", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: new Date("2026-09-22T03:45:48Z"), autorDelUltimoSaliente: "owner",
      ultimoSalienteHumanoEn: new Date("2026-09-21T21:45:48Z"), ahora: new Date("2026-09-22T17:24:32Z"),
    })).toEqual({ contesta: "humano", motivo: "el_humano_hablo_ultimo" });
  });

  it("el borde: a las 47 h todavía es del humano; a las 48 h, del bot", () => {
    const habló = new Date("2026-10-10T12:00:00Z");
    const base = { asignadoA: "human", pausaHasta: null, autorDelUltimoSaliente: "owner", ultimoSalienteHumanoEn: habló };
    expect(quienContesta({ ...base, ahora: new Date(habló.getTime() + 47 * 3_600_000) }).contesta).toBe("humano");
    expect(quienContesta({ ...base, ahora: new Date(habló.getTime() + 48 * 3_600_000) }).contesta).toBe("bot");
  });

  it("una pausa 'infinity' heredada (Invalid Date) no cuenta como vigente", () => {
    expect(quienContesta({
      asignadoA: "human", pausaHasta: new Date(Number.NaN), autorDelUltimoSaliente: "bot", ahora: new Date(),
    })).toEqual({ contesta: "bot" });
  });
});

describe("un advisor_review nunca nace vencido", () => {
  const PARTES = { policy: POLITICA };

  it("4231: ciclo recién abierto, sin mensajes todavía, ventana de agosto → no se agenda", () => {
    expect(cuandoRevisaElAsesor({
      ...PARTES,
      ventanaCierra: new Date("2026-08-13T19:41:51Z"),
      ultimoMensajeDelCiclo: null,
      now: new Date("2026-10-14T17:43:54Z"),
    })).toBeNull();
  });

  it("el caso normal no cambia: la revisión va al cierre de la ventana del cliente", () => {
    // Chat 26121: el cliente escribió el 13-oct 17:29:01; la revisión, 24 h después.
    expect(cuandoRevisaElAsesor({
      ...PARTES,
      ventanaCierra: new Date("2026-10-14T17:29:01Z"),
      ultimoMensajeDelCiclo: new Date("2026-10-13T20:29:29Z"),
      now: new Date("2026-10-13T20:29:30Z"),
    })).toEqual(new Date("2026-10-14T17:29:01Z"));
  });

  it("el asesor escribe dos días después del cliente: el reloj arranca en su mensaje, no vence al nacer", () => {
    // Chat 23924 (13-oct): el eco del dueño agendaba la revisión con la
    // ventana del 29-sep y la ejecutaba en el mismo segundo.
    const eco = new Date("2026-10-13T17:34:10Z");
    const due = cuandoRevisaElAsesor({
      ...PARTES,
      ventanaCierra: new Date("2026-09-29T17:46:00Z"),
      ultimoMensajeDelCiclo: eco,
      now: eco,
    });
    expect(due).toEqual(new Date("2026-10-14T17:34:10Z"));
    expect(due!.getTime()).toBeGreaterThan(eco.getTime());
  });

  it("si hasta el último mensaje del ciclo tiene más de 24 h, llegaría tarde: no se agenda", () => {
    expect(cuandoRevisaElAsesor({
      ...PARTES,
      ventanaCierra: new Date("2026-10-01T12:00:00Z"),
      ultimoMensajeDelCiclo: new Date("2026-10-01T12:00:00Z"),
      now: new Date("2026-10-05T12:00:00Z"),
    })).toBeNull();
  });
});

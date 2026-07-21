import { describe, expect, it } from "vitest";
import {
  computeInWindowSchedule,
  detectNegativeSentiment,
  detectOptOut,
  isWithinBusinessHours,
  type FollowUpPolicy,
} from "../src/domain/followUps.js";

const policy: FollowUpPolicy = {
  enabled: true,
  timezone: "America/Guayaquil",
  businessHours: {
    0: null,
    1: { open: "08:30", close: "17:30" },
    2: { open: "08:30", close: "17:30" },
    3: { open: "08:30", close: "17:30" },
    4: { open: "08:30", close: "17:30" },
    5: { open: "08:30", close: "17:30" },
    6: { open: "08:30", close: "17:30" },
  },
  enabledStages: ["nuevo", "medida_confirmada", "seleccionando", "cotizacion_enviada", "seguimiento_venta"],
  firstDelayMinutes: 180,
  secondBeforeCloseMinutes: 120,
  minimumGapMinutes: 240,
  maxInWindowAttempts: 2,
  maxPostWindowAttempts: 2,
  postWindowGapMinutes: 1440,
  advisorAlertDays: 3,
  recommendCloseDays: 5,
  requireConsent: true,
  respectOptOut: true,
  neverOutsideHours: true,
  maxMessagesPerDay: 2,
  pauseOnHumanControl: true,
};

describe("Fase B — reloj, horario y seguridad del scheduler", () => {
  it("programa 3 h y cerca del cierre con separación mínima", () => {
    // Lunes 20-jul-2026 10:00 en Guayaquil (UTC-5).
    const last = new Date("2026-07-20T15:00:00.000Z");
    const result = computeInWindowSchedule({
      lastCustomerMessageAt: last,
      lastRelevantBotMessageAt: last,
      policy,
      now: last,
    });
    expect(result.windowClosesAt.toISOString()).toBe("2026-07-21T15:00:00.000Z");
    expect(result.firstDueAt?.toISOString()).toBe("2026-07-20T18:00:00.000Z");
    // Objetivo martes 08:00 cae fuera de horario: usa lunes 17:29.
    expect(result.secondDueAt?.toISOString()).toBe("2026-07-20T22:29:00.000Z");
  });

  it("mueve el primer seguimiento al siguiente horario comercial", () => {
    // Viernes 16:30 local; +3h se mueve al sábado 08:30.
    const last = new Date("2026-07-24T21:30:00.000Z");
    const result = computeInWindowSchedule({
      lastCustomerMessageAt: last,
      lastRelevantBotMessageAt: last,
      policy,
      now: last,
    });
    expect(result.firstDueAt?.toISOString()).toBe("2026-07-25T13:30:00.000Z");
    expect(result.secondDueAt?.toISOString()).toBe("2026-07-25T19:30:00.000Z");
    expect(isWithinBusinessHours(result.firstDueAt!, policy)).toBe(true);
  });

  it("omite ambos cuando el fin de semana no deja una hora razonable", () => {
    const last = new Date("2026-07-25T21:00:00.000Z"); // sábado 16:00
    const result = computeInWindowSchedule({
      lastCustomerMessageAt: last,
      lastRelevantBotMessageAt: last,
      policy,
      now: last,
    });
    expect(result.firstDueAt).toBeNull();
    expect(result.secondDueAt).toBeNull();
  });

  it("detecta opt-out y molestia explícitos sin inferir rechazos normales", () => {
    expect(detectOptOut("por favor no me escribas más")).toBe(true);
    expect(detectNegativeSentiment("no insistas, ya te dije que no")).toBe(true);
    expect(detectOptOut("ahora no, lo reviso mañana")).toBe(false);
  });
});

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

  it("no confunde el «molestar» de cortesía ecuatoriano con un cliente molesto", () => {
    // El caso que lo destapó: el cliente avisa que va a pasar por el local.
    expect(
      detectNegativeSentiment("ya que me entreguen les molesto para visitarlos por favor"),
    ).toBe(false);
    expect(detectNegativeSentiment("Buenas, molesto con una cotización de 235/50R18")).toBe(false);
    expect(detectNegativeSentiment("le molesto con el precio del juego completo")).toBe(false);
    expect(detectNegativeSentiment("disculpe que le moleste, ¿ya llegaron las llantas?")).toBe(false);
    expect(detectNegativeSentiment("no quiero molestar, cuando pueda me avisa")).toBe(false);
    expect(detectNegativeSentiment("¿le molesta si paso el lunes en la tarde?")).toBe(false);
    expect(detectNegativeSentiment("vuelvo a molestarles por el tema del descuento")).toBe(false);
  });

  it("sigue detectando la molestia de verdad, aunque venga envuelta en cortesía", () => {
    expect(detectNegativeSentiment("estoy molesto, nadie me responde")).toBe(true);
    expect(detectNegativeSentiment("la señora está molesta por la demora")).toBe(true);
    expect(detectNegativeSentiment("me molesta que me escriban a cada rato")).toBe(true);
    expect(detectNegativeSentiment("me tienen molesto con tantos mensajes")).toBe(true);
    expect(
      detectNegativeSentiment("disculpe que le moleste, pero estoy molesto con el trato"),
    ).toBe(true);
    expect(detectNegativeSentiment("ya dejen de estar fastidiando")).toBe(true);
  });
});


/** Conv 13411 (1-sep): «Callate» no contaba como pedido de silencio y salieron
 *  dos seguimientos más al día siguiente. */
describe("pedir silencio, como lo dice la gente, es opt-out", () => {
  it.each(["Callate", "Cállese por favor", "no me escriba más", "no molesten más", "dejen de escribir"])(
    "«%s» es opt-out",
    async (texto) => {
      const { detectOptOut } = await import("../src/domain/followUps.js");
      expect(detectOptOut(texto)).toBe(true);
    },
  );
  it("«les molesto con una cotización» sigue siendo cortesía", async () => {
    const { detectOptOut } = await import("../src/domain/followUps.js");
    expect(detectOptOut("les molesto con una cotización de 205/55R16")).toBe(false);
  });
});

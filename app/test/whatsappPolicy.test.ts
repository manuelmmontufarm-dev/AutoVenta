import { describe, expect, it } from "vitest";
import { evaluateOutboundPolicy, type OutboundPolicyInput } from "../src/domain/whatsappPolicy.js";

const base: OutboundPolicyInput = {
  contentType: "text",
  actor: "bot",
  now: new Date("2026-07-21T14:00:00.000Z"),
  status: "open",
  assignedTo: "bot",
  lastCustomerMessageAt: new Date("2026-07-20T15:00:00.000Z"),
  optedOutAt: null,
  negativeSentimentAt: null,
  customerOptIn: false,
  requireConsent: true,
  respectOptOut: true,
  pauseOnHumanControl: true,
};

describe("Fase C — política determinística de WhatsApp", () => {
  it("permite texto, imagen y PDF dentro de 24 horas", () => {
    for (const contentType of ["text", "image", "pdf"] as const) {
      expect(evaluateOutboundPolicy({ ...base, contentType })).toMatchObject({
        allowed: true,
        code: "allowed_free_form",
      });
    }
  });

  it("bloquea texto manual y automático exactamente al cerrar la ventana", () => {
    for (const actor of ["bot", "owner", "worker"] as const) {
      expect(evaluateOutboundPolicy({
        ...base,
        actor,
        now: new Date("2026-07-21T15:00:00.000Z"),
      })).toMatchObject({ allowed: false, code: "window_closed" });
    }
  });

  it("selecciona plantilla fuera de ventana sólo con consentimiento", () => {
    expect(evaluateOutboundPolicy({
      ...base,
      contentType: "template",
      now: new Date("2026-07-22T15:00:00.000Z"),
    })).toMatchObject({ allowed: false, code: "consent_required" });
    expect(evaluateOutboundPolicy({
      ...base,
      contentType: "template",
      customerOptIn: true,
      now: new Date("2026-07-22T15:00:00.000Z"),
    })).toMatchObject({ allowed: true, code: "allowed_template" });
  });

  it("opt-out, molestia y control humano prevalecen sobre la ventana", () => {
    expect(evaluateOutboundPolicy({ ...base, optedOutAt: base.now })).toMatchObject({ code: "opted_out" });
    expect(evaluateOutboundPolicy({ ...base, negativeSentimentAt: base.now })).toMatchObject({ code: "negative_sentiment" });
    // El seguimiento del worker sigue bloqueado aunque el cliente haya escrito antes.
    expect(evaluateOutboundPolicy({ ...base, actor: "worker", optedOutAt: base.now })).toMatchObject({ code: "opted_out" });
    expect(evaluateOutboundPolicy({ ...base, assignedTo: "human" })).toMatchObject({ code: "human_control" });
    expect(evaluateOutboundPolicy({ ...base, assignedTo: "human", actor: "owner" })).toMatchObject({ allowed: true });
    expect(evaluateOutboundPolicy({ ...base, assignedTo: "human", actor: "authorized_campaign",
      contentType: "template", customerOptIn: true })).toMatchObject({ allowed: true, code: "allowed_template" });
    expect(evaluateOutboundPolicy({ ...base, assignedTo: "human", actor: "authorized_campaign",
      contentType: "template", customerOptIn: true, optedOutAt: base.now })).toMatchObject({ allowed: false, code: "opted_out" });
  });

  it("si el cliente vuelve a escribir después de la baja, se le contesta (7-sep-2026)", () => {
    const baja = new Date("2026-09-07T15:32:45.000Z");
    const volvio = new Date("2026-09-07T15:34:40.000Z");
    const ahora = new Date("2026-09-07T15:34:41.000Z");
    // Conv 3 de Manuel: «callese» → opt-out; «hola» dos minutos después quedaba sin respuesta.
    expect(evaluateOutboundPolicy({ ...base, now: ahora, optedOutAt: baja, negativeSentimentAt: baja, lastCustomerMessageAt: volvio }))
      .toMatchObject({ allowed: true, code: "allowed_free_form" });
    // El mismo turno de la baja sigue mudo: el mensaje del cliente es anterior al opt-out.
    expect(evaluateOutboundPolicy({ ...base, now: ahora, optedOutAt: volvio, lastCustomerMessageAt: baja }))
      .toMatchObject({ allowed: false, code: "opted_out" });
    // Una plantilla (mensaje que sale solo) sigue pidiendo consentimiento.
    expect(evaluateOutboundPolicy({ ...base, now: ahora, contentType: "template", optedOutAt: baja, lastCustomerMessageAt: volvio }))
      .toMatchObject({ allowed: false, code: "opted_out" });
  });
});

import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { nombreParaSaludo, variablesDe, textoRenderizado } = await import("../src/services/recordatoriosDeVisita.js");
const { evaluateOutboundPolicy } = await import("../src/domain/whatsappPolicy.js");

describe("variables de las plantillas de visita", () => {
  const v = { name: "JUAN carlos", visit_date: new Date("2026-11-20T15:00:00Z"), nearest_store: null, tire_size: null };

  it("saluda por el primer nombre y no por un emoji", () => {
    expect(nombreParaSaludo("JUAN carlos")).toBe("Juan");
    expect(nombreParaSaludo("🔥")).toBe("estimado cliente");
    expect(nombreParaSaludo(null)).toBe("estimado cliente");
  });

  it("con un solo local (Competimotor) no lleva el local como variable", () => {
    expect(variablesDe("recordatorio", v, false)).toEqual(["Juan", "viernes", "cotizadas"]);
    expect(variablesDe("no_llego", v, false)).toEqual(["Juan", "cotizadas"]);
  });

  it("con varios locales y sin local elegido dice «nuestro local»", () => {
    expect(variablesDe("recordatorio", v, true)).toEqual(["Juan", "viernes", "nuestro local", "cotizadas"]);
  });

  it("sin el texto de Meta guarda la marca de plantilla", () => {
    expect(textoRenderizado(null, ["x"], "recordatorio_visita_v1")).toBe("[Plantilla recordatorio_visita_v1]");
  });
});

describe("política: el recordatorio de visita es parte del acuerdo", () => {
  const base = {
    contentType: "template" as const, now: new Date(), status: "open" as const, assignedTo: "human" as const,
    lastCustomerMessageAt: null, optedOutAt: null, negativeSentimentAt: null, customerOptIn: false,
    requireConsent: true, respectOptOut: true, pauseOnHumanControl: true,
  };

  it("sale aunque el chat esté en manos de un asesor y sin consentimiento de plantillas", () => {
    expect(evaluateOutboundPolicy({ ...base, actor: "visit_reminder" }).allowed).toBe(true);
  });

  it("el opt-out lo frena igual", () => {
    expect(evaluateOutboundPolicy({ ...base, actor: "visit_reminder", optedOutAt: new Date() }).code).toBe("opted_out");
  });

  it("un seguimiento común sigue pidiendo consentimiento", () => {
    expect(evaluateOutboundPolicy({ ...base, assignedTo: "bot", actor: "worker" }).code).toBe("consent_required");
  });
});

/**
 * SPRINT 5 (F-06) — DEPOT NO CAMBIA.
 *
 * Los textos fijos de abajo son los que Depot manda HOY (sacados del código
 * de `main` 4e53288 antes de tocar nada). Lo de Competimotor va detrás de su
 * política; si uno de estos cambia, se cambió Depot sin que Manuel lo decida.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "depot";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const v = await import("../src/domain/visitaImposible.js");
const { dondeEstaElCliente } = await import("../src/domain/fueraDeCobertura.js");

describe("Depot: lo que se le dice a quien está en otra ciudad sigue igual", () => {
  it("la respuesta a «¿dónde están en Guayaquil?»", () => {
    expect(v.respuestaDirectaDeUbicacionFueraDeCobertura("Donde estan ubicados en guayaquil"))
      .toBe("Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.");
  });
  it("la respuesta fija, con y sin cotización", () => {
    expect(v.respuestaFijaFueraDeCobertura(false))
      .toBe("Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.");
    expect(v.respuestaFijaFueraDeCobertura(true))
      .toBe("Nuestros locales están en Quito: *Cumbayá* y *Quito Sur*. Por ahora no tenemos local fuera de Quito.\n---\nSi desea coordinar el pago y el envío, un asesor le ayuda. 🤝");
  });
  it("«Soy de santo domingo» sigue siendo fuera para Depot", () => {
    expect(dondeEstaElCliente("Soy de santo domingo")).toEqual({ estado: "fuera", ciudad: "Santo Domingo" });
  });
});

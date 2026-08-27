import { describe, expect, it } from "vitest";
import { localesInventados, ofreceElegirLocal } from "../src/domain/localesInventados.js";

const LOCALES = ["Depot Tire Cumbayá", "Depot Tire Quito Sur"];

// El texto EXACTO de producción, conv 11302, 27-ago 14:02:29.
const EL_QUE_FALLO =
  "¿Le queda mejor el sector *Quito Norte* o *Quito Sur* para pasarle la ubicación que más le convenga?";

describe("un local que no existe no se ofrece", () => {
  it("caza el «Quito Norte» del caso real", () => {
    expect(localesInventados(EL_QUE_FALLO, LOCALES)).toEqual(["Quito Norte"]);
    expect(ofreceElegirLocal(EL_QUE_FALLO)).toBe(true);
  });

  it("la pregunta correcta pasa limpia", () => {
    const buena = "¿A cuál local le queda mejor ir, *Cumbayá* o *Quito Sur*?";
    expect(localesInventados(buena, LOCALES)).toEqual([]);
    expect(ofreceElegirLocal(buena)).toBe(true);
  });

  it.each([
    "Le espero en *Depot Tire Cumbayá* el sábado.",
    "📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7",
    "El local de Cumbayá abre de 08:30 a 17:30.",
  ])("no se dispara con «%s»", (texto) => {
    expect(localesInventados(texto, LOCALES)).toEqual([]);
  });

  it("NEGAR que exista un local sí está permitido", () => {
    const negacion = "No le ubico un local como Quito Norte en la información que tengo.";
    // El nombre inventado se detecta, pero no se está OFRECIENDO: no hay «o».
    expect(ofreceElegirLocal(negacion)).toBe(false);
  });

  it("caza también un «Depot Tire» inventado", () => {
    expect(localesInventados("Puede ir a *Depot Tire Valle* si le queda cerca.", LOCALES))
      .toEqual(["Valle"]);
  });
});

describe("el reemplazo deja una pregunta contestable", () => {
  it("cambia la oferta inventada por la pregunta de los dos locales reales", async () => {
    process.env.WHATSAPP_TOKEN ||= "test"; process.env.WHATSAPP_APP_SECRET ||= "test";
    process.env.WHATSAPP_VERIFY_TOKEN ||= "test"; process.env.WHATSAPP_PHONE_ID ||= "test";
    process.env.SELLER_PHONE ||= "593000000000"; process.env.OPENAI_API_KEY ||= "test";
    process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
    process.env.ADMIN_KEY ||= "test"; process.env.OWNER_KEY ||= "test";
    const { conLocalesReales } = await import("../src/services/localesReales.js");

    const r = conLocalesReales(
      "Claro. Estamos en *Quito* y le atendemos en nuestros locales.\n---\n" + EL_QUE_FALLO,
    );
    expect(r.inventados).toEqual(["Quito Norte"]);
    expect(r.texto).toContain("¿A cuál local le queda mejor ir");
    expect(r.texto).not.toContain("Quito Norte");
    // Lo demás del turno no se toca.
    expect(r.texto).toContain("Estamos en *Quito* y le atendemos");
  });

  it("negar que existe un local NO se reescribe", async () => {
    const { conLocalesReales } = await import("../src/services/localesReales.js");
    const negacion = "No le ubico un local como Quito Norte en la información que tengo.";
    expect(conLocalesReales(negacion)).toEqual({ texto: negacion, inventados: [] });
  });
});

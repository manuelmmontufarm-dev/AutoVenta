import { describe, expect, it } from "vitest";

for (const v of ["OPENAI_API_KEY", "WHATSAPP_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_PHONE_ID"]) process.env[v] ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/nada";
const { contarChatsConError, horaVisible, llantasDe, nombreVisible } = await import("../src/services/reporteSimple.js");

// Los cinco detalles que salieron al ver el reporte con datos reales (21-nov-2026).
describe("reporte simple — detalles con datos reales", () => {
  it("un nombre vacío muestra el teléfono legible, no una fila en blanco", () => {
    expect(nombreVisible("", "593998412776")).toBe("0998 412 776");
    expect(nombreVisible("   ", "593998412776")).toBe("0998 412 776");
    expect(nombreVisible(null, "593998412776")).toBe("0998 412 776");
    expect(nombreVisible(" Tony ", "593998412776")).toBe("Tony");
    expect(nombreVisible(null, "+1 555")).toBe("+1 555");
  });

  it("la hora sólo se muestra si ubica al cliente en el día", () => {
    expect(horaVisible("(fin de semana)")).toBeNull();
    expect(horaVisible("algún ratito")).toBeNull();
    expect(horaVisible("en eso estoy")).toBeNull();
    expect(horaVisible("mañana")).toBeNull();
    expect(horaVisible("a las 6 pm")).toBe("a las 6 pm");
    expect(horaVisible("10:00")).toBe("10:00");
    expect(horaVisible("en la tarde")).toBe("en la tarde");
    expect(horaVisible("al mediodía")).toBe("al mediodía");
  });

  it("las llantas no repiten la palabra «Llanta»", () => {
    expect(llantasDe([{ description: "Llanta FALKEN ZIEX CT60 A/S 215/65R16", quantity: 4 }], null))
      .toBe("4 × FALKEN ZIEX CT60 A/S 215/65R16");
  });

  it("los errores se cuentan por chat y sin las correcciones del Guardián", () => {
    expect(contarChatsConError([
      { type: "guardian_correccion", conversation_id: 1 },
      { type: "guardian_correccion", conversation_id: 2 },
      { type: "guard_saludo_repetido", conversation_id: 3 },
      { type: "calco_reciente", conversation_id: 3 },
      { type: "stock_insuficiente", conversation_id: 4 },
      { type: "advisor_follow_up", conversation_id: 5 },
      { type: "send_error", conversation_id: 6 },
    ])).toBe(2);
  });
});

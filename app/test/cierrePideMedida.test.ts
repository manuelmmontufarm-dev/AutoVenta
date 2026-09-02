import { describe, expect, it } from "vitest";
import { CIERRE_COTIZAR } from "../src/domain/preguntasProhibidas.js";

// quoteMessages importa config.ts, que exige estas variables al cargarse.
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_cierre_falso";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
const { buildCierreOpciones, CIERRE_PIDE_MEDIDA } = await import("../src/services/quoteMessages.js");

/** El cierre de la pieza de opciones cuando la medida no la dio el cliente (1-sep-2026). */
describe("buildCierreOpciones con la medida sin confirmar", () => {
  const base = { recomendacion: "KENDA KR50", motivo: "buen equilibrio", precioConIva: 127.93 };

  it("sin recomendación pedida: pide la medida, no el menú", () => {
    const cierre = buildCierreOpciones({ ...base, entregarRecomendacion: false, pedirMedida: true });
    expect(cierre).toBe(CIERRE_PIDE_MEDIDA);
    expect(cierre).not.toMatch(/prioriza/);
  });

  it("con recomendación pedida: la entrega Y pide la medida, sin ofrecer cotizar", () => {
    const cierre = buildCierreOpciones({ ...base, entregarRecomendacion: true, pedirMedida: true });
    expect(cierre).toContain("Yo iría por la *KENDA KR50*");
    expect(cierre).toContain(CIERRE_PIDE_MEDIDA);
    expect(cierre).not.toContain(CIERRE_COTIZAR);
  });

  it("recomendación pedida con medida confirmada: la entrega y OFRECE cotizar", () => {
    const cierre = buildCierreOpciones({ ...base, entregarRecomendacion: true, ofrecerCotizar: true });
    expect(cierre).toContain("Yo iría por la *KENDA KR50*");
    expect(cierre).toContain(CIERRE_COTIZAR);
  });

  it("cotización pedida con todas sus letras: la entrega y no pregunta nada (la cotización sale en el turno)", () => {
    const cierre = buildCierreOpciones({ ...base, entregarRecomendacion: true });
    expect(cierre).toBe("Yo iría por la *KENDA KR50* — $127.93 c/u con IVA: buen equilibrio.");
  });
});

/**
 * El Ángel Guardián: la parte pura — cómo se interpreta el veredicto del
 * modelo revisor. La regla que manda: NUNCA dejar al cliente sin respuesta;
 * ante cualquier salida rara del revisor, gana el borrador original.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { aplicarVeredicto } = await import("../src/services/guardian.js");
const { DEFAULT_GUARDIAN_CONFIG, GuardianConfigSchema } = await import("../src/services/settings.js");

const BORRADOR = "Su cotización COT-X por $499.04 sigue vigente.\n---\n¿Qué día puede pasar?";

describe("aplicarVeredicto — la red de seguridad del guardián", () => {
  it("aprobar deja el borrador intacto", () => {
    const r = aplicarVeredicto(BORRADOR, { veredicto: "aprobar", texto_corregido: "", hallazgos: [] });
    expect(r.texto).toBe(BORRADOR);
    expect(r.veredicto).toBe("aprobar");
  });

  it("corregir reemplaza el texto y conserva los hallazgos documentados", () => {
    const r = aplicarVeredicto(BORRADOR, {
      veredicto: "corregir",
      texto_corregido: "Su cotización COT-X por $581.88 sigue vigente.\n---\n¿Qué día puede pasar?",
      hallazgos: [{ categoria: "precio_incorrecto", severidad: "alta", detalle: "El total no coincide con la cotización." }],
    });
    expect(r.texto).toContain("$581.88");
    expect(r.veredicto).toBe("corregir");
    expect(r.hallazgos[0].categoria).toBe("precio_incorrecto");
  });

  it("una «corrección» vacía NO corrige: gana el borrador", () => {
    const r = aplicarVeredicto(BORRADOR, {
      veredicto: "corregir", texto_corregido: "   ",
      hallazgos: [{ categoria: "tono", severidad: "baja", detalle: "x" }],
    });
    expect(r.texto).toBe(BORRADOR);
    expect(r.veredicto).toBe("aprobar");
    // El hallazgo se conserva aunque no se aplique: es la lista de la semana.
    expect(r.hallazgos).toHaveLength(1);
  });

  it("una «corrección» idéntica al borrador cuenta como aprobación", () => {
    const r = aplicarVeredicto(BORRADOR, { veredicto: "corregir", texto_corregido: BORRADOR, hallazgos: [] });
    expect(r.veredicto).toBe("aprobar");
  });

  it("salida basura del modelo = sin revisión, el borrador sale igual", () => {
    for (const crudo of [null, undefined, "texto suelto", { veredicto: "bloquear" }, { hallazgos: "no-array" }]) {
      const r = aplicarVeredicto(BORRADOR, crudo);
      expect(r.texto).toBe(BORRADOR);
      expect(r.veredicto).toBe("sin_revision");
    }
  });
});

describe("configuración del guardián", () => {
  it("nace APAGADO: prenderlo es una decisión de gasto del asesor", () => {
    expect(DEFAULT_GUARDIAN_CONFIG.activo).toBe(false);
  });

  it("acepta solo el interruptor, sin campos inventados", () => {
    expect(GuardianConfigSchema.parse({ activo: true }).activo).toBe(true);
    expect(GuardianConfigSchema.safeParse({ activo: "si" }).success).toBe(false);
  });
});

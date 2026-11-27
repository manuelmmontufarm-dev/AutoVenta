/**
 * Regla 16 del Guardián con UN solo local (simulador con Claude, 27-nov-2026):
 * el Guardián borraba «¿Puede acercarse hoy o qué día le agendo la cita?» de
 * Competimotor porque «el día se pregunta recién cuando el cliente eligió
 * local». Con dos o más locales (Depot) el texto es el de siempre.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const { INSTRUCCIONES } = await import("../src/services/guardian.js");
const { negocio } = await import("../src/negocio/index.js");
const VIEJA = "El DÍA no se pregunta en ese turno: se pregunta recién cuando el cliente ya eligió local. Si el borrador junta las dos preguntas —local y día— o mete la pregunta dentro del bloque de los links, corrígelo respetando los separadores '---'.";

describe("Competimotor (un solo local): la pregunta del día no se quita", () => {
  it("el servicio tiene un solo local", () => { expect(negocio.locales).toHaveLength(1); });
  it("la regla 16 dice que el día SÍ va y no trae la regla de elegir local", () => {
    expect(INSTRUCCIONES).not.toContain(VIEJA);
    expect(INSTRUCCIONES).toContain("Hay UN SOLO local (");
    expect(INSTRUCCIONES).toContain("¿Puede acercarse hoy o qué día le agendo la cita?");
  });
});

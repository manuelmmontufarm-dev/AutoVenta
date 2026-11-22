import { describe, expect, it } from "vitest";

/**
 * «Validar números» nace prendido fuera de Depot (22-nov-2026, Manuel: «no me
 * sale el Validar en la app de Competi»). Los usuarios guardados antes no traen
 * la llave: el valor por defecto es el que decide.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";
process.env.NEGOCIO = "mundillantas";

const { PERMISOS_COMPLETOS } = await import("../src/services/hubUsers.js");
const { permisosDe } = await import("../src/server/auth.js");

describe("Validar en Competimotor", () => {
  it("nace prendido para todos los usuarios", () => {
    expect(PERMISOS_COMPLETOS.validarNumeros).toBe(true);
    expect(permisosDe("asesor").validarNumeros).toBe(true);
  });
});

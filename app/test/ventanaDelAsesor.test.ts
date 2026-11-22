import { describe, expect, it } from "vitest";

/**
 * La ventana del asesor vista desde la app (22-nov-2026): el botón deja escrito
 * «/asesor …» en WhatsApp, el bot lo reconoce y le contesta que ya recibe todo.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_no_se_conecta";

const { esComandoAsesor, estadoDeVentana, mensajeParaReabrir, respuestaAlAsesor } = await import("../src/services/ventanaDelAsesor.js");

const AHORA = new Date("2026-11-22T15:00:00Z");
const en = (min: number) => new Date(AHORA.getTime() + min * 60_000);

describe("ventana del asesor en la app", () => {
  it("reconoce el comando aunque venga con texto, mayúsculas o espacios", () => {
    expect(esComandoAsesor("/asesor")).toBe(true);
    expect(esComandoAsesor("/Asesor Hola, soy Jenny y quiero recibir los avisos del bot")).toBe(true);
    expect(esComandoAsesor("  /ASESOR")).toBe(true);
  });

  it("un cliente que pide un asesor con palabras NO es el comando", () => {
    expect(esComandoAsesor("quiero hablar con un asesor")).toBe(false);
    expect(esComandoAsesor("asesor")).toBe(false);
    expect(esComandoAsesor("/asesores")).toBe(false);
  });

  it("el mensaje que deja escrito la app empieza con el comando y lleva el primer nombre", () => {
    const texto = mensajeParaReabrir("Jenny Paz");
    expect(texto).toBe("/asesor Hola, soy Jenny y quiero recibir los avisos del bot");
    expect(esComandoAsesor(texto)).toBe(true);
  });

  it("estado: nunca, cerrada, por vencer (3 h antes) y abierta", () => {
    expect(estadoDeVentana(null, AHORA)).toBe("nunca");
    expect(estadoDeVentana(en(-1), AHORA)).toBe("cerrada");
    expect(estadoDeVentana(en(170), AHORA)).toBe("por_vencer");
    expect(estadoDeVentana(en(181), AHORA)).toBe("abierta");
  });

  it("la respuesta saluda por el nombre y dice cuántos avisos pendientes le llegaron", () => {
    expect(respuestaAlAsesor("Jenny Paz", 0)).toMatch(/^Hola Jenny ✅/);
    expect(respuestaAlAsesor("Jenny Paz", 0)).not.toMatch(/pendiente/);
    expect(respuestaAlAsesor("Jenny Paz", 3)).toMatch(/los 3 avisos que tenías pendientes/);
    expect(respuestaAlAsesor("Jenny Paz", 1)).toMatch(/el aviso que tenías pendiente/);
  });
});

/**
 * T115 conv 11274 (ancla H08), 30-ago-2026: el cliente preguntó por Falken y
 * la respuesta ni la nombró; preguntó la fabricación y el bot dijo «no tengo
 * el dato» sin llamar a respaldo_marcas. En la corrida de las 19:32 el modelo
 * hizo las dos cosas bien y en la de las 21:22 las dos mal, con el mismo
 * código: moneda al aire. Estos detectores ponen la obligación por escrito.
 */
import { describe, expect, it } from "vitest";

// prepararSalida arrastra config.ts, que exige el entorno completo.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

import {
  marcaPreguntada,
  ordenDeConsultarRespaldo,
  ordenDeNombrarLaMarca,
  preguntaTecnicaDeRespaldo,
} from "../src/domain/consultaConRespaldo.js";

describe("marcaPreguntada", () => {
  it("reconoce la pregunta real de la conv 11274", () => {
    expect(
      marcaPreguntada("Disponen de llantas \n255 70 R16 A / T \nNecesito 4 unid.\nEn Falken\nMe confirma por favor \nGracias"),
    ).toBe("FALKEN");
  });

  it("reconoce «¿Tienen Kenda?» (P10 del corpus)", () => {
    expect(marcaPreguntada("¿Tienen Kenda?")).toBe("KENDA");
  });

  it("nombrar la marca sin preguntar por ella no dispara", () => {
    // «mis falken rozan cargado» describe las llantas puestas, no pide stock.
    expect(marcaPreguntada("mis falken rozan cargado")).toBeNull();
  });

  it("una marca desconocida no dispara: mejor callar que inventar", () => {
    expect(marcaPreguntada("¿Tienen llantas Marcapoco?")).toBeNull();
  });

  it("la orden nombra la marca y prohíbe callarla", () => {
    const orden = ordenDeNombrarLaMarca("FALKEN");
    expect(orden).toContain("FALKEN");
    expect(orden).toMatch(/PROHIBIDO/);
  });
});

describe("preguntaTecnicaDeRespaldo", () => {
  it.each([
    "De que fabricación es",
    "El frenado en mojado de que clase",
    "¿Cuánto duran estas llantas?",
    "¿Qué garantía tienen?",
    "de donde son estas llantas",
  ])("«%s» exige consultar respaldo_marcas", (texto) => {
    expect(preguntaTecnicaDeRespaldo(texto)).toBe(true);
  });

  it.each([
    "¿Cuánto cuestan?",
    "Necesito 4 llantas 195/55R15",
    "¿A qué hora cierran?",
  ])("«%s» no es pregunta técnica", (texto) => {
    expect(preguntaTecnicaDeRespaldo(texto)).toBe(false);
  });

  it("la orden exige la herramienta antes de rendirse", () => {
    expect(ordenDeConsultarRespaldo()).toContain("respaldo_marcas");
  });
});

/**
 * T115 conv 9887 turnos 9-10, 30-ago-2026: el dedupe de preguntas corre
 * primero en la cadena, el Ángel Guardián reescribe DESPUÉS y reintrodujo la
 * pregunta del local dos turnos seguidos. La cadena debe volver a pasar el
 * dedupe tras el guardián — este test fija ese orden para siempre.
 */
describe("orden de la cadena de salida", () => {
  it("el dedupe de preguntas corre otra vez después del Ángel Guardián", async () => {
    const { PASOS } = await import("../src/services/prepararSalida.js");
    const nombres = PASOS.map((p) => p.nombre);
    const guardian = nombres.indexOf("angel_guardian");
    const dedupeTardio = nombres.indexOf("sin_pregunta_consecutiva_tras_guardian");
    const freno = nombres.indexOf("guardian_no_vende_solo");
    expect(guardian).toBeGreaterThanOrEqual(0);
    expect(dedupeTardio).toBeGreaterThan(guardian);
    // Después del freno comercial, para juzgar el texto ya definitivo.
    expect(dedupeTardio).toBeGreaterThan(freno);
    // Y antes de que insistir decida agregar la pregunta que falta.
    expect(dedupeTardio).toBeLessThan(nombres.indexOf("insistir_con_lo_que_falta"));
  });
});

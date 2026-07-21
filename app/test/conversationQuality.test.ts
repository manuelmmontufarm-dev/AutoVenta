import { describe, expect, it } from "vitest";
import { looksRepetitiveReply, replySimilarity } from "../src/domain/conversationQuality.js";

describe("conversation quality", () => {
  it("detecta la repetición del bucle de fitment", () => {
    const prior = ["No tengo una medida verificada. ¿Puedes enviar la etiqueta de la puerta?", "Necesito la versión del vehículo."];
    expect(looksRepetitiveReply("No tengo una medida verificada; envíame la etiqueta de la puerta.", prior)).toBe(true);
  });

  it("no confunde respuestas comerciales distintas", () => {
    expect(replySimilarity("Estas son las opciones y sus precios", "¿En qué sector estás para ubicar el local?")).toBeLessThan(0.5);
  });
});

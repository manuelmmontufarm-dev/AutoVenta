import { describe, expect, it } from "vitest";
import { conSaludo, nombreSaludable, yaSaluda } from "../src/domain/saludo.js";

describe("el primer mensaje al cliente siempre saluda", () => {
  it("reconoce los saludos que de verdad usa la gente", () => {
    for (const t of [
      "Hola, ¿en qué le ayudo?",
      "¡Hola! 👋 Soy el asistente de Depot Tire",
      "Buenas, dígame la medida",
      "Buenos días, le cotizo de una",
      "buenas tardes",
      "👋 Hola, ¿qué medida usa?",
      "¡Buenas! Sí le cotizo de una con stock real",
      "Qué tal, ¿qué aro usa?",
      "*Hola* — le paso las opciones",
    ]) {
      expect(yaSaluda(t), t).toBe(true);
    }
  });

  it("no confunde un «buenas» en mitad de la frase con un saludo", () => {
    expect(yaSaluda("Le paso las opciones, todas son muy buenas")).toBe(false);
    expect(yaSaluda("¿Me dice la medida?")).toBe(false);
    expect(yaSaluda("Tenemos llantas en aros del 13 al 22.")).toBe(false);
    expect(yaSaluda("")).toBe(false);
  });

  it("no agrega un segundo saludo si el modelo ya saludó", () => {
    const ya = "¡Hola! 👋 Soy el asistente de Depot Tire. ¿Qué aro usa?";
    expect(conSaludo(ya, "Angel")).toBe(ya);
  });

  it("saluda cuando el modelo arrancó directo con la pregunta", () => {
    // Este es el caso real: el turno abre interrogando en vez de saludando.
    const seco = "¿Me ayuda con la medida completa, por ejemplo 225/65R17?";
    expect(conSaludo(seco, null)).toBe(`¡Hola! 👋\n${seco}`);
  });

  it("usa el nombre cuando el pushname sirve de nombre", () => {
    expect(conSaludo("¿Qué aro usa?", "María Fernanda Pérez")).toBe("¡Hola, María! 👋\n¿Qué aro usa?");
    expect(conSaludo("¿Qué aro usa?", "angel")).toBe("¡Hola, Angel! 👋\n¿Qué aro usa?");
  });

  it("descarta los pushnames que no son nombres", () => {
    // WhatsApp deja poner cualquier cosa; el ticket 2150 venía como
    // «angelbarreiro1986». Saludar con eso se lee peor que no saludar.
    expect(nombreSaludable("angelbarreiro1986")).toBeNull();
    expect(nombreSaludable("593995199290")).toBeNull();
    expect(nombreSaludable("🔥🔥")).toBeNull();
    expect(nombreSaludable("A")).toBeNull();
    expect(nombreSaludable("")).toBeNull();
    expect(nombreSaludable(null)).toBeNull();
    expect(nombreSaludable("Juan")).toBe("Juan");
  });

  it("un texto vacío se queda vacío: no se inventa un mensaje", () => {
    expect(conSaludo("", "Juan")).toBe("");
    expect(conSaludo("   ", "Juan")).toBe("");
  });
});

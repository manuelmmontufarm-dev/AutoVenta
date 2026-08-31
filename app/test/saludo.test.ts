import { describe, expect, it } from "vitest";
import { conPresentacion, conSaludo, nombreSaludable, yaSaluda } from "../src/domain/saludo.js";

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

/*
 * Decisión de Manuel, 31-ago-2026: al abrirse la conversación el bot se
 * presenta SIEMPRE, no manda un «hola» pelado. Y si el cliente ya dio la
 * medida en ese primer mensaje, la presentación encabeza y debajo va la
 * cotización — no se le vuelve a preguntar lo que ya dijo.
 */
describe("la presentación al abrirse la conversación", () => {
  const FIRMA = "Soy el asistente de Depot Tire";

  it("se presenta y debajo deja lo que el turno traía", () => {
    const salida = conPresentacion("En *195/55R16* tengo estas 3 opciones disponibles.", null);
    expect(salida.startsWith("¡Hola! 👋 Soy el asistente de Depot Tire.")).toBe(true);
    expect(salida).toContain("stock y precios reales");
    expect(salida).toContain("En *195/55R16* tengo estas 3 opciones disponibles.");
  });

  it("usa el nombre cuando el pushname sirve", () => {
    expect(conPresentacion("¿Qué aro usa?", "María Fernanda Pérez"))
      .toContain("¡Hola, María! 👋 Soy el asistente de Depot Tire.");
  });

  it("no se presenta dos veces", () => {
    const ya = `¡Hola! 👋 ${FIRMA}. Le cotizo al instante.`;
    expect(conPresentacion(ya, "Angel")).toBe(ya);
  });

  it("le quita al modelo su «hola» suelto para no tartamudear", () => {
    const salida = conPresentacion("¡Hola, Manuel! 👋 ¿Qué medida necesita?", "Manuel");
    expect(salida).toBe(
      "¡Hola, Manuel! 👋 Soy el asistente de Depot Tire. Le cotizo al instante con stock"
      + " y precios reales, comparo modelos y le armo su cotización para tienda."
      + "\n\n¿Qué medida necesita?",
    );
    // Una sola vez, no dos.
    expect(salida.match(/¡Hola/g)).toHaveLength(1);
  });

  it("si el turno era solo un saludo, queda la presentación sola", () => {
    expect(conPresentacion("Hola 👋", null)).toBe(
      "¡Hola! 👋 Soy el asistente de Depot Tire. Le cotizo al instante con stock"
      + " y precios reales, comparo modelos y le armo su cotización para tienda.",
    );
  });

  it("un texto vacío se queda vacío", () => {
    expect(conPresentacion("", "Juan")).toBe("");
    expect(conPresentacion("   ", "Juan")).toBe("");
  });
});

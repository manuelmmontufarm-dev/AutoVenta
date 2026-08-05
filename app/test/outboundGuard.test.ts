import { describe, expect, it } from "vitest";

// El módulo importa config (exige env): valores de prueba ANTES del import.
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { guardOutboundReply, PREGUNTA_MEDIDA_GUARD } = await import("../src/services/outboundGuard.js");

/**
 * El guardián de salida, probado contra los MENSAJES REALES que el bot mandó
 * a clientes el 5-ago (los de las capturas de Joaquín). Ninguno puede volver a
 * salir: aunque el modelo los produzca, aquí se frenan.
 */
describe("Guardián de salida — las fallas del 5-ago no pueden volver a enviarse", () => {
  describe("caso Ricardo Nitro: disculpas en cadena", () => {
    const APOLOGIA = "Disculpa, tuve un problema procesando tu mensaje. ¿Me lo repites por favor?";

    it("la segunda disculpa seguida NO se envía y se marca bot atascado", () => {
      const r = guardOutboundReply(APOLOGIA, APOLOGIA, true);
      expect(r.text).toBeNull();
      expect(r.issues).toContain("bot_atascado");
    });

    it("una disculpa aislada sí pasa (es honesta); solo la repetición es spam", () => {
      const r = guardOutboundReply(APOLOGIA, "Aquí están sus opciones 🛞", true);
      expect(r.text).toBe(APOLOGIA);
      expect(r.issues).toEqual([]);
    });

    it("un mensaje calcado al anterior no se envía, sea cual sea su contenido", () => {
      const texto = "Estas son las opciones disponibles para su medida.";
      const r = guardOutboundReply(texto, texto, true);
      expect(r.text).toBeNull();
      expect(r.issues).toContain("mensaje_duplicado");
    });

    it("el duplicado se detecta aunque cambien espacios o mayúsculas", () => {
      const r = guardOutboundReply(
        "Estas son las  opciones disponibles.",
        "estas son las opciones DISPONIBLES.",
        true,
      );
      expect(r.text).toBeNull();
    });
  });

  describe("pedir fotos: se elimina la oración, se salva el resto", () => {
    it("frena el mensaje real «si prefiere, puede mandarme una foto del costado»", () => {
      const real =
        "Perfecto, ¿puede decirme qué medida dice el filo de su llanta actual? Si prefiere, puede mandarme una foto del costado y yo la leo.";
      const r = guardOutboundReply(real, null, false);
      expect(r.issues).toContain("pide_foto");
      expect(r.text).not.toMatch(/foto/i);
      // La parte útil (pedir la medida) sobrevive.
      expect(r.text).toContain("¿puede decirme qué medida");
    });

    it("frena el mensaje real del caso Orlando y deja una pregunta que vende", () => {
      const real =
        "No tengo una medida verificada para ese modelo.\n\n¿Podrías enviarme una foto de la etiqueta de la puerta o de la medida que aparece en una llanta actual? Así confirmamos la compatibilidad.";
      const r = guardOutboundReply(real, null, false);
      expect(r.issues).toContain("pide_foto");
      expect(r.text).not.toMatch(/foto|imagen/i);
      // Sin la oración de la foto no quedaba pregunta: el guardián pide la medida escrita.
      expect(r.text).toContain(PREGUNTA_MEDIDA_GUARD);
    });

    it("si TODO el mensaje era pedir la foto, sale solo la pregunta de la medida", () => {
      const r = guardOutboundReply("¿Podrías enviarme una foto de la etiqueta de la puerta?", null, false);
      expect(r.text).toBe(PREGUNTA_MEDIDA_GUARD);
    });

    it("no toca un mensaje que habla de fotos sin pedirlas", () => {
      const inocente = "La imagen de la cotización ya le llegó arriba 👆 ¿Le queda mejor Cumbayá o Quito Sur?";
      const r = guardOutboundReply(inocente, null, true);
      expect(r.text).toBe(inocente);
      expect(r.issues).toEqual([]);
    });
  });

  describe("caso Jordian: saludo de nuevo a mitad de conversación", () => {
    it("recorta el «¡Buenas tardes!» real y recapitaliza", () => {
      const real =
        "¡Buenas tardes! ¿Qué medida necesita para sus llantas? Puede encontrarla en el costado de su llanta actual.";
      const r = guardOutboundReply(real, "Mensaje anterior del bot.", true);
      expect(r.issues).toContain("saludo_repetido");
      expect(r.text).toMatch(/^¿Qué medida necesita/);
    });

    it("en el PRIMER mensaje del ciclo el saludo es bienvenido", () => {
      const primero = "¡Hola! Con gusto le ayudo. ¿Qué medida necesita?";
      const r = guardOutboundReply(primero, null, false);
      expect(r.text).toBe(primero);
      expect(r.issues).toEqual([]);
    });

    it("si el mensaje era SOLO un saludo a mitad de hilo, no se envía", () => {
      const r = guardOutboundReply("¡Hola!", "Mensaje anterior.", true);
      expect(r.text).toBeNull();
    });
  });

  it("una respuesta buena pasa intacta, sin tocar una letra", () => {
    const buena =
      "En 225/60R17 tengo Falken Wildpeak A/T, justo lo todo terreno que busca 🛞\n---\n¿Le preparo la cotización por las 4?";
    const r = guardOutboundReply(buena, "Otro mensaje.", true);
    expect(r.text).toBe(buena);
    expect(r.issues).toEqual([]);
  });
});

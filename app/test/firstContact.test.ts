import { describe, expect, it } from "vitest";
import { firstContactReply, isGenericFirstContact } from "../src/domain/firstContact.js";

describe("primer contacto inteligente", () => {
  it("reconoce el saludo genérico que llega desde los anuncios", () => {
    expect(isGenericFirstContact("¡Hola! Quiero más información")).toBe(true);
    expect(isGenericFirstContact("Hola 👋 quisiera información.")).toBe(true);
    expect(isGenericFirstContact("Buenas")).toBe(true);
  });

  /*
   * Producción, 31-ago-2026, conv 3 ciclos 36-38: la lista de saludos era de
   * coincidencia EXACTA, con «hola» y «buenos dias» por separado pero no la
   * combinación. «hola» recibió la bienvenida; «Hola, buenos días» y «hola
   * buenos dias» recibieron la guía de medidas sin presentarse.
   */
  it("reconoce saludos combinados y con tildes, no solo los de la lista vieja", () => {
    for (const t of [
      "hola buenos dias",
      "Hola, buenos días",
      "Hola buenas tardes",
      "Buenos días",
      "buen día",
      "Holaaa",
      "¡Hola! ¿Qué tal?",
      "Buenas noches, disculpe",
      "Hola, una consulta por favor",
      "Hola, buenas. Gracias",
      "buenas a cuanto estan las llantas",
      "Hola, ¿qué precios manejan?",
      "Buenas, quisiera cotizar",
    ]) {
      expect(isGenericFirstContact(t), t).toBe(true);
    }
  });

  it("no intercepta consultas que ya traen datos útiles", () => {
    expect(isGenericFirstContact("Hola, necesito 265/70R17")).toBe(false);
    expect(isGenericFirstContact("Hola, ¿precio de la Kenda KR601?")).toBe(false);
    expect(isGenericFirstContact("Tengo una Toyota Hilux 2020")).toBe(false);
    expect(isGenericFirstContact("Quiero más información de llantas aro 17")).toBe(false);
  });

  /* Los mensajes reales del 31-ago que SÍ traían con qué trabajar. */
  it("el saludo por delante no tapa el dato que viene detrás", () => {
    for (const t of [
      "Hola, buenos días. Necesito una llanta 165/80/R13",
      "Buenas, busco una 235/75/15",
      "Hola, necesito llantas para montacargas, medida 6.50-10 sólida",
      "Buenos días, ¿precio de la Kenda?",
      "Hola, quisiera saber el valor del cambio de aceite para un Vitara",
      "Hola, tengo una camioneta",
      "Buenas, ¿tienen aro 17?",
    ]) {
      expect(isGenericFirstContact(t), t).toBe(false);
    }
  });

  it("saluda, se presenta y ofrece las tres puertas antes de pedir nada", () => {
    const reply = firstContactReply();
    expect(reply.startsWith("¡Hola! 👋")).toBe(true);
    expect(reply).toContain("Soy el asistente de Depot Tire");
    expect(reply).toContain("stock y precios reales");
    expect(reply).toContain("medida escrita");
    expect(reply).toContain("foto del costado de la llanta");
    expect(reply).toContain("decirme su vehículo");
    expect(reply).toContain("¿Qué medida usa? Ej: 225/65R17");
  });
});

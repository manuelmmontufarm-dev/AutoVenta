import { describe, expect, it } from "vitest";
import { firstContactReply, isGenericFirstContact } from "../src/domain/firstContact.js";

describe("primer contacto inteligente", () => {
  it("reconoce el saludo genérico que llega desde los anuncios", () => {
    expect(isGenericFirstContact("¡Hola! Quiero más información")).toBe(true);
    expect(isGenericFirstContact("Hola 👋 quisiera información.")).toBe(true);
    expect(isGenericFirstContact("Buenas")).toBe(true);
  });

  it("no intercepta consultas que ya traen datos útiles", () => {
    expect(isGenericFirstContact("Hola, necesito 265/70R17")).toBe(false);
    expect(isGenericFirstContact("Hola, ¿precio de la Kenda KR601?")).toBe(false);
    expect(isGenericFirstContact("Tengo una Toyota Hilux 2020")).toBe(false);
    expect(isGenericFirstContact("Quiero más información de llantas aro 17")).toBe(false);
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

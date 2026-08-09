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

  it("prioriza la medida sin esconder las otras formas de asesorar", () => {
    const reply = firstContactReply();
    expect(reply).toContain("*medida de la llanta*");
    expect(reply).toContain("225/65R17");
    expect(reply).toContain("foto del costado");
    expect(reply).toContain("*marca, modelo y año del vehículo*");
    expect(reply).toContain("aro");
    expect(reply).toContain("según su uso");
    expect(reply).toContain("comparar opciones");
  });
});

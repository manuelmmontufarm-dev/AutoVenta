import { describe, expect, it } from "vitest";
import { contieneElPedidoDeMedida, firstContactReply, pedidoDeMedidaDelPrimerContacto, sinElPedidoDeMedida } from "../src/domain/firstContact.js";

describe("sinElPedidoDeMedida", () => {
  it("el pedido solo queda vacío", () => {
    expect(sinElPedidoDeMedida(pedidoDeMedidaDelPrimerContacto())).toBe("");
    expect(sinElPedidoDeMedida("Puede mandarme la medida escrita, una foto del costado de la llanta o decirme su vehículo.")).toBe("");
    expect(sinElPedidoDeMedida("¿Qué medida usa? Ej: 225/65R17")).toBe("");
  });

  it("de la bienvenida entera deja la presentación", () => {
    const sola = sinElPedidoDeMedida(firstContactReply());
    expect(sola).toMatch(/^¡Hola! 👋 /);
    expect(sola).toContain("comparo modelos");
    expect(sola).not.toContain("medida");
  });

  it("no toca un texto que no es el pedido", () => {
    expect(sinElPedidoDeMedida("¿Qué medida necesita para su Hilux?")).toBe("¿Qué medida necesita para su Hilux?");
  });
});

describe("contieneElPedidoDeMedida", () => {
  it("distingue el pedido de un bloque que solo tenía espacios de más", () => {
    expect(contieneElPedidoDeMedida(pedidoDeMedidaDelPrimerContacto())).toBe(true);
    expect(contieneElPedidoDeMedida(firstContactReply())).toBe(true);
    expect(contieneElPedidoDeMedida("🖤 PROMOCIÓN BLACK FRIDAY 🖤  ")).toBe(false);
  });
});

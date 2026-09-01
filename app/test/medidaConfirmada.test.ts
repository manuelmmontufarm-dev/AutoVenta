import { describe, expect, it } from "vitest";
import { medidaConfirmadaPorCliente } from "../src/domain/medidaConfirmada.js";

/**
 * ¿La medida de trabajo la dio el cliente o la dedujo el bot? Conv 13862
 * (1-sep-2026): «Suzuki SZ 2016» → el bot dedujo 225/70R16 y cotizó. El
 * cliente nunca escribió una medida.
 */
describe("medidaConfirmadaPorCliente", () => {
  it("sin medida de trabajo no hay nada confirmado", () => {
    expect(medidaConfirmadaPorCliente(null, ["tengo un Suzuki SZ 2016"])).toBe(false);
  });

  it("la medida que dedujo el bot y el cliente nunca escribió NO está confirmada", () => {
    expect(medidaConfirmadaPorCliente("225/70R16", [
      "¡Hola! Quiero más información, tengo un Susuki Sz 2016, que llantas me recomienda",
      "la 2",
    ])).toBe(false);
  });

  it("escrita por el cliente, en cualquier formato, sí", () => {
    expect(medidaConfirmadaPorCliente("225/70R16", ["necesito 225/70 r16"])).toBe(true);
    expect(medidaConfirmadaPorCliente("225/70R16", ["225-70-16 por favor"])).toBe(true);
  });

  it("leída de la foto también cuenta: entra como texto del cliente", () => {
    expect(medidaConfirmadaPorCliente("185/70R14", [
      "[El cliente mandó una foto. Se lee: 185/70R14, Kenda, KR203 Tubeless, 88H]",
    ])).toBe(true);
  });

  it("de flotación también", () => {
    expect(medidaConfirmadaPorCliente("31X10.5R15", ["quiero 31x10.5 r15"])).toBe(true);
  });

  it("otra medida distinta a la de trabajo no la confirma", () => {
    expect(medidaConfirmadaPorCliente("225/70R16", ["antes tenía 205/60R16"])).toBe(false);
  });

  it("el cliente que vuelve: la medida quedó en una visita anterior", () => {
    expect(medidaConfirmadaPorCliente("225/70R16", ["hola de nuevo", "225/70R16 para mi vitara"])).toBe(true);
  });
});

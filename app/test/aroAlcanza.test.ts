/**
 * EL ARO ALCANZA (conv 3, 8-sep-2026, 14:48): «Una llanta ron 15» → guía de
 * medida + «confírmeme la medida completa», sin una llanta en pantalla. El
 * detector solo leía rin/aro/ring, y «aro → opciones» dependía del modelo.
 */
import { describe, expect, it } from "vitest";
import { aroDadoPorElCliente, aroEnTexto, aroRespondido } from "../src/domain/medidaConfirmada.js";
import { aroPedido } from "../src/domain/consultaConRespaldo.js";

describe("aroEnTexto · el aro como lo escribe la gente", () => {
  it.each([
    ["Una llanta ron 15", 15],
    ["necesito rin 14", 14],
    ["para aro 17", 17],
    ["rim 16", 16],
    ["aro de 15", 15],
    ["rin de 13", 13],
    ["tiene r15?", 15],
    ["R 18 para camioneta", 18],
    ["llantas de 15 pulgadas", 15],
    ["arillo 14", 14],
    ["Para rin 19 / hyundai creta 2027", 19],
  ])("«%s» → %i", (t, aro) => {
    expect(aroEnTexto(t)).toBe(aro);
    expect(aroPedido(t)).toBe(aro);
  });

  it.each(["195/55R15", "205 55 16", "quiero 4 llantas", "el 2016", "hola", "voy el 15", "a las 15"])(
    "«%s» no es un aro", (t) => expect(aroEnTexto(t)).toBeNull(),
  );

  it("el último aro de la visita manda; una medida completa no cuenta como aro", () => {
    expect(aroDadoPorElCliente(["hola", "Una llanta ron 15", "mejor rin 16"])).toBe(16);
    expect(aroDadoPorElCliente(["195/55R15"])).toBeNull();
  });
});

describe("aroRespondido · el número seco contesta la pregunta del aro", () => {
  it("«15» tras «¿qué medida usa?» o «¿qué aro?» es el aro; tras el menú o sin pregunta no", () => {
    expect(aroRespondido("15", "¿Qué medida usa? Ej: 225/65R17")).toBe(15);
    expect(aroRespondido("el 16", "¿Qué aro tiene su vehículo?")).toBe(16);
    expect(aroRespondido("15", "¿Qué prioriza usted? 1) Costo 2) Premium")).toBeNull();
    expect(aroRespondido("2", "¿Cuántas llantas necesita?")).toBeNull();
    expect(aroRespondido("15", null)).toBeNull();
    expect(aroRespondido("ron 15", null)).toBe(15);
  });
});

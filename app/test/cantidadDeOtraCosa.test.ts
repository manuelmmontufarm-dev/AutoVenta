/**
 * UN NÚMERO QUE CUENTA OTRA COSA NO ES UNA CANTIDAD DE LLANTAS.
 *
 * Producción, 26 y 27-ago. Tres conversaciones distintas, el mismo error: el
 * extractor leyó como «cuántas llantas quiere» un número que pertenecía a otra
 * cosa. No se queda en la ficha — `selected_quantity` entra al prompt del
 * modelo como «Cantidad ya confirmada: N … cotiza», entra a los hechos duros
 * del Ángel Guardián (que entonces lo defiende en vez de corregirlo) y sale al
 * chat convertido en una cotización firmada:
 *
 *   conv 11366 · «Para arrizo 5»                    → 5 × KENDA KR20, $456.40
 *   conv 11005 · «Las 3 de ir marcas manejan ustedes» → 3 × KENDA KR605, $620.55
 *   conv 11357 · «…medio dia o pasado las 5…»        → selected_quantity = 5
 *
 * Es la misma familia que la medida leída como cantidad (`cantidadGrande.ts`),
 * por otra puerta: allá el número venía pegado a la medida, acá al nombre del
 * auto, a una pregunta por las marcas y a la hora de la visita.
 */
import { describe, expect, it } from "vitest";
import { cantidadPedidaPorElCliente, extractExplicitQuantity } from "../src/domain/salesIntent.js";

describe("un número que cuenta otra cosa no es una cantidad", () => {
  it("el nombre del auto (conv 11366)", () => {
    expect(cantidadPedidaPorElCliente("Para arrizo 5", null)).toBeNull();
    expect(cantidadPedidaPorElCliente("tengo un mazda 3", null)).toBeNull();
    expect(cantidadPedidaPorElCliente("es para una cx 5", null)).toBeNull();
  });

  it("una pregunta por las marcas o las opciones (conv 11005)", () => {
    expect(cantidadPedidaPorElCliente("Las 3 de ir marcas manejan ustedes", null)).toBeNull();
    expect(cantidadPedidaPorElCliente("las 3 opciones que me mando", null)).toBeNull();
    expect(cantidadPedidaPorElCliente("los 2 locales quedan lejos", null)).toBeNull();
  });

  it("la hora de la visita (conv 11357)", () => {
    expect(cantidadPedidaPorElCliente(
      "Vera ahora estoy en la trabajo talvez medio dia o pasado las 5 les agradecería", null,
    )).toBeNull();
    expect(cantidadPedidaPorElCliente("paso pasado las 5", null)).toBeNull();
    expect(cantidadPedidaPorElCliente("voy despues de las 6", null)).toBeNull();
  });
});

describe("lo que SÍ es una cantidad se sigue leyendo", () => {
  it("las formas de siempre", () => {
    expect(extractExplicitQuantity("deme 4 llantas")).toBe(4);
    expect(extractExplicitQuantity("un juego")).toBe(4);
    expect(extractExplicitQuantity("juego de 5")).toBe(5);
    expect(extractExplicitQuantity("quiero las 4")).toBe(4);
    expect(extractExplicitQuantity("4")).toBe(4);
    expect(extractExplicitQuantity("necesito dos")).toBe(2);
  });

  it("«Nada menos. Por las 4 llatas» — con la falta de ortografía y todo (conv 11340)", () => {
    expect(extractExplicitQuantity("Nada menos. Por las 4 llatas")).toBe(4);
  });

  it("el número que llegó en su PROPIO mensaje sigue contando (caso J.F.R.C, 6-ago)", () => {
    // El agrupador de entrada pega los mensajes seguidos con «\n»
    // (pipeline/inbound.ts:102): «su propio mensaje» es «su propia línea».
    expect(extractExplicitQuantity("Las son para mi carro\n4")).toBe(4);
  });

  it("y la cantidad grande, que va por el otro detector", () => {
    expect(cantidadPedidaPorElCliente("quiero 20 llantas", null)).toBe(20);
  });

  it("el «2» del menú de preferencia sigue sin ser una cantidad", () => {
    const menu = "¿Qué prioriza usted?\n1) Costo\n2) Equilibrio\n3) Premium";
    expect(cantidadPedidaPorElCliente("2", menu)).toBeNull();
  });
});

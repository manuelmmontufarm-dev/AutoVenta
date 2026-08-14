/**
 * El candado de medida y el parser que lo alimenta.
 *
 * Caso real: chat 5499 del 13-ago-2026. El cliente escribió «265/70/16», el bot
 * derivó a una búsqueda por aro, presentó tres medidas distintas y firmó una
 * cotización de 225/70R16 por $499,04 — $82,84 menos que su medida real. Cuando
 * el cliente dijo «Esa medida», el bot le confirmó que sí era la suya.
 */
import { describe, expect, it } from "vitest";
import { extractTireSizes, formatTireSize } from "../src/domain/tireSize.js";
import {
  medidaEstaPedida, medidasDeProductos, medidasEnTexto, medidasPermitidas,
} from "../src/domain/medidaPedida.js";

const leer = (t: string) => extractTireSizes(t).map(formatTireSize);

describe("el parser entiende cómo escribe la gente la medida", () => {
  it("«265/70/16» — la forma con tres barras, la que rompió el 5499", () => {
    expect(leer("265/70/16")).toEqual(["265/70R16"]);
    expect(leer("Oh la 245/75/16")).toEqual(["245/75R16"]);
  });

  it("no rompe las formas que ya funcionaban", () => {
    expect(leer("225/70R16")).toEqual(["225/70R16"]);
    expect(leer("185/65 R14")).toEqual(["185/65R14"]);
    expect(leer("185 65 14")).toEqual(["185/65R14"]);
    expect(leer("185-65-14")).toEqual(["185/65R14"]);
    expect(leer("LT265/70R17")).toEqual(["265/70R17"]);
  });

  it("no confunde teléfonos, fechas ni fracciones con medidas", () => {
    expect(leer("0991855514")).toEqual([]);
    expect(leer("el 05/08/16 paso")).toEqual([]);
    expect(leer("llegue 12/08/2026")).toEqual([]);
    expect(leer("son 3/4 de pulgada")).toEqual([]);
  });
});

describe("qué medidas se le pueden firmar al cliente", () => {
  it("reúne lo que el cliente escribió con lo confirmado en la conversación", () => {
    const permitidas = medidasPermitidas(["265/70/16", "Oh la 245/75/16"], "265/70R16");
    expect(permitidas).toContain("265/70R16");
    expect(permitidas).toContain("245/75R16");
  });

  it("el caso 5499: la 225/70R16 NO estaba pedida y la 265/70R16 sí", () => {
    const permitidas = medidasPermitidas(
      ["Hola buenas tardes", "265/70/16", "Labrado mixto", "Menor precio dispone"],
      "265/70R16",
    );
    expect(medidaEstaPedida("225/70R16", permitidas)).toBe(false);
    expect(medidaEstaPedida("215/60R16", permitidas)).toBe(false);
    expect(medidaEstaPedida("245/70R16", permitidas)).toBe(false);
    expect(medidaEstaPedida("265/70R16", permitidas)).toBe(true);
  });

  it("la medida que el cliente pidió después también vale (aceptó la equivalencia)", () => {
    const permitidas = medidasPermitidas(["265/70/16", "245/75/16"], "265/70R16");
    expect(medidaEstaPedida("245/75R16", permitidas)).toBe(true);
  });

  it("sin ninguna medida pedida no se bloquea nada (llegó por vehículo o aro)", () => {
    const permitidas = medidasPermitidas(["Tengo una Hilux", "para rin 16"], null);
    expect(permitidas).toEqual([]);
    expect(medidaEstaPedida("265/65R17", permitidas)).toBe(true);
  });

  it("tolera la etiqueta larga del catálogo (LT y índices de carga)", () => {
    const permitidas = medidasPermitidas(["265/75/16"], null);
    expect(medidaEstaPedida("LT265/75R16 123/120S", permitidas)).toBe(true);
  });

  it("una llanta sin medida nunca pasa el candado", () => {
    expect(medidaEstaPedida(null, ["265/70R16"])).toBe(false);
  });
});

describe("medidas de un grupo de opciones", () => {
  it("detecta la pieza mezclada que vio el cliente del 5499", () => {
    const medidas = medidasDeProductos([
      { sizeLabel: "215/60R16" }, { sizeLabel: "245/70R16" }, { sizeLabel: "225/70R16" },
    ]);
    expect(medidas).toHaveLength(3);
  });

  it("un grupo de una sola medida se puede rotular con ella", () => {
    const medidas = medidasDeProductos([
      { sizeLabel: "265/70R16" }, { sizeLabel: "265/70R16" }, { sizeLabel: "265/70R16" },
    ]);
    expect(medidas).toEqual(["265/70R16"]);
  });
});

describe("medidasEnTexto", () => {
  it("lee también las de flotación", () => {
    expect(medidasEnTexto("tengo 33x12.50R17")).toEqual(["33X12.5R17"]);
  });
});

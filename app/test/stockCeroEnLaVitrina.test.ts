import { describe, expect, it } from "vitest";
import { JUEGO_COMPLETO, opcionesQueAlcanzan } from "../src/domain/opcionesCandados.js";

// Los tres productos del caso real: conv 11302, 195/55R15, 27-ago 14:02.
// La pieza salió rotulando dos de ellos «Sin stock».
const KR20 = { code: "KR20", stock: 2 };    // «Consultar»
const KR203 = { code: "KR203", stock: 0 };  // «Sin stock»
const R330 = { code: "R330", stock: 0 };    // «Sin stock»

describe("la vitrina no muestra lo que no se puede comprar", () => {
  it("con ninguna que alcance, solo salen las que TIENEN algo", () => {
    expect(opcionesQueAlcanzan([KR20, KR203, R330], JUEGO_COMPLETO)).toEqual([KR20]);
  });

  it("si ninguna tiene stock, la lista vuelve vacía y no se dibuja nada", () => {
    expect(opcionesQueAlcanzan([KR203, R330], JUEGO_COMPLETO)).toEqual([]);
  });

  it("cuando sí alcanzan, se prefieren esas y no las de stock corto", () => {
    const completa = { code: "FALKEN", stock: 12 };
    expect(opcionesQueAlcanzan([KR20, completa, KR203], JUEGO_COMPLETO)).toEqual([completa]);
  });

  it("el stock desconocido (null) sigue contando como cero, como antes", () => {
    expect(opcionesQueAlcanzan([{ code: "X", stock: null }], JUEGO_COMPLETO)).toEqual([]);
  });

  it("con una cantidad pedida menor, el listón baja con ella", () => {
    expect(opcionesQueAlcanzan([KR20, KR203], 2)).toEqual([KR20]);
  });
});

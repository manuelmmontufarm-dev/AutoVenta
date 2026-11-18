/**
 * La lámina de opciones y la lista escrita van en el MISMO orden (17-nov).
 *
 * Competimotor, 19:21: la imagen mostró General $92 · Opals $72 · Townhall $52
 * y el texto «1 · TOWNHALL … 2 · OPALS … 3 · GENERAL». «La 1» del cliente era la
 * última tarjeta de la imagen.
 */
import { describe, expect, it } from "vitest";
import { armarLista, ordenDeLaLista } from "../src/domain/listaDeOpciones.js";

const p = (code: string, nombre: string, precio: number) => ({ code, nombre, minimumPriceWithTax: precio });

describe("la lámina y el texto numeran igual", () => {
  it("el caso de Competimotor: la tarjeta de arriba es la 1 del texto", () => {
    const productos = [p("A", "GENERAL ALTIMAX", 92), p("B", "OPALS FH666", 72), p("C", "TOWNHALL TH-161", 52)];
    const lamina = ordenDeLaLista(productos).map((x) => x.nombre);
    const texto = armarLista(productos.map((x) => ({ nombre: x.nombre, precio: x.minimumPriceWithTax, codigo: x.code })), 4)!
      .map((l) => l.nombre);
    expect(lamina).toEqual(["TOWNHALL TH-161", "OPALS FH666", "GENERAL ALTIMAX"]);
    expect(lamina).toEqual(texto);
  });

  it("con dos al mismo precio, el empate sale igual en los dos", () => {
    const productos = [p("A", "HAIDA HD921", 73.6), p("B", "WINRUN R330", 73.6), p("C", "TOWNHALL TH161", 70.15)];
    const lamina = ordenDeLaLista(productos).map((x) => x.nombre);
    const texto = armarLista(productos.map((x) => ({ nombre: x.nombre, precio: x.minimumPriceWithTax, codigo: x.code })), 4)!
      .map((l) => l.nombre);
    expect(lamina).toEqual(texto);
  });

  it("no cambia el arreglo que recibe", () => {
    const productos = [p("A", "X", 3), p("B", "Y", 1)];
    ordenDeLaLista(productos);
    expect(productos.map((x) => x.code)).toEqual(["A", "B"]);
  });
});

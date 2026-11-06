import { describe, expect, it } from "vitest";
import { armarLista, lineaDeLista, listaDeLaPieza } from "../src/domain/listaDeOpciones.js";
import { segundaLlantaDe } from "../src/domain/promocionDeTemporada.js";
import { POLITICA_DEPOT } from "../src/negocio/politicas/depot.js";

// 6-nov, Manuel: «las opciones salían solo con el 25 %». La lista escrita dice
// la misma cuenta que la lámina y que firmará la cotización.
const NOVIEMBRE = new Date("2026-11-06T12:00:00-05:00");
const bf = (marca: string, precio: number, cantidad = 4) =>
  segundaLlantaDe(POLITICA_DEPOT.promocionDeTemporada, marca, cantidad, precio, NOVIEMBRE);

describe("la lista de opciones con Black Friday", () => {
  it("Falken y Kenda llevan la cuenta de la 2.ª llanta; Winrun sigue por unidad", () => {
    const lista = armarLista([
      { nombre: "KENDA KR601", precio: 181.69, codigo: "K", segundaLlanta: bf("KENDA", 181.69) },
      { nombre: "WINRUN R380", precio: 117.23, codigo: "W", segundaLlanta: bf("WINRUN", 117.23) },
      { nombre: "FALKEN WILDPEAK", precio: 210.08, codigo: "F", segundaLlanta: bf("FALKEN", 210.08) },
    ], 4)!;
    expect(lista.map((l) => l.total)).toEqual([468.92, 508.74, 588.22]);
    expect(lineaDeLista(lista[0], 4)).toBe("1 · WINRUN R380 — $117.23 c/u · 4 = $468.92");
    expect(lineaDeLista(lista[1], 4)).toBe("2 · KENDA KR601 — 2 × $181.69 + 2 × $72.68 = $508.74 (−60 % en la 2.ª llanta)");
  });

  it("lo guardado con la lámina se reconstruye igual (seguimientos y guardián)", () => {
    const metadata = {
      cantidad: 4,
      escalones: {
        economica: { codigo: "K", nombre: "KENDA KR601", precio_con_iva: 181.69, segunda_llanta: bf("KENDA", 181.69) },
        equilibrada: null,
        premium: { codigo: "F", nombre: "FALKEN WILDPEAK", precio_con_iva: 210.08, segunda_llanta: bf("FALKEN", 210.08) },
      },
    };
    const pieza = listaDeLaPieza(metadata)!;
    expect(pieza.lista.map((l) => l.total)).toEqual([508.74, 588.22]);
  });

  it("sin promo (fuera de fechas) la lista es la de siempre", () => {
    const fuera = segundaLlantaDe(POLITICA_DEPOT.promocionDeTemporada, "KENDA", 4, 181.69, new Date("2026-12-01T12:00:00-05:00"));
    const lista = armarLista([
      { nombre: "KENDA KR601", precio: 181.69, segundaLlanta: fuera },
      { nombre: "WINRUN R380", precio: 117.23 },
    ], 4)!;
    expect(lista.map((l) => l.total)).toEqual([468.92, 726.76]);
  });
});

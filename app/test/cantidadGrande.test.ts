/**
 * «SABE QUE QUIERO 20 LLANTAS EN VEZ» — conv 3 ciclo 9, producción, 27-ago 22:21.
 *
 * Lo que salió, textual:
 *
 *   CLIENTE: «sabe que quiero 20 llantas en vez»
 *   BOT:     «Para *20 llantas WINRUN MAXCLAW A/T 215/75R14* hay que actualizar
 *             la cotización antes de confirmarle el total. No le confirmo el
 *             precio final todavía para no darle un valor incorrecto.»
 *
 * Sin precio y sin siguiente paso. No fue el modelo inventando: era un tope de
 * 8 en el esquema de `generar_cotizacion` y en `extractExplicitQuantity`, que
 * nadie le había contado. La prueba está en el mismo chat — 30 s después
 * escribió «perdon deme 8 llantas» y se recotizó al instante.
 *
 * Regla de Manuel: con más de 8 se pregunta si escribió bien, y si dice que sí
 * no hay tope y se cotiza. El tope deja de ser un muro y pasa a ser una pregunta.
 */
import { describe, expect, it } from "vitest";
import {
  avisoDeCantidad, cantidadGrandePedida, esCantidadInusual, MAXIMO_NORMAL, MINIMO_NORMAL,
} from "../src/domain/cantidadGrande.js";
import { extractExplicitQuantity } from "../src/domain/salesIntent.js";

describe("notar el número raro sin tocar el extractor de siempre", () => {
  it("EL BUG: el mensaje real ahora SÍ se entiende", () => {
    const real = "sabe que quiero 20 llantas en vez";
    // El extractor de siempre sigue igual: 1–8 y nada más. No se tocó.
    expect(extractExplicitQuantity(real)).toBeNull();
    // El detector nuevo es el que lo nota.
    expect(cantidadGrandePedida(real)).toBe(20);
  });

  it("lee las formas en que la gente lo escribe", () => {
    expect(cantidadGrandePedida("quiero 12 llantas")).toBe(12);
    expect(cantidadGrandePedida("deme 20")).toBe(20);
    expect(cantidadGrandePedida("necesito 10 unidades")).toBe(10);
    expect(cantidadGrandePedida("póngame 16 llantas")).toBe(16);
  });

  it("EL CASO QUE NO DEBE DISPARAR: lo normal lo sigue atendiendo el extractor viejo", () => {
    for (const texto of ["perdon deme 8 llantas", "deme 4", "son 3", "quiero 2 llantas"]) {
      expect(cantidadGrandePedida(texto), texto).toBeNull();
      expect(extractExplicitQuantity(texto), texto).not.toBeNull();
    }
    expect(MAXIMO_NORMAL).toBe(8);
    expect(MINIMO_NORMAL).toBe(4);
  });

  it("no confunde horas ni medidas con cantidades", () => {
    expect(cantidadGrandePedida("paso a las 20")).toBeNull();
    expect(cantidadGrandePedida("215/75R14")).toBeNull();
    expect(cantidadGrandePedida("mi carro es del 2019")).toBeNull();
  });

  it("EL BORDE: un número absurdo no se ofrece a cotizar", () => {
    // 1000 llantas no es un cliente con un cero de más: es otra conversación.
    expect(cantidadGrandePedida("quiero 1000 llantas")).toBeNull();
    expect(cantidadGrandePedida("quiero 9 llantas")).toBe(9);
  });
});

/**
 * La primera versión PREGUNTABA («¿me confirma que son 20 llantas?»). Manuel la
 * probó y la bajó: «mejor que solo cotice, pero si son más de 8 o menos de 4
 * que diga en un mensaje corto "aquí le mando la cotización con X llantas"».
 * Preguntar cuesta un turno para llegar a la misma respuesta.
 */
describe("la cantidad rara se avisa, no se pregunta", () => {
  it("fuera del juego normal (4–8) se nombra el número", () => {
    for (const n of [1, 2, 3, 9, 12, 20]) expect(esCantidadInusual(n), String(n)).toBe(true);
  });

  it("EL CASO QUE NO DEBE DISPARAR: lo normal sale sin comentarios", () => {
    for (const n of [4, 5, 6, 7, 8]) expect(esCantidadInusual(n), String(n)).toBe(false);
  });

  it("el aviso es una AFIRMACIÓN corta, no una pregunta", () => {
    expect(avisoDeCantidad(9)).toBe("Aquí le mando la cotización con *9 llantas* 👍");
    expect(avisoDeCantidad(1)).toBe("Aquí le mando la cotización con *1 llanta* 👍");
    expect(avisoDeCantidad(20)).not.toContain("?");
  });
});

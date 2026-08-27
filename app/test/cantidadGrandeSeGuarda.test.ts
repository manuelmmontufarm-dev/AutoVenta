/**
 * «QUIERO 20 LLANTAS» TIENE QUE QUEDAR ANOTADO.
 *
 * Producción, 27-ago-2026 (conv 3). El cliente pidió 20 llantas. La ruta de
 * recotización sí lo entendió —`recotizar.ts` compone los dos detectores— pero
 * la FICHA de la conversación no: `index.ts` solo llamaba a
 * `extractExplicitQuantity`, que topa en 8, así que `selected_quantity` se
 * quedó en `null`.
 *
 * No es un dato decorativo. De esa cantidad depende `opcionesQueAlcanzan`, el
 * filtro que decide qué llantas se pueden ENSEÑAR como vendibles. Con la ficha
 * en blanco filtra contra el juego de 4 por defecto, y entonces una llanta con
 * 4 unidades en bodega se le ofrece a alguien que pidió 20.
 */
import { describe, expect, it } from "vitest";
import { cantidadPedidaPorElCliente } from "../src/domain/salesIntent.js";
import { opcionesQueAlcanzan } from "../src/domain/opcionesCandados.js";

/** El cierre de opciones, con la marca exacta que reconoce el candado del menú. */
const MENU_DE_PREFERENCIA =
  `¿Qué prioriza usted?\n1) Costo\n2) Equilibrio\n3) Premium`;

describe("la cantidad que el cliente pide queda en la ficha", () => {
  it("lee el número que no cabe en 1–8", () => {
    expect(cantidadPedidaPorElCliente("sabe que quiero 20 llantas en vez", null)).toBe(20);
  });

  it("sigue leyendo las cantidades normales", () => {
    expect(cantidadPedidaPorElCliente("deme 4 llantas", null)).toBe(4);
    expect(cantidadPedidaPorElCliente("un juego", null)).toBe(4);
  });

  it("el «2» del menú de preferencia sigue sin ser una cantidad", () => {
    // El candado que ya estaba: es el escalón, no dos llantas (conv 3, 27-ago).
    expect(cantidadPedidaPorElCliente("2", MENU_DE_PREFERENCIA)).toBeNull();
  });

  it("un mensaje sin cantidad no inventa ninguna", () => {
    expect(cantidadPedidaPorElCliente("¿tiene en 205/55R16?", null)).toBeNull();
  });

  it("no confunde la medida con una cantidad enorme", () => {
    expect(cantidadPedidaPorElCliente("busco 205/55R16", null)).toBeNull();
  });
});

describe("el filtro de opciones vendibles usa esa cantidad", () => {
  const CUATRO_EN_BODEGA = { code: "A", stock: 4 };
  const VEINTE_EN_BODEGA = { code: "B", stock: 20 };

  it("con 20 pedidas, la que tiene 4 en bodega deja de ser vendible", () => {
    const pedidas = cantidadPedidaPorElCliente("quiero 20 llantas", null);
    expect(pedidas).toBe(20);
    const vendibles = opcionesQueAlcanzan([CUATRO_EN_BODEGA, VEINTE_EN_BODEGA], pedidas!);
    expect(vendibles.map((o) => o.code)).toEqual(["B"]);
  });
});

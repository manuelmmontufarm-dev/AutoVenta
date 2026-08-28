/**
 * «QUIERO 20 LLANTAS» TIENE QUE SEGUIR TENIENDO UN RESPALDO.
 *
 * Producción, 27-ago-2026 (conv 3). El cliente pidió 20 llantas. La ruta de
 * recotización sí lo entendió —`recotizar.ts` compone los dos detectores— pero
 * la FICHA de la conversación no: `index.ts` solo llamaba a
 * `extractExplicitQuantity`, que topa en 8, así que `selected_quantity` se
 * quedó en `null`.
 *
 * No es un dato decorativo. De esa cantidad depende `opcionesQueAlcanzan`, el
 * filtro que decide qué llantas se pueden ENSEÑAR como vendibles. Hoy el camino
 * principal es `preparar_opciones.cantidad`; estas pruebas conservan el lector
 * como respaldo si el agente omite ese argumento y para la recotización directa.
 */
import { describe, expect, it } from "vitest";
import { cantidadPedidaPorElCliente } from "../src/domain/salesIntent.js";
import { opcionesQueAlcanzan } from "../src/domain/opcionesCandados.js";

/** El cierre de opciones, con la marca exacta que reconoce el candado del menú. */
const MENU_DE_PREFERENCIA =
  `¿Qué prioriza usted?\n1) Costo\n2) Equilibrio\n3) Premium`;

describe("el respaldo textual conserva cantidades inequívocas", () => {
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

  /*
   * EL VERBO PEGADO A LA MEDIDA, que es como escribe el cliente de verdad.
   *
   * El detector de cantidades grandes lee «<verbo> <número>», y la lista de
   * verbos incluye los mismos con los que se pide una medida: «quiero
   * 265/65R17» le daba 265. Mientras vivió solo en `recotizar.ts` casi no se
   * notaba —ahí hace falta una cotización viva para llegar—, pero cuando se
   * conectó a `index.ts` empezó a correr en el PRIMER mensaje, justo donde el
   * cliente escribe su medida y nada más. Ese cableado ya fue retirado; el caso
   * queda acá porque el respaldo sigue obligado a no confundirla.
   *
   * Y no es un dato que se quede quieto: `selected_quantity` entra en el
   * prompt del modelo como «Cantidad ya confirmada: 265 … cotiza», en los
   * hechos duros del Ángel Guardián, y sale al chat como «Aquí le mando la
   * cotización con *265 llantas*».
   */
  it("un verbo pegado a la medida no es una cantidad", () => {
    for (const texto of [
      "quiero 265/65R17",
      "necesito 235/70R15",
      "deme 225/65R17",
      "son 245/70R16",
      "cotizame 265/70R17",
      "llevo 195/65R15",
      "quiero las 285/60R18",
      "pongame 215/75R14",
      "quiero 33X12.50R20",
    ]) {
      expect(cantidadPedidaPorElCliente(texto, null), texto).toBeNull();
    }
  });

  it("la cantidad se sigue leyendo aunque venga con la medida", () => {
    expect(cantidadPedidaPorElCliente("quiero 20 llantas 265/65R17", null)).toBe(20);
    expect(cantidadPedidaPorElCliente("deme 4 llantas en 205/55R16", null)).toBe(4);
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

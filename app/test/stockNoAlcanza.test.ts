/**
 * LA RAYA ENTRE «FALTA UNA» Y «NO HAY».
 *
 * Tres arreglos de stock en tres días y el error volvió igual, porque los tres
 * vivían en capas distintas y ninguno decía que no:
 *
 *   25-ago  Joaquín: «hay una medida con UNA unidad y el bot cotiza las 4».
 *   26-ago  se hace el aviso, que VIAJA con la cotización.        (conv 11061)
 *   27-ago  la vitrina deja de mostrar las de stock cero.         (conv 11302)
 *   27-ago  conv 11720: 215/50R17, UNA unidad, cotización firmada por
 *           4 × $105.88 = $423.52 — con el aviso pegado detrás.
 *
 * El aviso salió. La alerta se creó. Y el cliente igual se llevó un papel por
 * cuatro llantas que no existen. Esta es la función que reconcilia la decisión
 * de Joaquín («con 3 de 4 no se bloquea, el stock de Contífico viene
 * desfasado») con su propio ejemplo de lo que estaba mal.
 */
import { describe, expect, it } from "vitest";
import { alcanzaParaVender, minimoParaVender } from "../src/domain/stockCorto.js";
import { opcionesQueAlcanzan } from "../src/domain/opcionesCandados.js";

describe("alcanzaParaVender · la mitad de lo pedido", () => {
  it("EL CASO QUE FALLÓ: 1 de 4 no alcanza", () => {
    expect(alcanzaParaVender(1, 4)).toBe(false);
  });

  it("EL CASO QUE NO DEBE DISPARAR: 3 de 4 sí, que es la regla de Joaquín", () => {
    expect(alcanzaParaVender(3, 4)).toBe(true);
    expect(alcanzaParaVender(4, 4)).toBe(true);
    expect(alcanzaParaVender(9, 4)).toBe(true);
  });

  it("EL BORDE: la mitad justa alcanza", () => {
    expect(minimoParaVender(4)).toBe(2);
    expect(alcanzaParaVender(2, 4)).toBe(true);
    // Y con 2 pedidas, 1 es la mitad: alcanza.
    expect(alcanzaParaVender(1, 2)).toBe(true);
    // Con 6 pedidas hacen falta 3.
    expect(alcanzaParaVender(3, 6)).toBe(true);
    expect(alcanzaParaVender(2, 6)).toBe(false);
  });

  it("el cero nunca alcanza, ni pidiendo una", () => {
    expect(alcanzaParaVender(0, 1)).toBe(false);
    expect(alcanzaParaVender(0, 4)).toBe(false);
  });

  it("EL PEDIDO DE FLOTA se sale de la regla: 8 de 20 pasa", () => {
    // No es una promesa falsa: es un pedido que termina el asesor con el
    // proveedor. Bloquearlo mataría la venta más grande del mes.
    expect(alcanzaParaVender(8, 20)).toBe(true);
    expect(alcanzaParaVender(1, 20)).toBe(true);
    // Justo en el tope del juego grande la regla todavía manda.
    expect(alcanzaParaVender(2, 8)).toBe(false);
    expect(alcanzaParaVender(4, 8)).toBe(true);
  });
});

describe("la vitrina no enseña lo que no se puede comprar", () => {
  const llanta = (code: string, stock: number) => ({ code, stock });

  it("EL CASO QUE FALLÓ: en 215/50R17 la única con 1 unidad no entra", () => {
    expect(opcionesQueAlcanzan([llanta("K224B707", 1)], 4)).toEqual([]);
  });

  it("si alguna alcanza de sobra, la red ni se usa", () => {
    const opciones = [llanta("A", 9), llanta("B", 1)];
    expect(opcionesQueAlcanzan(opciones, 4).map((p) => p.code)).toEqual(["A"]);
  });

  it("la red baja el listón hasta la mitad, no hasta uno", () => {
    const opciones = [llanta("A", 3), llanta("B", 2), llanta("C", 1), llanta("D", 0)];
    expect(opcionesQueAlcanzan(opciones, 4).map((p) => p.code)).toEqual(["A", "B"]);
  });
});

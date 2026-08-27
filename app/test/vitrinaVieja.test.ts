/**
 * LA VITRINA VIEJA NO SE RE-ETIQUETA CON LA MEDIDA NUEVA — conv 11881, 27-ago.
 *
 * El cliente escribió «Ron 15» (el aro) y salió una MUESTRA por aro, guardada
 * con `sizeLabel: null` justamente porque NO es su medida. Cincuenta minutos
 * después dio la medida completa y el bot escribió: «Perfecto, en *225/70R15*
 * ya le envié estas opciones: *Costo* WINRUN R330 $58.69 c/u…». Esa R330 es el
 * código `1855515WNR330` — una 185/55R15. El cliente eligió el precio más
 * barato de esa lista («Las den58,69») y el bot tuvo que desdecirse: «esa
 * opción de $58.69 no corresponde a su medida, fue un cruce de medidas».
 */
import { describe, expect, it } from "vitest";
import { ordenDeNoReusarLaVitrina, vitrinaQueNoEsSuMedida } from "../src/domain/vitrinaVieja.js";

const MUESTRA_POR_ARO = {
  sizeLabel: null,
  etiquetas: ["FALKEN WILDPEAK A/T 4W", "KENDA KR20", "WINRUN R330"],
};

describe("vitrinaQueNoEsSuMedida", () => {
  it("EL CASO QUE FALLÓ: la muestra por aro no es la medida que dio después", () => {
    expect(vitrinaQueNoEsSuMedida(MUESTRA_POR_ARO, "225/70R15")).toEqual(MUESTRA_POR_ARO);
  });

  it("una pieza de OTRA medida también avisa", () => {
    const otra = { sizeLabel: "185/55R15", etiquetas: ["WINRUN R330"] };
    expect(vitrinaQueNoEsSuMedida(otra, "225/70R15")).toEqual(otra);
  });

  it("EL CASO QUE NO DEBE DISPARAR: la pieza es de su medida", () => {
    const suya = { sizeLabel: "225/70R15", etiquetas: ["KENDA KR33A"] };
    expect(vitrinaQueNoEsSuMedida(suya, "225/70R15")).toBeNull();
    // Y escrita de otra forma sigue siendo la misma medida.
    expect(vitrinaQueNoEsSuMedida(suya, "225/70 R15")).toBeNull();
    expect(vitrinaQueNoEsSuMedida({ sizeLabel: "225/70R15", etiquetas: [] }, "225/70/15")).toBeNull();
  });

  it("sin pieza previa o sin medida pedida no hay nada que advertir", () => {
    expect(vitrinaQueNoEsSuMedida(null, "225/70R15")).toBeNull();
    expect(vitrinaQueNoEsSuMedida(MUESTRA_POR_ARO, null)).toBeNull();
    expect(vitrinaQueNoEsSuMedida(MUESTRA_POR_ARO, "  ")).toBeNull();
  });
});

describe("la orden que se le mete al turno", () => {
  it("nombra la medida, prohíbe la frase exacta que salió, y manda a buscar", () => {
    const orden = ordenDeNoReusarLaVitrina(MUESTRA_POR_ARO, "225/70R15");
    expect(orden).toMatch(/MUESTRA por aro/);
    expect(orden).toMatch(/en 225\/70R15 ya le envié estas opciones/);
    expect(orden).toMatch(/PROHIBIDO repetir esos precios/);
    expect(orden).toMatch(/buscar_llanta/);
    expect(orden).toMatch(/preparar_opciones/);
    // Y nombra lo que el cliente vio, para que el modelo sepa de qué habla.
    expect(orden).toMatch(/WINRUN R330/);
  });

  it("cuando la pieza sí tenía medida, la dice", () => {
    const orden = ordenDeNoReusarLaVitrina(
      { sizeLabel: "185/55R15", etiquetas: ["WINRUN R330"] }, "225/70R15",
    );
    expect(orden).toMatch(/de \*185\/55R15\*/);
  });
});

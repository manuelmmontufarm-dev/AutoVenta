import { describe, expect, it } from "vitest";
import { cantidadDelTexto, esRespuestaDelMenuDePreferencia, MARCA_DEL_MENU } from "../src/domain/salesIntent.js";

const MENU = `${MARCA_DEL_MENU}\n1) Costo\n2) Equilibrio\n3) Premium`;
const MAPAS = "Depot Tire Cumbayá: https://maps.example/c\nDepot Tire Quito Sur: https://maps.example/s";

describe("el menú puede estar en cualquier bloque del turno anterior", () => {
  it("el bloque de mapas no tapa el menú", () => {
    // Chat 18134: el menú salió antes de mapas y el «2» se cotizó como cantidad.
    expect(esRespuestaDelMenuDePreferencia("2", `${MENU}\n${MAPAS}`)).toBe(true);
  });

  it("sin menú, el 2 sigue siendo una cantidad posible", () => {
    // Chat 18182: contraste sano; el contexto, no el número, decide.
    expect(esRespuestaDelMenuDePreferencia("2", MAPAS)).toBe(false);
  });
});

/**
 * UN NÚMERO NO PUEDE SER LAS DOS COSAS EN EL MISMO TURNO.
 *
 * Chat 18134 (9-sep), verificado contra producción: el menú SÍ se reconocía
 * —viajaba dentro del mensaje de ubicaciones y el detector lo encontraba—, así
 * que el «2» eligió bien el escalón de equilibrio. El daño vino después: ese
 * mismo «2» se leyó OTRA VEZ, ahora como cantidad, al armar la cotización.
 *
 *   BOT: «La opción *de equilibrio* es la *KENDA KR29* — *$270.78 c/u con IVA*.
 *         Le dejo la cotización por *2 llantas* 👍»
 *
 * Las dos lecturas del mismo número en una frase. Salió COT-MTUNZ1XY por
 * $541.56 y el cliente había pedido el juego. Un número consumido como escalón
 * ya no está disponible para la cantidad.
 */
describe("el número que eligió el escalón ya no es una cantidad", () => {
  const MENU3 = `${MARCA_DEL_MENU}\n1) Costo\n2) Equilibrio\n3) Premium`;

  it("chat 18134: con el menú en pantalla, «2» elige equilibrio y NO pide 2 llantas", () => {
    expect(cantidadDelTexto("2", MENU3, null)).toBeNull();
  });

  it("los tres números del menú se comportan igual", () => {
    for (const n of ["1", "2", "3"]) expect(cantidadDelTexto(n, MENU3, null)).toBeNull();
  });

  it("una cantidad dicha con palabras SÍ cuenta, aunque haya menú", () => {
    // «deme la premium, 2 llantas» tiene las dos cosas y las dos valen.
    expect(cantidadDelTexto("deme la premium, 2 llantas", MENU3, null)).toBe(2);
    expect(cantidadDelTexto("quiero 3 llantas", MENU3, null)).toBe(3);
  });

  it("sin menú previo, el número pelado sigue siendo cantidad (chat 18182)", () => {
    expect(cantidadDelTexto("2", MAPAS, null)).toBe(2);
  });

  it("el reply manda: «2» citando la cotización es cantidad, citando el menú no", () => {
    expect(cantidadDelTexto("2", MAPAS, MENU3)).toBeNull();
    expect(cantidadDelTexto("2", MENU3, "Cotización COT-X enviada por $541.56")).toBe(2);
  });
});

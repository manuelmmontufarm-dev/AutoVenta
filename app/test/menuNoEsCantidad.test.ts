import { describe, expect, it } from "vitest";
import { esRespuestaDelMenuDePreferencia, MARCA_DEL_MENU } from "../src/domain/salesIntent.js";

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

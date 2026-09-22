/**
 * ELEGIR ES COTIZAR, TAMBIÉN CUANDO LO ESCRIBEN CON ARTÍCULO O CON FALTA.
 *
 * Producción, 19–21 sep-2026: de 58 correcciones «pregunta_de_mas» del guardián
 * en dos días, la mayoría eran el modelo pidiendo permiso para cotizar a un
 * cliente que YA había elegido. La ruta fija no lo agarraba porque el lector
 * del menú no reconocía cómo lo escriben de verdad:
 *   conv 21449 · «La opción 3»
 *   conv 18282 · «Premiun»
 */
import { describe, expect, it } from "vitest";
import { autorizaCotizacionEnEsteTurno, respuestaDePreferencia } from "../src/domain/salesIntent.js";

describe("respuestaDePreferencia lee el menú como lo escribe la gente", () => {
  it.each([
    ["La opción 3", "premium"],
    ["Buenas tardes. La opción 3", "premium"],
    ["Premiun", "premium"],
    ["la tercera", "premium"],
    ["el número 2", "equilibrada"],
    ["la primera", "precio"],
    ["opción 2", "equilibrada"],
    ["3", "premium"],
  ] as const)("«%s» → %s", (texto, escalon) => {
    expect(respuestaDePreferencia(texto)).toBe(escalon);
    expect(autorizaCotizacionEnEsteTurno(texto)).toBe(true);
  });

  it.each(["quiero 3 llantas", "1 llanta", "Opc", "premio", "4", "las 3 opciones"])("«%s» no es el menú", (texto) => {
    expect(respuestaDePreferencia(texto)).toBeNull();
  });
});

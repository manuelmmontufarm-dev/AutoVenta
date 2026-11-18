/**
 * 17-nov-2026: el conocimiento de producto de Depot (seguro 18/12/6 meses, km,
 * «la alineación va incluida») vivía en la carpeta común de assets y también
 * le llegaba al bot de Competimotor. Es dato del cliente: sin archivo propio,
 * el negocio no recibe nada.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
const { conocimientoParaElTurno } = await import("../src/domain/conocimientoProducto.js");

describe("conocimiento de producto por cliente", () => {
  it("Competimotor no recibe el conocimiento de Depot", () => {
    const hecho = conocimientoParaElTurno("Y el balanceo y alineación es aparte?") ?? "";
    expect(hecho).not.toMatch(/18 meses|86\.500|ALINEACIÓN Y BALANCEO/);
  });
});

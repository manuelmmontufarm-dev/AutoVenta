import { describe, expect, it } from "vitest";
import { buildContextualFollowUpMessage, followUpNeedsStoreLinks } from "../src/domain/followUpMessages.js";
import { CIERRE_COMPRA_A_DISTANCIA } from "../src/domain/compraADistancia.js";

/**
 * EL SEGUIMIENTO DE QUIEN COMPRA A DISTANCIA NO LLEVA MAPAS (familia 2-E,
 * verificación en vivo del 28-sep: 6 de 6 borradores de seguimiento traían
 * los dos links pegados y el guardián los tuvo que quitar).
 */
const MAPAS =
  "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/QnMBPXKc1o8igbsp8\n📍 *Depot Tire Quito Sur*: https://maps.app.goo.gl/NQeNN8csyAnRkJDJ7";

const REMOTO = {
  stage: "seguimiento_venta" as const,
  tireSize: "245/60R18",
  selectedProductCode: "FALK24560",
  selectedProductLabel: "FALKEN ZIEX CT60 A/S",
  quoteNumber: "COT-MUACNNXU",
  nearestStore: "Depot Tire Cumbayá",
  storeLinks: MAPAS,
  sinVisita: "compra_a_distancia" as const,
};

describe("seguimiento de una compra a distancia", () => {
  it("no pide mapas aunque haya cotización y falte el día", () => {
    expect(followUpNeedsStoreLinks(REMOTO, "in_window_first")).toBe(false);
    expect(followUpNeedsStoreLinks({ ...REMOTO, sinVisita: "fuera_de_cobertura" }, "in_window_second")).toBe(false);
  });

  it("habla de pago y envío, no de visita", () => {
    for (const kind of ["in_window_first", "in_window_second"] as const) {
      const texto = buildContextualFollowUpMessage(REMOTO, kind);
      expect(texto).toContain(CIERRE_COMPRA_A_DISTANCIA);
      expect(texto).not.toMatch(/maps\.app|goo\.gl/);
      expect(texto).not.toMatch(/qué día|cuál local|pasar por|su visita/i);
    }
  });

  it("quien viene al local sigue recibiendo sus mapas", () => {
    const { sinVisita: _nada, ...visita } = REMOTO;
    expect(followUpNeedsStoreLinks(visita, "in_window_first")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  hechoDePromocionesDelPanel,
  promocionesDelPanelDeHoy,
  resumenDePromocionesDelPanel,
} from "../src/domain/promocionesComoHecho.js";
import type { Promocion } from "../src/domain/promociones.js";
import { hechoDeTemporadaParaElVendedor, resumenDeLaPromocion } from "../src/services/hechosDeTemporada.js";

const AHORA = new Date("2026-11-25T15:00:00-05:00");
const promo = (p: Partial<Promocion>): Promocion => ({
  id: 9, nombre: "Winrun 4x3", tipo: "nxm", textoExtra: null, activa: true, desde: null, hasta: "2026-11-30",
  parametros: { lleva: 4, paga: 3 }, filas: [{ codigo: "W1", medida: null }, { codigo: "W2", medida: null }],
  origen: "panel", creadaEn: "", actualizadaEn: "", ...p,
});
const SIEMPRE = promo({ id: 1, nombre: "Descuento de siempre", tipo: "porcentaje", parametros: { todas: true, porcentaje: 25 }, filas: [], origen: "politica:descuento-de-siempre", hasta: null });
const marcaDe = (c: string) => (c.startsWith("W") ? "WINRUN" : c.startsWith("K") ? "KENDA" : null);
const entrada = (promos: Promocion[]) => ({ promos, descuentoDeSiempre: 25, marcaDe, ahora: AHORA });

describe("las promociones del panel como hecho del bot (25-nov-2026)", () => {
  it("el 4x3 de Winrun sale con su regla, la marca y que se SUMA con el 25 %", () => {
    const h = hechoDePromocionesDelPanel(entrada([SIEMPRE, promo({})]))!;
    expect(h).toContain("«Winrun 4x3»: 4x3: lleva 4 y paga 3, en 2 llantas Winrun, hasta el lunes 30 de noviembre");
    expect(h).toContain("Se SUMAN: primero el 25 %");
    expect(h).toContain("nombra TAMBIÉN estas");
    expect(hechoDePromocionesDelPanel(entrada([promo({})]), "revisor")).toContain("NO es error");
  });

  it("el descuento de siempre, la de temporada, las apagadas, vencidas y programadas no entran", () => {
    const bf = promo({ id: 2, tipo: "enesima", parametros: { temporada: true, posicion: 2, porcentaje: 60 }, origen: "politica:temporada" });
    const apagada = promo({ id: 3, activa: false });
    const vencida = promo({ id: 4, hasta: "2026-11-20" });
    const programada = promo({ id: 5, desde: "2026-12-01", hasta: null });
    expect(promocionesDelPanelDeHoy([SIEMPRE, bf, apagada, vencida, programada], AHORA)).toEqual([]);
    expect(hechoDePromocionesDelPanel(entrada([SIEMPRE, bf, apagada]))).toBeNull();
  });

  it("cada tipo se dice en palabras", () => {
    const tipos = [
      promo({ nombre: "Kenda 2.ª", tipo: "enesima", parametros: { posicion: 2, porcentaje: 50 }, filas: [{ codigo: "K1", medida: null }] }),
      promo({ nombre: "Por cantidad", tipo: "escalonado", parametros: { escalones: [{ desde: 4, porcentaje: 10 }, { desde: 2, porcentaje: 5 }] } }),
      promo({ nombre: "Kenda 20", tipo: "porcentaje", parametros: {}, filas: [{ codigo: "K1", medida: null, porcentaje: 20 }] }),
      promo({ nombre: "Alineación", tipo: "regalo", parametros: { regalo: "alineación gratis" } }),
    ];
    const h = hechoDePromocionesDelPanel(entrada(tipos))!;
    expect(h).toContain("«Kenda 2.ª»: 50 % menos en la 2.ª llanta, en 1 llanta Kenda");
    expect(h).toContain("2 llantas o más: 5 % menos · 4 llantas o más: 10 % menos");
    expect(h).toContain("«Kenda 20»: 20 % menos por llanta");
    expect(h).toContain("de regalo: alineación gratis");
    expect(resumenDePromocionesDelPanel(entrada([promo({})]))).toBe("«Winrun 4x3» en Winrun (4x3: lleva 4 y paga 3)");
  });

  it("entra al hecho del vendedor y al resumen de «¿tienen promociones?», con o sin temporada", () => {
    const panel = { promos: [SIEMPRE, promo({})], descuentoDeSiempre: 25, marcaDe };
    expect(hechoDeTemporadaParaElVendedor({ ahora: AHORA, panel })).toContain("«Winrun 4x3»");
    expect(hechoDeTemporadaParaElVendedor({ ahora: AHORA, promo: null, panel })).toContain("«Winrun 4x3»");
    expect(hechoDeTemporadaParaElVendedor({ ahora: AHORA, promo: null, panel: null })).toBeNull();
    const resumen = resumenDeLaPromocion({ ahora: AHORA, panel });
    if (resumen) expect(resumen).toContain("Además: «Winrun 4x3» en Winrun");
  });
});

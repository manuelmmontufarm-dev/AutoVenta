/**
 * «GRACIAS» DESPUÉS DE UNA OFERTA ES UN SÍ.
 *
 * Producción, 27-ago-2026, conv 11070, con los textos reales:
 *
 *   10:00  BOT: «La más económica en 245/70R16 es *KENDA KR628* a *$144.44 c/u
 *          con IVA*. Se la puedo cotizar por *4 llantas*…»
 *   10:00  CLIENTE: «Gracias»
 *   10:00  BOT: «Con gusto 😊 Si desea, le dejo la cotización formal por
 *          *4 llantas KENDA KR628*…»
 *
 * Dos turnos, la misma oferta, cero cotizaciones.
 */
import { describe, expect, it } from "vitest";
import { ofertaDeCotizarAceptada, ordenDeCotizarYa } from "../src/domain/ofertaAceptada.js";

const OFERTA_REAL =
  "La más económica en 245/70R16 es *KENDA KR628* a *$144.44 c/u con IVA*.\n" +
  "Se la puedo cotizar por *4 llantas*; si prefiere equilibrio o premium, también le paso esa.";

describe("el «gracias» que era un sí", () => {
  it("EL CASO QUE FALLÓ: la oferta real de la conv 11070 con «Gracias»", () => {
    expect(ofertaDeCotizarAceptada(OFERTA_REAL, "Gracias")).toBe(true);
  });

  it("los otros acuses que la gente escribe", () => {
    for (const acuse of [
      "gracias", "Gracias!", "muchas gracias", "ok", "Okey", "listo", "dale",
      "ya", "bueno", "perfecto", "claro", "de una", "hagale", "porfa", "👍",
      "si", "grax", "gracias amigo",
    ]) expect(ofertaDeCotizarAceptada(OFERTA_REAL, acuse), acuse).toBe(true);
  });

  it("EL CASO QUE NO DEBE DISPARAR: sin oferta previa, un «gracias» es solo un gracias", () => {
    expect(ofertaDeCotizarAceptada("¿A cuál local le queda mejor ir?", "Gracias")).toBe(false);
    expect(ofertaDeCotizarAceptada(null, "Gracias")).toBe(false);
    // Y un mensaje del bot que ya cotizó tampoco es una oferta.
    expect(ofertaDeCotizarAceptada("Aquí le mando su cotización 👍", "Gracias")).toBe(false);
  });

  it("EL BORDE: un «gracias» con algo más NO es una aceptación a secas", () => {
    // Trae una pregunta que hay que contestar; forzar la cotización sería
    // ignorarla, que es justo el otro error del guardián.
    expect(ofertaDeCotizarAceptada(OFERTA_REAL, "gracias, ¿y en aro 17 tienen?")).toBe(false);
    expect(ofertaDeCotizarAceptada(OFERTA_REAL, "gracias pero mejor 2 llantas")).toBe(false);
    // Y la despedida la agarra cierrePerdido.ts, no esto.
    expect(ofertaDeCotizarAceptada(OFERTA_REAL, "Gracias ya compré en otro lugar")).toBe(false);
  });

  it("un no corto sigue siendo un no", () => {
    for (const no of ["no", "No gracias", "todavia no", "mejor no", "otro dia", "luego"]) {
      expect(ofertaDeCotizarAceptada(OFERTA_REAL, no), no).toBe(false);
    }
  });

  it("la orden que se le mete al modelo le prohíbe volver a ofrecer", () => {
    const orden = ordenDeCotizarYa("Gracias");
    expect(orden).toMatch(/generar_cotizacion AHORA/);
    expect(orden).toMatch(/PROHIBIDO volver a ofrec/);
    expect(orden).toMatch(/«Gracias»/);
  });
});

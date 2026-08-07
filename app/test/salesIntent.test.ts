import { describe, expect, it } from "vitest";
import {
  canGenerateFinalQuote,
  extractExplicitQuantity,
  extractVehicleYear,
  hasExplicitQuantity,
  isComparisonRequest,
  isExplicitPurchaseConfirmation,
  isNegativeResponse,
} from "../src/domain/salesIntent.js";

describe("guardas del flujo comercial", () => {
  it("bloquea cotización durante una comparación", () => {
    expect(isComparisonRequest("cuál es mejor entre la Falken y la Kendal")).toBe(true);
    expect(canGenerateFinalQuote("compara estas 3", true)).toBe(false);
  });

  it("exige una cantidad explícita", () => {
    expect(hasExplicitQuantity("quiero tres llantas")).toBe(true);
    expect(canGenerateFinalQuote("la Kenda por favor")).toBe(false);
    expect(canGenerateFinalQuote("quiero 3 llantas Kenda")).toBe(true);
  });

  it("recuerda una cantidad aislada sin confundirla con el año", () => {
    expect(extractExplicitQuantity("4")).toBe(4);
    expect(extractExplicitQuantity("quiero cuatro llantas")).toBe(4);
    expect(extractExplicitQuantity("Chevrolet Trooper 2002")).toBeNull();
    expect(canGenerateFinalQuote("sí, esa", false, true)).toBe(true);
  });

  it("extrae un año vehicular ya informado", () => {
    expect(extractVehicleYear("las que le entren a mi 2002 trooper")).toBe(2002);
    expect(extractVehicleYear("medida 245/75R16")).toBeNull();
  });

  it("solo cierra ganado ante compra ya realizada", () => {
    expect(isExplicitPurchaseConfirmation("ok ya compré las llantas, gracias")).toBe(true);
    expect(isExplicitPurchaseConfirmation("quiero comprar las llantas")).toBe(false);
  });
});

/**
 * Casos REALES de los chats del 6-ago que motivaron el cambio: el bot pedía
 * confirmar la cantidad una y otra vez porque esperaba un «sí» con formato de
 * máquina. Cada expectativa de abajo es un mensaje que un cliente escribió.
 */
describe("cantidad: cómo pide la gente en un chat de llantera", () => {
  it("«juego» son 4 llantas — es el modismo de toda llantera del Ecuador", () => {
    expect(extractExplicitQuantity("juego de llantas 225-65-17")).toBe(4);
    // Y si el cliente dice el número al lado, manda el número, no el modismo.
    expect(extractExplicitQuantity("Juego de 4 llantas Cotocollao")).toBe(4);
  });

  it("lee «las/los N» con verbo o sin él (caso Rodrigo: quería cambiar 5)", () => {
    expect(extractExplicitQuantity("quiero cambiar las 5")).toBe(5);
    expect(extractExplicitQuantity("las 4")).toBe(4);
  });

  it("lee el número suelto en el borde del mensaje agrupado (caso J.F.R.C)", () => {
    // El agrupador de entrada pega mensajes seguidos en un solo texto; el «4»
    // que el cliente mandó aparte quedaba invisible al final de la frase.
    expect(extractExplicitQuantity("La son para mi carro 4")).toBe(4);
    expect(extractExplicitQuantity("4")).toBe(4);
  });

  it("no confunde años ni medidas con cantidades", () => {
    expect(extractExplicitQuantity("Chevrolet Trooper 2002")).toBeNull();
    expect(extractExplicitQuantity("265/70/17 AT")).toBeNull();
  });

  it("«paso a las 3» es una hora, no 3 llantas", () => {
    // Las horas se quitan antes del fallback de número-al-borde: sin esto, el
    // cliente que anuncia su hora de visita quedaba con cotización de 3.
    expect(extractExplicitQuantity("paso a las 3")).toBeNull();
    expect(extractExplicitQuantity("llego tipo 5")).toBeNull();
    expect(extractExplicitQuantity("voy a eso de las 4")).toBeNull();
    // Pero una cantidad real al borde sigue viva:
    expect(extractExplicitQuantity("las son para mi carro 4")).toBe(4);
  });
});

/**
 * Regla de venta del 6-ago: si no es un NO, es un sí. Rodrigo dijo «Si»,
 * «quiero cambiar las 5» y «La de emergencia también», y el bot le pidió
 * confirmar CUATRO veces. Solo una negativa clara puede frenar la cotización.
 */
describe("isNegativeResponse", () => {
  it("reconoce la negativa y el aplazamiento", () => {
    expect(isNegativeResponse("no gracias")).toBe(true);
    expect(isNegativeResponse("todavía no")).toBe(true);
    expect(isNegativeResponse("déjeme pensarlo")).toBe(true);
  });

  it("no lee como negativa lo que es un sí o un comentario", () => {
    expect(isNegativeResponse("Si por favor")).toBe(false);
    expect(isNegativeResponse("La de emergencia tambien")).toBe(false);
    expect(isNegativeResponse("ok")).toBe(false);
    // «no hay problema» lleva un «no» pero es asentir: la excepción explícita.
    expect(isNegativeResponse("no hay problema")).toBe(false);
  });
});

describe("canGenerateFinalQuote: cotizar salvo comparación o negativa", () => {
  it("un «Si» seco basta cuando la cantidad ya está confirmada", () => {
    expect(canGenerateFinalQuote("Si", false, true)).toBe(true);
    expect(canGenerateFinalQuote("dale", false, true)).toBe(true);
  });

  it("un número suelto basta aunque no haya cantidad guardada", () => {
    expect(canGenerateFinalQuote("4", false, false)).toBe(true);
  });

  it("una negativa frena la cotización aunque la cantidad esté confirmada", () => {
    expect(canGenerateFinalQuote("no gracias", false, true)).toBe(false);
  });

  it("una comparación frena la cotización: primero se responde la duda", () => {
    expect(canGenerateFinalQuote("cuál es mejor", false, true)).toBe(false);
    // comparedThisTurn: el cliente comparó en este mismo turno y ya dijo «dale»;
    // cotizar aquí pisaría la comparación que todavía no llegó a sus ojos.
    expect(canGenerateFinalQuote("dale", true, true)).toBe(false);
  });
});

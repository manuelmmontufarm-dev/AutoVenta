/**
 * «CHUTA TA CARISISIMO OE» — conv 3, producción, 27-ago 22:30.
 *
 * El cliente tenía cotizadas 8 llantas por $821.53 y se quejó del precio. El
 * clasificador lo leyó como venta perdida:
 *
 *   02:30:24  cotizacion_enviada → perdido  «Clasificación del último mensaje»
 *
 * Cerrar deja la conversación en `closed`, y el mensaje siguiente («yo vivo en
 * manabi») la reabrió en un CICLO NUEVO: sin medida, sin producto, sin
 * cantidad y sin cotización. Dos mensajes después el bot le pidió la medida que
 * ya tenía. Manuel: «hasta regresó a pedirme la medida que ya sabía».
 *
 * O sea: una queja de precio le borró la venta al cliente. Y quejarse del
 * precio es la objeción más común del oficio — el turno donde un vendedor
 * recién empieza a trabajar.
 */
import { describe, expect, it } from "vitest";
import { puedeCerrarComoPerdido } from "../src/domain/cierrePerdido.js";
import { isExplicitPurchaseConfirmation } from "../src/domain/salesIntent.js";

describe("una queja de precio no cierra una venta", () => {
  it("EL BUG: el mensaje real ya no puede cerrar la conversación", () => {
    expect(puedeCerrarComoPerdido("chuta ta carisisimo oe")).toBe(false);
  });

  it("ni las otras formas de decir que está caro", () => {
    for (const texto of [
      "uf que caro", "esta muy caro para mi", "no me alcanza",
      "es mucha plata", "se pasa de precio", "está fuera de mi presupuesto",
    ]) expect(puedeCerrarComoPerdido(texto), texto).toBe(false);
  });

  it("ni preguntar, ni pedir tiempo dentro de la conversación", () => {
    expect(puedeCerrarComoPerdido("y son buenas para montaña?")).toBe(false);
    expect(puedeCerrarComoPerdido("cuanto se demoran en montarlas")).toBe(false);
  });
});

describe("un rechazo de verdad sí cierra", () => {
  it("los que dicen que no siguen", () => {
    for (const texto of [
      "no me interesa", "no gracias", "ya compre en otro lado",
      "deje de escribirme", "no me escriban mas", "mejor no",
      "solo estoy preguntando",
    ]) expect(puedeCerrarComoPerdido(texto), texto).toBe(true);
  });

  it("EL BORDE: rechazo Y queja de precio juntos — manda el rechazo", () => {
    // «No me interesa, muy caro» es un no, aunque explique el motivo.
    expect(puedeCerrarComoPerdido("no me interesa, muy caro")).toBe(true);
    // Pero «está muy caro» solo, no.
    expect(puedeCerrarComoPerdido("está muy caro")).toBe(false);
  });
});

/**
 * Cazado escribiendo la prueba de arriba: «ya compre en otro lado» caía en el
 * patrón de «ya compré» y la conversación se marcaba GANADO. Un cliente que se
 * fue a la competencia entrando al conteo de ventas del negocio — el error más
 * caro de los dos, porque ensucia el número con el que se mide el bot.
 */
describe("comprar en otro lado no es una venta ganada", () => {
  it("EL BUG: irse a la competencia ya no cuenta como compra", () => {
    for (const texto of [
      "ya compre en otro lado", "ya compre con otro",
      "ya compre en otra llantera", "ya las compre en otra parte",
    ]) expect(isExplicitPurchaseConfirmation(texto), texto).toBe(false);
  });

  it("EL CASO QUE NO DEBE DISPARAR: la compra de verdad sigue contando", () => {
    for (const texto of [
      "ya las compre", "acabo de comprar", "ya pague",
      "ya compre las llantas con ustedes",
    ]) expect(isExplicitPurchaseConfirmation(texto), texto).toBe(true);
  });

  it("y esas compras ajenas SÍ cierran como perdida", () => {
    expect(puedeCerrarComoPerdido("ya compre en otro lado")).toBe(true);
  });
});

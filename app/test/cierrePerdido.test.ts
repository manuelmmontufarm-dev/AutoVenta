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
import {
  DESPEDIDA_SIN_COMPRA, DESPEDIDA_VENTA_PERDIDA, despedidaQueCorresponde, puedeCerrarComoPerdido,
} from "../src/domain/cierrePerdido.js";
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
      "no me interesa", "ya no me interesa", "ya compre en otro lado",
      "gracias ya compre en otro lugar", "deje de escribirme", "no me escriban mas",
      "ya no necesito", "consegui en otra llantera",
      "Ya Ise el pedido aquí en Ibarra gracias",
      "Ya conseguí acá en manabi",
    ]) expect(puedeCerrarComoPerdido(texto), texto).toBe(true);
  });

  it("nombrar otra ciudad sin una compra hecha no cierra", () => {
    for (const texto of [
      "hice la cotización acá en Cayambe",
      "estoy aquí en Ibarra",
      "ya compré con ustedes acá en Cumbayá",
      "ya hice el pedido con Depot Tire",
    ]) expect(puedeCerrarComoPerdido(texto), texto).toBe(false);
  });

  /**
   * SOLO LO SUPER OBVIO CIERRA (Manuel, 27-ago-2026).
   *
   * Estas siete cerraban antes, porque el colador terminaba en
   * `isNegativeResponse`. Ninguna es una venta muerta:
   *
   *  · «mejor no» y «no gracias» son un no a ESTE paso, no a la compra.
   *  · «solo estoy preguntando» es media conversación de venta.
   *  · **«otro día» es uno de los tres BOTONES que el propio bot le pone al
   *    cliente** en la pregunta de visita (`domain/botones.ts`). Tocar el botón
   *    del bot cerraba la venta como perdida y le borraba el ciclo entero:
   *    medida, producto, cantidad y cotización.
   *  · «en otro lado me dan más barato» es una NEGOCIACIÓN, el mejor momento
   *    de la venta, y disparaba por el `en otro lado` suelto.
   *
   * Cerrar de más borra el ciclo del cliente; cerrar de menos le cuesta al
   * asesor un clic en el panel. No son comparables.
   */
  it("EL CASO QUE NO DEBE DISPARAR: el no blando y el botón del propio bot", () => {
    for (const texto of [
      "mejor no", "no gracias", "solo estoy preguntando", "otro dia",
      "Otro día", "todavia no", "dejeme pensarlo",
      "en otro lado me dan mas barato", "vi en otro lugar a 80",
      "ya compre las llantas con ustedes",
    ]) expect(puedeCerrarComoPerdido(texto), texto).toBe(false);
  });

  it("la despedida cambia según haya comprado o no", () => {
    expect(despedidaQueCorresponde("Gracias ya compré en otro lugar"))
      .toBe(DESPEDIDA_VENTA_PERDIDA);
    expect(despedidaQueCorresponde("Ya Ise el pedido aquí en Ibarra gracias"))
      .toBe(DESPEDIDA_VENTA_PERDIDA);
    expect(despedidaQueCorresponde("no me interesa")).toBe(DESPEDIDA_SIN_COMPRA);
    // Y la conversación viva no tiene despedida: null es «seguí vendiendo».
    expect(despedidaQueCorresponde("esta muy caro")).toBeNull();
    expect(despedidaQueCorresponde("otro dia")).toBeNull();
  });

  it("la despedida de compra se alegra y no pide nada", () => {
    expect(DESPEDIDA_VENTA_PERDIDA).toMatch(/Me alegro por su compra/);
    expect(DESPEDIDA_VENTA_PERDIDA).not.toMatch(/\?/);
    expect(DESPEDIDA_SIN_COMPRA).not.toMatch(/\?/);
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
      "Ya Ise el pedido aquí en Ibarra gracias",
      "Ya conseguí acá en manabi",
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

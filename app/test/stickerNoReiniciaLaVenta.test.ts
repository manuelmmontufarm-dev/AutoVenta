/**
 * UN STICKER NO ES UNA CONVERSACIÓN NUEVA.
 *
 * Lo que el bot no sabe leer —video, sticker, contacto— se registra igual, con
 * un texto que le dice al modelo qué hacer: «Pídele con amabilidad la medida
 * escrita o una foto del costado de la llanta». Esa instrucción es correcta
 * para quien todavía no dio su medida, y absurda para el resto.
 *
 *   conv 18821 · el cliente ya tenía la visita confirmada para el lunes y se
 *                despidió con «Correcto todo bien gracias». Mandó un sticker.
 *                BOT: «Envíeme la medida escrita o una foto del costado de la
 *                      llanta y con eso le atiendo enseguida.»
 *
 *   conv 16982 · tenía cotización y visita para el sábado. Un sticker tras el
 *                reinicio disparó saludo, guía de medida y «¿Me dice la
 *                medida…?», y en el camino se perdió lo acordado.
 *
 *   conv 11 · un «.» (el dueño usa ese chat de libreta) disparó el saludo de
 *             presentación completo y dos mensajes pidiendo la medida.
 *
 * Doce stickers en la ventana; cinco recibieron respuesta y en dos el bot pidió
 * la medida a quien ya tenía lámina o cotización.
 */
import { describe, expect, it } from "vitest";
import { textoParaMensajeQueNoSeLee } from "../src/domain/mensajeQueNoSeLee.js";

describe("qué se le dice al modelo cuando llega algo que no se puede leer", () => {
  it("sin medida ni opciones todavía: se pide la medida, como hasta ahora", () => {
    const t = textoParaMensajeQueNoSeLee({ tieneMedida: false, vioOpciones: false, tieneCotizacion: false, tieneVisita: false });
    expect(t).toMatch(/medida/i);
  });

  it("conv 18821: con la visita confirmada NO se le pide la medida", () => {
    const t = textoParaMensajeQueNoSeLee({ tieneMedida: true, vioOpciones: true, tieneCotizacion: true, tieneVisita: true });
    expect(t).not.toMatch(/medida escrita|foto del costado/i);
  });

  it("conv 16982: con cotización tampoco", () => {
    const t = textoParaMensajeQueNoSeLee({ tieneMedida: true, vioOpciones: true, tieneCotizacion: true, tieneVisita: false });
    expect(t).not.toMatch(/medida escrita|foto del costado/i);
  });

  it("con la lámina ya vista tampoco: la medida ya la tiene", () => {
    const t = textoParaMensajeQueNoSeLee({ tieneMedida: true, vioOpciones: true, tieneCotizacion: false, tieneVisita: false });
    expect(t).not.toMatch(/medida escrita|foto del costado/i);
  });

  it("siempre dice que el mensaje no se pudo ver: el modelo no puede inventar que lo leyó", () => {
    for (const estado of [
      { tieneMedida: false, vioOpciones: false, tieneCotizacion: false, tieneVisita: false },
      { tieneMedida: true, vioOpciones: true, tieneCotizacion: true, tieneVisita: true },
    ]) {
      expect(textoParaMensajeQueNoSeLee(estado)).toMatch(/no puede ver|no pude ver/i);
    }
  });

  it("con la venta avanzada, la instrucción es no descarrilar el hilo", () => {
    const t = textoParaMensajeQueNoSeLee({ tieneMedida: true, vioOpciones: true, tieneCotizacion: true, tieneVisita: true });
    expect(t).toMatch(/no reinicies|no vuelvas a empezar|sigue donde/i);
  });
});

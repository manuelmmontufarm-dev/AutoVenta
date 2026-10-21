import { describe, expect, it } from "vitest";
import { isExplicitPurchaseConfirmation } from "../src/domain/salesIntent.js";
import { tipoDeCierreDelTurno } from "../src/domain/cierreTurno.js";

/**
 * «YA COMPRÉ X, AHORA NECESITO Y» NO ES UNA VENTA CERRADA (auditoría 19-oct,
 * familia 7-C, chat 462, 15-oct 18:37 UTC).
 *
 * El bot contestó «Me alegra que ya haya resuelto su compra. Quedamos a las
 * órdenes para otra ocasión», pasó el chat a ganado y, al reabrir, saludó de
 * cero y buscó la medida vieja (205/60R16).
 */
const CHAT_462 =
  "Las Falken ya las compré 205 60 16.\nAhora necesito las Kenda 195 60 15 será que puedo pagar con tarjeta sin incremento?";

describe("la compra hecha con un pedido nuevo en el mismo mensaje", () => {
  it("no es una confirmación de compra (lo usan el cierre del turno y el clasificador)", () => {
    expect(isExplicitPurchaseConfirmation(CHAT_462)).toBe(false);
  });

  it("no cierra el turno", () => {
    expect(tipoDeCierreDelTurno(CHAT_462)).toBeNull();
  });

  it.each([
    "Ya compré las de 205/60R16, ahora quiero cotizar las de la camioneta 265/70R16",
    "ya las compré, ¿tienen alineación?",
    "Ya compré las delanteras. Me cotiza las traseras?",
  ])("tampoco cierra: «%s»", (texto) => {
    expect(tipoDeCierreDelTurno(texto)).toBeNull();
  });

  it.each([
    "ya compré, gracias",
    "Ya compré las llantas",
    "Ya compré las llantas 205/60R16, muchas gracias",
    "Ya pagué",
  ])("la compra a secas sigue cerrando como ganada: «%s»", (texto) => {
    expect(isExplicitPurchaseConfirmation(texto)).toBe(true);
    expect(tipoDeCierreDelTurno(texto)).toBe("compra_terminada");
  });
});

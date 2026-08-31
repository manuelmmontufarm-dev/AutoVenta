/**
 * El corte de memoria a las 15 horas de silencio.
 *
 * Caso origen (conv 3, 31-ago-2026): «hola» tras días de silencio y el bot,
 * con el ciclo viejo a cuestas, mandó la guía de medidas sin saludar. La
 * decisión pura de «¿este chat ya se enfrió?» vive en `memoriaDelChatVencida`
 * y se prueba aquí sin base; el cierre-y-reapertura que la aplica se prueba en
 * el simulador y en la integración.
 */
import { describe, expect, it } from "vitest";
import {
  HORAS_DE_MEMORIA_DEL_CHAT,
  memoriaDelChatVencida,
} from "../src/domain/memoriaDelChat.js";

const ahora = new Date("2026-08-31T17:36:22Z");
const hace = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000);

describe("memoria del chat (15 h)", () => {
  it("caduca cuando nadie escribió en más de 15 horas", () => {
    expect(memoriaDelChatVencida(hace(16), hace(20), ahora)).toBe(true);
    expect(memoriaDelChatVencida(hace(72), hace(72), ahora)).toBe(true);
  });

  it("no caduca dentro de la ventana — cotizar de noche y confirmar en la mañana es la misma compra", () => {
    expect(memoriaDelChatVencida(hace(14), hace(14.5), ahora)).toBe(false);
    expect(memoriaDelChatVencida(hace(1), hace(0.5), ahora)).toBe(false);
  });

  it("un seguimiento del bot refresca el reloj aunque el cliente lleve días callado", () => {
    // Cliente calló hace 40 h, pero el seguimiento salió hace 2 h: responderle
    // «sí» a ESE mensaje no es un chat frío.
    expect(memoriaDelChatVencida(hace(40), hace(2), ahora)).toBe(false);
  });

  it("exactamente 15 horas todavía es la misma conversación (el corte es MAYOR al límite)", () => {
    expect(memoriaDelChatVencida(hace(HORAS_DE_MEMORIA_DEL_CHAT), null, ahora)).toBe(false);
    expect(memoriaDelChatVencida(hace(HORAS_DE_MEMORIA_DEL_CHAT + 0.01), null, ahora)).toBe(true);
  });

  it("un chat sin mensajes no tiene nada que olvidar", () => {
    expect(memoriaDelChatVencida(null, null, ahora)).toBe(false);
    expect(memoriaDelChatVencida(undefined, undefined, ahora)).toBe(false);
  });

  it("basta una marca de un solo lado para decidir", () => {
    expect(memoriaDelChatVencida(hace(16), null, ahora)).toBe(true);
    expect(memoriaDelChatVencida(null, hace(3), ahora)).toBe(false);
  });
});

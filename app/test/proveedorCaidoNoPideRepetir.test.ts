/**
 * SI EL QUE SE CAYÓ ES EL PROVEEDOR, NO SE LE PIDE AL CLIENTE QUE REPITA.
 *
 * 11-sep, 08:34. La cuenta de OpenAI se quedó sin créditos y dos clientes con
 * la conversación viva recibieron esto:
 *
 *   conv 18596 · CLIENTE: «Envíeme fotos» · «De esa llanta»
 *                BOT: «Disculpa, tuve un problema procesando tu mensaje.
 *                      ¿Me lo repites por favor?»
 *   conv 18843 · CLIENTE: «Si por favor que llantas tiene me envía las fotos y costo»
 *                BOT: lo mismo.
 *
 * Pedirle que repita es lo peor que se puede hacer ahí: el segundo intento va
 * a fallar igual, y el cliente se queda con dos mensajes de error en vez de
 * uno. Dos minutos después el bot se apagó y esos chats quedaron sin nadie.
 *
 * Cuando el que falla es el proveedor, el turno se calla y el caso va al
 * asesor. Cuando el fallo es nuestro —el modelo se enredó con las
 * herramientas— la disculpa sigue teniendo sentido: repetir puede funcionar.
 */
import { describe, expect, it } from "vitest";
import { esFalloDelProveedor } from "../src/domain/falloDelProveedor.js";

describe("de quién es el fallo", () => {
  it("los errores que devolvió OpenAI el 11-sep son del proveedor", () => {
    expect(esFalloDelProveedor(new Error("429 You have no credits remaining. Add credits to continue using the API."))).toBe(true);
    expect(esFalloDelProveedor(new Error("429 Rate limit reached for gpt-5.5"))).toBe(true);
    expect(esFalloDelProveedor(new Error("insufficient_quota"))).toBe(true);
  });

  it("los caídos y los tiempos agotados también", () => {
    for (const m of ["500 Internal server error", "503 Service Unavailable", "502 Bad Gateway",
                     "Connection error.", "request timed out", "ETIMEDOUT", "ECONNRESET", "socket hang up"]) {
      expect(esFalloDelProveedor(new Error(m)), m).toBe(true);
    }
  });

  it("un objeto de error con status, sin mensaje útil", () => {
    expect(esFalloDelProveedor({ status: 429 })).toBe(true);
    expect(esFalloDelProveedor({ status: 503 })).toBe(true);
    expect(esFalloDelProveedor({ status: 400 })).toBe(false);
  });

  it("lo que es culpa nuestra NO es del proveedor: ahí repetir puede servir", () => {
    expect(esFalloDelProveedor(new Error("max_iterations_or_empty_response"))).toBe(false);
    expect(esFalloDelProveedor(new Error("400 Invalid schema for function 'buscar_llanta'"))).toBe(false);
    expect(esFalloDelProveedor(new Error("context_length_exceeded"))).toBe(false);
    expect(esFalloDelProveedor(null)).toBe(false);
    expect(esFalloDelProveedor(undefined)).toBe(false);
  });
});

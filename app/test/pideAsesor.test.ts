/**
 * LOS 151 CLIENTES CALLADOS PARA SIEMPRE.
 *
 * Auditoría de producción, 27-ago-2026, sobre 1.244 conversaciones: 167
 * clientes escribieron último y nunca recibieron respuesta. 155 estaban en
 * `assigned_to='human'` sin que ningún asesor hubiera escrito NUNCA, y 151
 * tenían `bot_paused_until = 'infinity'` — una pausa que no vence, y que por
 * eso la red del 8-ago (`devolverAlBotSiVencioLaPausa`) nunca levantaba.
 *
 * El disparador era `/\b(asesor|humano|persona|vendedor|hablar con alguien)\b/`
 * sobre el mensaje del cliente: LA PALABRA SUELTA. Y el bot dice «se lo
 * confirma el asesor en tienda» en casi todos los turnos.
 */
import { describe, expect, it } from "vitest";
import { AVISO_DE_TRASPASO, pideUnAsesor } from "../src/domain/pideAsesor.js";

describe("pedir un asesor es un pedido, no una mención", () => {
  it("los pedidos de verdad sí cuentan", () => {
    for (const texto of [
      "quiero hablar con un asesor por favor", "me pasa con un asesor",
      "necesito hablar con una persona", "páseme con alguien",
      "quiero un asesor", "puedo hablar con el vendedor",
      "hablar con un humano", "me comunica con un asesor",
      "¿atiende una persona?", "¿eres un bot?", "no quiero hablar con un robot",
    ]) expect(pideUnAsesor(texto), texto).toBe(true);
  });

  /**
   * EL CASO QUE FALLÓ, y es el que costó los 151. Todas estas frases marcaban
   * al cliente con pausa infinita con el detector viejo.
   */
  it("EL CASO QUE NO DEBE DISPARAR: nombrar al asesor no es pedirlo", () => {
    for (const texto of [
      "gracias al asesor", "y qué dice el asesor",
      "el asesor me dijo que pase el sábado",
      "ok que me confirme el asesor entonces",
      "listo, espero al asesor",
      "soy una persona ocupada, mándeme el precio",
      "el vendedor de la otra vez me atendió bien",
      // Y lo más importante: la venta normal jamás se acerca a esto.
      "Precio dd cada llanta rim 15 /55",
      "En qué precio está está versión",
      "Cumbaya si va bien este sábado, quiero ver las llantas para decidir",
      "Valor de la Kenda en las medidas R14_60_195",
      "Marca kenda", "Vivo en el norte", "La fabricación de donde es ?",
    ]) expect(pideUnAsesor(texto), texto).toBe(false);
  });

  it("el aviso de traspaso no lo deja en el vacío", () => {
    // Antes el turno del pedido salía MUDO: la pausa se pone cien líneas antes
    // de que el bot pueda contestar. El cliente no sabía ni si llegó.
    expect(AVISO_DE_TRASPASO).toMatch(/ya le avisé a un asesor/i);
    expect(AVISO_DE_TRASPASO).toMatch(/usted|dígame|le escriba/i);
    expect(AVISO_DE_TRASPASO).not.toMatch(/\bte\b|\btu\b/);
  });
});

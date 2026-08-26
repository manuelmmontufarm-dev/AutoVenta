import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { isSafeCopy } = await import("../src/services/followUpCopy.js");

/**
 * El candado determinístico sobre la redacción con IA de los seguimientos.
 *
 * Desde el 26-ago el seguimiento de una visita ya agendada sale en vez de
 * cancelarse, así que este filtro dejó de ser un detalle: es lo que impide que
 * el modelo, viendo los mismos hechos, escriba por su cuenta un «¿qué día te
 * queda mejor?» al cliente que ya contestó. Si algo no pasa el filtro, gana el
 * texto determinístico, que confirma.
 */
const VISITA_AGENDADA = {
  stage: "seguimiento_venta" as const,
  nearestStore: "Depot Tire Quito Sur",
  customerCommitment: "el juebes",
  visitDate: new Date("2026-08-27T21:00:00.000Z"),
};

describe("la redacción con IA de un seguimiento", () => {
  it.each([
    "😊 Sobre tu visita, ¿te ayudo a dejar lista la visita o reserva a Depot Tire Quito Sur?",
    "🚗 Me quedé pendiente de tu visita. ¿Qué día te quedaría más cómodo para coordinar? 😊",
    "Hola de nuevo, ¿cuándo puede pasar por el local?",
  ])("se rechaza si vuelve a preguntar la visita ya registrada: %s", (texto) => {
    expect(isSafeCopy(texto, VISITA_AGENDADA)).toBe(false);
  });

  it("acepta la confirmación que sí nombra el día registrado", () => {
    const texto = "✅ Perfecto, le esperamos el jueves 27 de agosto en Depot Tire Quito Sur. Cualquier pregunta, dígame 😊";
    expect(isSafeCopy(texto, VISITA_AGENDADA)).toBe(true);
  });

  /*
   * La regla original prohibía nombrar un día si no había compromiso guardado.
   * Con la visita registrada por `agendar_visita` puede no haber texto del
   * cliente y sí haber fecha: sin este caso, al mensaje que confirma se le
   * prohibía justo la palabra que lo hace útil.
   */
  it("una fecha registrada basta para poder nombrar el día", () => {
    const soloFecha = { ...VISITA_AGENDADA, customerCommitment: null };
    expect(isSafeCopy("Le esperamos el jueves en Depot Tire Quito Sur 😊", soloFecha)).toBe(true);
  });

  it("sigue prohibido nombrar un día que nadie dio", () => {
    const sinVisita = { stage: "cotizacion_enviada" as const, quoteNumber: "COT-1" };
    expect(isSafeCopy("¿Le parece si le esperamos el jueves?", sinVisita)).toBe(false);
  });

  it("sigue prohibido inventar descuentos o escasez", () => {
    expect(isSafeCopy("¡Últimas unidades! Aproveche el descuento de hoy.", VISITA_AGENDADA)).toBe(false);
  });
});

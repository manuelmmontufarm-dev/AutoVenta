/**
 * EL TURNO QUE REVIENTA O SE CUELGA TAMBIÉN ES «EL BOT NO RESPONDIÓ» (24-nov-2026).
 *
 * `runAgent` ya atrapa lo que falla adentro del agente. Pero un turno es más
 * que el agente: lee la conversación, corre las rutas directas, pasa los
 * candados de salida y envía. Una excepción en cualquiera de esos pasos subía
 * hasta `pipeline/inbound.ts`, que solo hace `console.error`: el cliente sin
 * respuesta y nadie enterado. Y un turno que nunca termina (una llamada colgada
 * sin tope) ni siquiera llegaba a eso.
 *
 * Este envoltorio no cambia el turno: lo mira. Si revienta, avisa a soporte y
 * deja pasar el error como siempre. Si a los cinco minutos sigue corriendo,
 * avisa que está colgado.
 *
 * Lo que NO es un fallo: `OutboundPolicyError`. Es la política de WhatsApp
 * diciendo que ese chat no le toca al bot (lo tiene un asesor, el cliente se
 * dio de baja); el bot calla a propósito.
 */
import { sql } from "../db/client.js";
import { reportarFalloDelBot } from "./avisosASoporte.js";
import { OutboundPolicyError } from "./whatsappPolicy.js";

/**
 * Muy por encima de un turno normal (segundos) y de uno lento de verdad: 45 s
 * por llamada al modelo, con reintento y rescate, no llega a cinco minutos.
 */
export const TURNO_COLGADO_MS = 5 * 60 * 1000;

async function conversacionDe(telefono: string): Promise<number | null> {
  try {
    const [fila] = await sql<{ id: number }[]>`select id from conversations where phone = ${telefono} limit 1`;
    return fila ? Number(fila.id) : null;
  } catch {
    return null;
  }
}

export async function conVigilanciaDelTurno<T>(
  telefono: string,
  correr: () => Promise<T>,
  colgadoMs = TURNO_COLGADO_MS,
): Promise<T> {
  const reloj = setTimeout(() => {
    void conversacionDe(telefono).then((conversationId) =>
      reportarFalloDelBot({ causa: "turno_colgado", conversationId, puerta: "turno" }));
  }, colgadoMs);
  reloj.unref();
  try {
    return await correr();
  } catch (error) {
    if (!(error instanceof OutboundPolicyError)) {
      // No se espera al aviso: el error sigue su camino de siempre.
      void conversacionDe(telefono).then((conversationId) =>
        reportarFalloDelBot({ causa: "error_interno", error, conversationId, puerta: "turno" }));
    }
    throw error;
  } finally {
    clearTimeout(reloj);
  }
}

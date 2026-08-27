/**
 * ¿Qué medidas se le pueden cotizar a este cliente AHORA?
 *
 * Una sola respuesta para los tres que la necesitan —el candado de
 * `generar_cotizacion`, el Ángel Guardián y los hechos del vendedor—, porque la
 * pregunta es la misma y tres versiones de la misma consulta se contestan
 * distinto el día que alguien toca una. Eso ya pasó: el 26-ago (conv 4732) el
 * candado miraba TODO el ciclo y el guardián solo los 16 mensajes recientes, y
 * por esa diferencia el guardián vio bien el error que el candado dejó pasar.
 *
 * Son tres fuentes y ninguna sobra:
 *
 *  1. Lo que el cliente escribió **en esta visita** — no en la de hace dos
 *     semanas: el ciclo solo rota cuando la conversación se cierra, así que una
 *     que nadie cierra arrastra la medida del carro anterior. Ver
 *     `mensajesDeLaVisitaActual`.
 *  2. La medida de trabajo de la conversación (`tire_size`), que no caduca.
 *  3. Las **equivalentes que el bot ya le declaró**. Cuando en su medida no hay
 *     stock, la pieza de opciones sale con el aviso «en su 235/70R15 no me
 *     queda; estas son equivalentes de su aro» y el cliente acepta con un «ok»
 *     o un «me gusta la Falken». Sin anotar esa declaración, esa aceptación no
 *     existía para el sistema y la cotización de la equivalente quedaba
 *     bloqueada para siempre: el cliente se iba sin cotización — la otra mitad
 *     del caso 4732, «y luego nunca le mandó la cotización».
 */
import { sql } from "../db/client.js";
import { medidasPermitidas, mensajesDeLaVisitaActual } from "../domain/medidaPedida.js";

/** Cuántos mensajes del cliente se miran hacia atrás antes de cortar por silencio. */
const INBOUND_A_REVISAR = 20;

export async function medidasDelPedido(
  conversationId: number,
  cycle: number,
  textoDelTurno?: string | null,
): Promise<string[]> {
  const [inbound, [pieza], [conversacion]] = await Promise.all([
    sql<{ content: string; created_at: Date }[]>`
      select content, created_at from messages
      where conversation_id=${conversationId} and cycle=${cycle} and direction='inbound'
      order by created_at desc limit ${INBOUND_A_REVISAR}
    `,
    sql<{ metadata: { equivalentes?: unknown } | null }[]>`
      select metadata from messages
      where conversation_id=${conversationId} and cycle=${cycle}
        and metadata->>'piece'='options'
      order by created_at desc limit 1
    `,
    sql<{ tire_size: string | null }[]>`
      select tire_size from conversations where id=${conversationId}
    `,
  ]);
  const equivalentes = Array.isArray(pieza?.metadata?.equivalentes)
    ? (pieza.metadata.equivalentes as unknown[]).map(String)
    : [];
  return medidasPermitidas(
    [
      ...(textoDelTurno ? [textoDelTurno] : []),
      ...mensajesDeLaVisitaActual(inbound).map((m) => m.content),
      ...equivalentes,
    ],
    conversacion?.tire_size,
  );
}

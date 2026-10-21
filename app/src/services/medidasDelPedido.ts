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
import type { ContextoEquivalencias } from "../domain/equivalenciaEnTexto.js";
import {
  CLAVE_MEDIDA_ESCRITA, medidaEnDisputa, medidaNuevaParaLaFicha, medidasParaElHecho,
} from "../domain/medidaDelCliente.js";
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
  const declaradas = Array.isArray(pieza?.metadata?.equivalentes)
    ? (pieza.metadata.equivalentes as unknown[]).map(String)
    : [];
  const delCliente = medidasPermitidas(
    [
      ...(textoDelTurno ? [textoDelTurno] : []),
      ...mensajesDeLaVisitaActual(inbound).map((m) => m.content),
    ],
    conversacion?.tire_size,
  );
  // El juez (`domain/equivalencia.ts`) corre donde se ESCRIBE la declaración:
  // desde la familia 1-B la lámina solo anota como equivalente lo que
  // equivale. Acá NO se vuelve a juzgar: lo que el bot le presentó en esta
  // visita como equivalente y el cliente eligió sigue cotizable — releerlo con
  // la regla de hoy dejó sin cotización al cliente del caso 4732 (235/75R15
  // por 235/70R15, declarada así el 26-ago), que es la mitad del bug que
  // `medidaDeOtraVisita.integration.test.ts` vigila. El consentimiento sigue
  // exigiéndolo `equivalenteSinConsentimiento`.
  const equivalentes = declaradas;
  return medidasPermitidas([...delCliente, ...equivalentes]);
}

/**
 * Lo que el cliente tiene sobre la mesa para juzgar una «equivalente»: sus
 * mensajes de esta visita (del más viejo al más nuevo) y la medida de trabajo.
 *
 * A diferencia de `medidasDelPedido`, NO incluye las equivalentes que declaró
 * el bot: contra ellas no se mide nada, son justamente lo que se juzga.
 */
export async function contextoDeEquivalencias(
  conversationId: number,
  cycle: number,
  textoDelTurno?: string | null,
): Promise<ContextoEquivalencias> {
  const [inbound, [conversacion]] = await Promise.all([
    sql<{ content: string; created_at: Date }[]>`
      select content, created_at from messages
      where conversation_id=${conversationId} and cycle=${cycle} and direction='inbound'
      order by created_at desc limit ${INBOUND_A_REVISAR}
    `,
    sql<{ tire_size: string | null }[]>`
      select tire_size from conversations where id=${conversationId}
    `,
  ]);
  return {
    textosDeLaVisita: mensajesDeLaVisitaActual(inbound).map((m) => m.content).reverse(),
    textoDelTurno: textoDelTurno ?? null,
    medidaDeTrabajo: conversacion?.tire_size ?? null,
  };
}

/**
 * ¿El cliente dejó DOS medidas completas sin resolver? (conv 22629, 23-sep)
 *
 * «205/55 R15» escrito, foto de una 225/70R16, y después «225/70 R15»: se cotizó
 * la R15 sin preguntar cuál era. Las dos figuran en `medidasDelPedido` —las dos
 * las dijo él—, así que el candado de medida no tenía nada que objetar. Este
 * es el otro lado de la misma pregunta: no QUÉ se puede cotizar, sino si ya se
 * puede. Misma visita que arriba; la regla vive en `domain/medidaDelCliente`.
 */
export async function medidaEnDisputaDelPedido(
  conversationId: number,
  cycle: number,
  textoDelTurno?: string | null,
): Promise<{ foto: string; escrita: string } | null> {
  const filas = await sql<{ content: string | null; direction: string; created_at: Date }[]>`
    select content, direction, created_at from messages
    where conversation_id=${conversationId} and cycle=${cycle}
    order by created_at desc limit 40
  `;
  const mensajes = mensajesDeLaVisitaActual(filas)
    .reverse()
    .map((m) => ({ deCliente: m.direction === "inbound", texto: m.content }));
  if (textoDelTurno && mensajes.at(-1)?.texto !== textoDelTurno) mensajes.push({ deCliente: true, texto: textoDelTurno });
  return medidaEnDisputa(mensajes);
}

/**
 * ANOTA EL HECHO «EL CLIENTE ESCRIBIÓ SU MEDIDA» (familia 3, auditoría del 19-oct).
 *
 * Cada entrante del cliente que todavía no lo tiene recibe
 * `metadata.medida_escrita`: las medidas que el lector de la ficha encuentra en
 * él (lista vacía si no trae). Corre al empezar el turno del agente —turno
 * normal y retomada, las dos puertas que contestan a un cliente—, antes de que
 * nadie pregunte «¿la dio él o la dedujo el bot?». Una vez anotado, el mensaje
 * no se vuelve a leer: agente, candados y Guardián le preguntan al hecho.
 *
 * Devuelve las medidas anotadas en esta pasada (para el log) y la que puede
 * ir a la ficha: solo de entrantes posteriores al último saliente, para que
 * anotar mensajes viejos no pise una ficha ya corregida (`medidaNuevaParaLaFicha`).
 */
export async function anotarMedidasEscritas(
  conversationId: number,
  cycle: number,
): Promise<{ anotadas: string[]; paraLaFicha: string | null }> {
  const sinHecho = await sql<{ id: number; content: string | null; created_at: Date }[]>`
    select id, content, created_at from messages
    where conversation_id=${conversationId} and cycle=${cycle}
      and direction='inbound' and author_kind='customer'
      and not (metadata ? ${CLAVE_MEDIDA_ESCRITA})
    order by created_at asc
    limit 40
  `;
  if (!sinHecho.length) return { anotadas: [], paraLaFicha: null };
  const [saliente] = await sql<{ created_at: Date }[]>`
    select created_at from messages
    where conversation_id=${conversationId} and cycle=${cycle}
      and direction='outbound' and type <> 'note'
    order by created_at desc limit 1
  `;
  const anotados: { medidas: string[]; created_at: Date }[] = [];
  for (const fila of sinHecho) {
    const medidas = medidasParaElHecho(fila.content);
    anotados.push({ medidas, created_at: fila.created_at });
    await sql`
      update messages
      set metadata = metadata || ${sql.json({ [CLAVE_MEDIDA_ESCRITA]: medidas })}
      where id=${fila.id}
    `;
  }
  return {
    anotadas: anotados.flatMap((m) => m.medidas),
    paraLaFicha: medidaNuevaParaLaFicha(anotados, saliente?.created_at ?? null),
  };
}

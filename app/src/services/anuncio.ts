import { sql } from "../db/client.js";
import type { Anuncio } from "../domain/anuncio.js";

/**
 * El anuncio desde el que se abrió este chat (el más reciente del ciclo
 * vigente). Se guarda en el `metadata` del mensaje que lo trajo: ver
 * `domain/anuncio.ts`.
 */
export async function anuncioDeLaConversacion(
  conversationId: number,
): Promise<Anuncio | null> {
  const [fila] = await sql<{ anuncio: Anuncio | null }[]>`
    select metadata->'anuncio' as anuncio from messages
    where conversation_id=${conversationId}
      and cycle=(select current_cycle from conversations where id=${conversationId})
      and direction='inbound' and metadata ? 'anuncio'
    order by created_at desc limit 1
  `;
  return fila?.anuncio ?? null;
}

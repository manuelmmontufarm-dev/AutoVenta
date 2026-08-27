/**
 * El ahorro de la cotización que el cliente tiene AHORA.
 *
 * Una sola lectura para los dos que la nombran —la ruta directa que confirma el
 * local y la pregunta de visita del agente—, por la misma razón de siempre: dos
 * versiones de la misma consulta se contestan distinto el día que alguien toca
 * una, y acá lo que se dice es una cifra de plata. Ver `domain/ahorro.ts`.
 */
import { sql } from "../db/client.js";
import { ahorroDeLaCotizacion, type AhorroDeLaCotizacion, type LineaCotizada } from "../domain/ahorro.js";

export async function ahorroVigente(
  conversationId: number,
  cycle: number,
): Promise<AhorroDeLaCotizacion | null> {
  const [cotizacion] = await sql<{ items: LineaCotizada[] | null }[]>`
    select items from quotes
    where conversation_id = ${conversationId} and cycle = ${cycle}
    order by created_at desc limit 1
  `;
  return ahorroDeLaCotizacion(cotizacion?.items ?? null);
}

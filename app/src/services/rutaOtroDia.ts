/**
 * «OTRO DÍA» SIEMPRE PREGUNTA QUÉ DÍA (Manuel, 7-sep-2026: «cuando digo otro
 * día debería preguntar "perfecto, ¿qué día podría ir?". Siempre»).
 *
 * En su prueba de hoy (conv 3) el toque a «Otro día» se fue al modelo dos
 * veces y salieron dos cosas distintas, ninguna la pregunta: a las 10:31
 * «Entendido, le aviso al asesor para que coordine otro día» + «¿mañana o
 * tarde?» (con una alerta QUIERE COMPRAR al asesor por «coordinación
 * humana»); a las 11:40 «Listo, le dejo como referencia Cumbayá» —el candado
 * de calco había recortado la pregunta porque ya había salido 10 minutos
 * antes—. No hay nada que decidir en ese turno: la respuesta es una sola y
 * sale de aquí, sin modelo, sin alerta y sin botones (los mismos tres
 * botones serían el bucle que `botones.ts` ya evita).
 *
 * No depende de DIRECT_SALES_ROUTES_ENABLED: es una regla del negocio, no un
 * atajo experimental.
 */
import { sql } from "../db/client.js";
import { pidioOtroDia } from "../domain/botones.js";
import { rechazaLosDiasPropuestos } from "../domain/customerCommitment.js";
import type { Conversation } from "./conversations.js";

export function pideOtroDia(texto: string | null | undefined): boolean {
  return pidioOtroDia(texto) || rechazaLosDiasPropuestos(texto);
}

/** La respuesta, pura: se prueba sin base. */
export function respuestaAlOtroDia(localElegido: string | null): string {
  return localElegido
    ? `Perfecto. ¿Qué día le queda bien pasar por *${localElegido}*? Lo anoto y le aviso al asesor. 📅`
    : "Perfecto. ¿Qué día le queda bien pasar, y a cuál local: *Cumbayá* o *Quito Sur*? 📅";
}

export async function tryRutaOtroDia(
  conversation: Conversation,
  texto: string,
): Promise<string | null> {
  if (!pideOtroDia(texto)) return null;
  const [facts] = await sql<{ nearest_store: string | null; has_quote: boolean; has_options: boolean }[]>`
    select c.nearest_store,
      exists(select 1 from quotes q where q.conversation_id=c.id and q.cycle=c.current_cycle) as has_quote,
      exists(select 1 from messages m where m.conversation_id=c.id and m.cycle=c.current_cycle and m.metadata->>'piece'='options') as has_options
    from conversations c where c.id=${conversation.id}
  `;
  // Solo cuando hay algo que ir a ver: sin cotización ni opciones, «otro día»
  // puede ser cualquier cosa y lo lleva el modelo.
  if (!facts || (!facts.has_quote && !facts.has_options && !facts.nearest_store)) return null;
  console.log(`📅 «Otro día» en la conv ${conversation.id}: se pregunta qué día, sin modelo.`);
  return respuestaAlOtroDia(facts.nearest_store);
}

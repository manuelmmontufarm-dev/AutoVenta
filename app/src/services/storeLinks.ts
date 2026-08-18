import { business } from "../config.js";
import { sql } from "../db/client.js";
import { buildStoreLinksBlock } from "./quoteMessages.js";

/**
 * Los mapas de los locales, una sola vez por conversación.
 *
 * Mismo criterio que el bloque INCLUYE (ver buildBenefitsBlockOnce): un link de
 * Maps repetido no aporta nada y alarga el chat. La diferencia es que aquí el
 * candado NO es por ciclo sino por conversación entera — la dirección del local
 * no cambia entre un ciclo y el siguiente, así que si ya se la mandamos, ya la
 * tiene.
 *
 * Se detecta contra lo realmente enviado (los mensajes del asistente), no contra
 * una bandera aparte, para que un mensaje fallido no consuma el único envío.
 */
export async function buildStoreLinksBlockOnce(
  conversationId: number,
  destacado?: string | null,
  opciones?: { soloDestacado?: boolean },
): Promise<string> {
  // Los patrones salen de la config y no de un dominio escrito a mano: si mañana
  // cambia el acortador de los links, el candado sigue funcionando.
  const patrones = business.stores
    .map((store) => store.mapsUrl)
    .filter((url): url is string => Boolean(url))
    .map((url) => `%${url}%`);
  if (!patrones.length) return "";

  const [mandado] = await sql<{ id: number }[]>`
    select id from messages
    where conversation_id=${conversationId}
      and role='assistant'
      and coalesce(status, 'sent') <> 'failed'
      and content like any(${patrones})
    limit 1
  `;
  if (mandado) return "";
  return buildStoreLinksBlock(destacado, opciones);
}

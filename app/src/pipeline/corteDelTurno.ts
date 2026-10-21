/**
 * UN TURNO VE SOLO LOS MENSAJES QUE ATIENDE (auditoría 19-oct-2026, familia
 * 7-D: chats 29847 y 26561).
 *
 *   29847 · 15:33:13 «¡Hola! Me gustaría conseguir más información sobre esto.»
 *           15:33:25 (audio) «¿A cómo sale el rin 14 para auto? … Anchitas.»
 *
 * Los mensajes se guardan apenas llegan (`recibirMensaje`), antes del
 * agrupador; el audio, además, se transcribe primero. Llegó cuando el turno del
 * texto ya había arrancado. La cola FIFO por chat hizo su trabajo —el turno del
 * audio esperó al del texto—, pero el turno del texto leyó sus hechos de la base
 * con el audio ya guardado: `aroDelCliente` = 14, y mandó la lámina de rin 14.
 * Después el turno del audio contestó lo mismo otra vez: otra lámina y una
 * cotización de 165/65R14 que nadie pidió. En 26561 igual: «No me equivoqué»
 * vio «La medida es 185/ 65/15» y salieron dos láminas seguidas.
 *
 * `getHistory` ya cortaba por hora; los hechos, las medidas del pedido, las
 * herramientas y el Ángel Guardián leían todo el ciclo. El corte es el id del
 * último mensaje del cliente que atiende este turno, y vale para todo lo que
 * corre dentro de él sin pasarlo de mano en mano: lo que entró después es del
 * turno siguiente, que lo lee con el contexto ya completo.
 *
 * Fuera de un turno (seguimientos, panel, worker) no hay corte.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "../db/client.js";

const turno = new AsyncLocalStorage<{ hastaElEntrante: number | null }>();

/** Corre `fn` como un turno que ve los entrantes hasta `hastaElEntrante` (id) inclusive. */
export function enElTurno<T>(hastaElEntrante: number | null, fn: () => Promise<T>): Promise<T> {
  return turno.run({ hastaElEntrante }, fn);
}

/** El id del último entrante de este turno, o `null` fuera de un turno. */
export function corteDelTurno(): number | null {
  return turno.getStore()?.hastaElEntrante ?? null;
}

/**
 * El filtro para una consulta de mensajes: `and <columna> <= corte` para los
 * ENTRANTES (lo que el bot ya escribió no se corta). Sin turno, vacío.
 * `alias` es el de la tabla `messages` en la consulta, si tiene.
 */
export function soloLoDelTurno(alias?: string) {
  const corte = corteDelTurno();
  if (corte === null) return sql``;
  const t = alias ? `${alias}.` : "";
  return sql`and (${sql(`${t}direction`)} <> 'inbound' or ${sql(`${t}id`)} <= ${corte})`;
}

/** El id del último de estos mensajes de WhatsApp ya guardados (los del turno). */
export async function ultimoEntranteDe(waMessageIds: readonly string[]): Promise<number | null> {
  if (!waMessageIds.length) return null;
  const [fila] = await sql<{ id: string | number | null }[]>`
    select max(id) as id from messages where wa_message_id = any(${[...waMessageIds]})
  `;
  return fila?.id === null || fila?.id === undefined ? null : Number(fila.id);
}

/**
 * Lo deja escrito cuando el corte deja afuera algo que ya está guardado: es la
 * marca para verificar el mecanismo (en el log del bot o del simulador).
 */
export async function avisarSiHayEntrantesDespues(conversationId: number): Promise<void> {
  const corte = corteDelTurno();
  if (corte === null) return;
  const [fila] = await sql<{ n: number }[]>`
    select count(*)::int as n from messages
    where conversation_id=${conversationId} and direction='inbound' and id > ${corte}
  `;
  if (fila?.n) {
    console.log(`🧱 Conv ${conversationId}: este turno atiende hasta el entrante ${corte}; ${fila.n} posterior(es) quedan para el turno siguiente.`);
  }
}

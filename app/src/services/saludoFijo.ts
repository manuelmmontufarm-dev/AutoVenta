/**
 * El saludo de texto fijo no pisa al cliente que ya escribió.
 *
 * Auditoría 9-nov-2026, bloque B (10 chats: 39899, 39971, 40064, 40017, 40046,
 * 39515, 39759, 1750, 39675, 39834): el cliente manda «Hola» y el bot espera 12 s
 * por si escribe más. Si la medida llega DESPUÉS de esos 12 s, el turno del
 * saludo ya arrancó con «Hola» solo; es de texto fijo y no mira si llegó algo
 * nuevo, así que suelta «Puede mandarme la medida escrita…» a quien acaba de
 * mandarla. Desde que la promo sale como segundo mensaje (6-nov) la ventana es
 * más larga y pasó del 10,4 % al 18,6 % de las bienvenidas.
 *
 * Lo ya dicho no se puede desdecir (la presentación y la promo salen una vez),
 * pero el pedido de medida sí se calla: el turno siguiente contesta lo que el
 * cliente mandó, con todo el historial.
 */
import { sql } from "../db/client.js";
import { sinElPedidoDeMedida } from "../domain/firstContact.js";

/**
 * ¿Entró un mensaje del cliente después del último que este turno estaba
 * contestando? Es la única definición de «escribió de nuevo»: la usan el corte
 * de los bloques de cierre y el saludo fijo.
 */
export async function clienteEscribioDespuesDe(
  conversationId: number,
  idEntranteAlEmpezar: number,
): Promise<boolean> {
  const [fila] = await sql<{ id: number | null }[]>`
    select max(id) as id from messages
    where conversation_id=${conversationId} and direction='inbound'
  `;
  return Number(fila?.id ?? 0) > idEntranteAlEmpezar;
}

/**
 * El bloque del saludo fijo que de verdad se manda ahora: tal cual si el
 * cliente no escribió nada más, sin el pedido de medida si ya escribió, o
 * `null` si el bloque era solo el pedido.
 */
export async function bloqueDelSaludoFijoVigente(
  conversationId: number,
  idEntranteAlEmpezar: number,
  bloque: string,
): Promise<string | null> {
  if (!(await clienteEscribioDespuesDe(conversationId, idEntranteAlEmpezar))) return bloque;
  return sinElPedidoDeMedida(bloque) || null;
}

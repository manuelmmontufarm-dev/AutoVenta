/**
 * DÓNDE ESTÁ EL CLIENTE, SEGÚN TODO LO QUE HA DICHO — una sola fuente.
 *
 * Esta consulta vivía copiada en `insistirCierre.ts` y en `prepararSalida.ts`,
 * y las dos miraban SOLO el ciclo vigente. Conv 19031 (14-sep): «Mi estimado
 * soy de Santo Domingo» lo dijo el 11-sep, en el ciclo 1; volvió el 14 en el
 * ciclo 3 preguntando por envíos y recibió cuatro veces «¿Cumbayá o Quito Sur?».
 * La ciudad de una persona no cambia porque el chat se haya enfriado 15 horas.
 *
 * Dentro del ciclo gana lo más reciente, como antes («soy de Santo Domingo» y
 * después «el lunes voy a estar en Quito» = viene). De ciclos ANTERIORES solo
 * se hereda el lugar, no el viaje: un «voy a Quito el lunes» de hace una semana
 * no dice nada de esta compra, así que allá `viene` cuenta como `fuera`.
 */
import { sql } from "../db/client.js";
import { dondeEstaElCliente } from "../domain/fueraDeCobertura.js";
import { comproADistanciaSegunLoDicho } from "../domain/compraADistancia.js";

export type EstadoDeCobertura = "cobertura" | "viene" | "fuera";

export async function dondeEstaElClienteSegunLoDicho(
  conversationId: number,
  cycle: number,
  textoDelCliente: string | null | undefined,
): Promise<EstadoDeCobertura | null> {
  const deEsteTurno = dondeEstaElCliente(textoDelCliente);
  if (deEsteTurno) return deEsteTurno.estado;
  const entrantes = await sql<{ content: string; cycle: number }[]>`
    select content, cycle from messages
    where conversation_id=${conversationId} and direction='inbound'
      and created_at > now() - interval '60 days'
    order by created_at desc limit 40
  `;
  for (const { content, cycle: cicloDelMensaje } of entrantes) {
    const donde = dondeEstaElCliente(content);
    if (!donde) continue;
    if (cicloDelMensaje === cycle) return donde.estado;
    return donde.estado === "viene" ? "fuera" : donde.estado;
  }
  return null;
}

/**
 * POR QUÉ ESTE CLIENTE NO VA A PASAR POR EL LOCAL, si no va a pasar.
 *
 * Dos razones distintas con el mismo efecto sobre lo que se le dice —ni «¿a
 * cuál local?», ni «¿qué día pasa?», ni mapas—:
 *
 *  · `fuera_de_cobertura`: está en otra ciudad y no anunció que sube;
 *  · `compra_a_distancia`: decidió pagar por este medio y que se lo envíen
 *    (conv 21766, 20-sep: «Lo compro x este medio… me envía», y el seguimiento
 *    del día siguiente le preguntó qué día pasaba por Cumbayá).
 *
 * La compra a distancia se lee del ciclo vigente: es una decisión de ESTA
 * compra, no un dato de la persona como la ciudad.
 */
export type SinVisita = "fuera_de_cobertura" | "compra_a_distancia";

export async function porQueNoPasaPorElLocal(
  conversationId: number,
  cycle: number,
  textoDelCliente: string | null | undefined,
): Promise<SinVisita | null> {
  if (await dondeEstaElClienteSegunLoDicho(conversationId, cycle, textoDelCliente) === "fuera") {
    return "fuera_de_cobertura";
  }
  const delCiclo = await sql<{ content: string }[]>`
    select content from messages
    where conversation_id=${conversationId} and cycle=${cycle} and direction='inbound'
    order by created_at desc, id desc limit 20
  `;
  return comproADistanciaSegunLoDicho([textoDelCliente, ...delCiclo.map((m) => m.content)])
    ? "compra_a_distancia"
    : null;
}

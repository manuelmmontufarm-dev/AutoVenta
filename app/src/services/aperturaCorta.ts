/**
 * Las piezas con base de la apertura corta (Sprint 3, F-04). Lo puro y el
 * porqué viven en `domain/aperturaCorta.ts`; esto solo lee la base y arma las
 * respuestas. Todo corre detrás de `politica.aperturaCorta`: con Depot cada
 * función devuelve lo de siempre o null.
 */
import { sql } from "../db/client.js";
import { politica } from "../negocio/politica.js";
import { pideUbicacion } from "../domain/ubicacionPedida.js";
import { medidaEscritaEnElMensaje } from "../domain/medidaDelCliente.js";
import { aroEnTexto } from "../domain/aros.js";
import { mencionaVehiculo } from "../domain/vehiculoEnTexto.js";
import {
  esPedidoDeInformacionDelAnuncio,
  esRespuestaAutomaticaGuardada,
  PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS,
  PEDIDO_TRAS_LA_UBICACION,
  preguntaDondeConseguirlas,
  preguntaParaCerrarLaMedida,
} from "../domain/aperturaCorta.js";
import { logFunnelEvent } from "./conversations.js";
import { pedidoDeMedidaDelPrimerContacto } from "../domain/firstContact.js";
import { hayQueElegirLocal } from "../domain/storeSelection.js";
import { buildStoreLinksBlock, composeBlocks, ubicacionDelLocalUnico } from "./quoteMessages.js";

export interface VistaDeApertura {
  /** `lastOutboundText` sin la auto-respuesta del celular. */
  previousOutbound: string | null;
  /** El autor del último saliente sin la auto-respuesta del celular. */
  autorDelUltimoSaliente: string | null | undefined;
}

/**
 * Lo que la decisión del primer contacto tiene que ver. Con la apertura corta,
 * la auto-respuesta de WhatsApp Business («Gracias por tu mensaje. En este
 * momento no podemos responder…») no cuenta como saliente: el cliente no habló
 * todavía con nadie. Hasta el 22-nov esa auto-respuesta salía en 40 de los 40
 * chats que recibieron la apertura larga (989, 1091, 1120, 1125, 290).
 */
export async function vistaDeApertura(
  conversationId: number,
  deSiempre: VistaDeApertura,
): Promise<VistaDeApertura> {
  if (!politica.aperturaCorta) return deSiempre;
  const delCiclo = await sql<{ content: string; metadata: unknown }[]>`
    select content, metadata from messages
    where conversation_id = ${conversationId} and direction = 'outbound' and type <> 'note'
      and cycle = (select current_cycle from conversations where id = ${conversationId})
    order by created_at desc limit 6
  `;
  if (!delCiclo.some((s) => esRespuestaAutomaticaGuardada(s.metadata))) return deSiempre;
  const propiosDelCiclo = delCiclo.filter((s) => !esRespuestaAutomaticaGuardada(s.metadata));
  // El autor mira TODOS los ciclos, como `ultimoSaliente` en index.ts: una
  // persona en el ciclo anterior sigue apagando el saludo (conv 15426).
  const [ultimoPropio] = await sql<{ author_kind: string | null }[]>`
    select author_kind from messages
    where conversation_id = ${conversationId} and direction = 'outbound' and type <> 'note'
      and coalesce(metadata->>'automatica', 'false') <> 'true'
    order by created_at desc limit 1
  `;
  return {
    previousOutbound: propiosDelCiclo.length
      ? propiosDelCiclo.slice(0, 3).map((s) => s.content).reverse().join("\n")
      : null,
    autorDelUltimoSaliente: ultimoPropio?.author_kind ?? null,
  };
}

/** El texto genérico del anuncio cuenta como saludo pelado (solo con la apertura corta). */
export function esAperturaDeAnuncio(texto: string): boolean {
  return Boolean(politica.aperturaCorta) && esPedidoDeInformacionDelAnuncio(texto);
}

/**
 * «En Sto dgo. Donde las consigo gracias» como primer mensaje (conv 902): el
 * local primero —es lo que preguntó— y después la pregunta de la medida. Solo
 * si el mensaje no trae medida, aro ni vehículo: con un dato, el agente lo
 * aprovecha (busca y muestra) y contesta la ubicación con su herramienta.
 * Devuelve null cuando no corresponde.
 */
export function respuestaDeUbicacionDeEntrada(texto: string): string | null {
  if (!politica.aperturaCorta) return null;
  if (!pideUbicacion(texto) && !preguntaDondeConseguirlas(texto)) return null;
  if (medidaEscritaEnElMensaje(texto) || aroEnTexto(texto) !== null || mencionaVehiculo(texto)) return null;
  const mapas = buildStoreLinksBlock();
  if (!mapas) return null;
  const ubicacion = hayQueElegirLocal ? `Estos son nuestros locales:\n${mapas}` : ubicacionDelLocalUnico(undefined, mapas);
  // La pregunta va en UNA línea al final: la salida pone el mapa en su propio
  // mensaje detrás del texto, y un pedido en dos líneas quedaba partido
  // alrededor del mapa (simulador, 26-nov, vuelta 1).
  return composeBlocks(ubicacion, PEDIDO_TRAS_LA_UBICACION);
}

/**
 * `opciones_sin_medida` con la apertura corta: el cliente pide precio u
 * opciones sin medida, aro ni vehículo. Las dos primeras veces del ciclo se
 * contesta con UNA pregunta de las tres vías —sin guía de entrada y sin la
 * muestra de tres medidas mezcladas—; desde la tercera, sigue el camino de
 * siempre (la muestra, para no preguntar para siempre: ticket 2150).
 *
 * Cuántas veces ya se pidió es un HECHO, no se lee del texto del bot: los
 * eventos `respuesta_directa` del ciclo con ruta `first_contact` (el saludo
 * corto) o `pedido_de_medida` (esta misma), más la guía si salió.
 * Devuelve el texto a mandar tal cual, o null para seguir como siempre.
 */
export async function pedidoDeMedidaSinDatos(conversationId: number): Promise<string | null> {
  if (!politica.aperturaCorta) return null;
  const [cuenta] = await sql<{ pedidos: number }[]>`
    select (
      (select count(*) from funnel_events f
        where f.conversation_id = c.id and f.cycle = c.current_cycle and f.type = 'respuesta_directa'
          and f.data->>'route' in ('first_contact', 'pedido_de_medida'))
      + (select count(*) from messages m
        where m.conversation_id = c.id and m.cycle = c.current_cycle and m.type = 'image'
          and m.metadata->>'piece' = 'medida_guide')
    )::int as pedidos
    from conversations c where c.id = ${conversationId}
  `;
  const pedidos = cuenta?.pedidos ?? 0;
  if (pedidos >= 2) return null;
  await logFunnelEvent(conversationId, "respuesta_directa", { route: "pedido_de_medida", vez: pedidos + 1 }).catch(() => undefined);
  return pedidos === 0 ? pedidoDeMedidaDelPrimerContacto() : PEDIDO_DE_MEDIDA_CON_LAS_TRES_VIAS;
}

/**
 * Con SOLO el aro («rin 16», «R17»), la primera vez del ciclo: la pregunta que
 * cierra la medida en vez de la lámina de tres medidas distintas (1051, 1724).
 * Si ya se le preguntó y vuelve a dar solo el aro, null: sigue la lámina de
 * siempre (`services/mostrarPorAro.ts`), para no preguntar en círculo. El
 * «ya se le preguntó» es el evento `respuesta_directa` / `pregunta_por_aro`
 * del ciclo, no el texto del bot.
 */
export async function preguntaPorAroSiCorresponde(conversationId: number, aro: number): Promise<string | null> {
  if (!politica.aperturaCorta) return null;
  const [previa] = await sql<{ id: number }[]>`
    select f.id from funnel_events f join conversations c on c.id = f.conversation_id
    where f.conversation_id = ${conversationId} and f.cycle = c.current_cycle
      and f.type = 'respuesta_directa' and f.data->>'route' = 'pregunta_por_aro'
    limit 1
  `;
  if (previa) return null;
  await logFunnelEvent(conversationId, "respuesta_directa", { route: "pregunta_por_aro", aro }).catch(() => undefined);
  return preguntaParaCerrarLaMedida(aro);
}

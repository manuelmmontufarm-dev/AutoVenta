/**
 * Guardar y leer la OFERTA DE COTIZAR como hecho (`domain/ofertaVigente.ts`).
 *
 * Escriben las tres puertas que guardan lo que el bot le manda al cliente
 * —turno (`index.ts`), retomada (`resumeBot.ts`) y seguimiento
 * (`followUpProcessor.ts`)—, una vez, sobre el texto que se está enviando, en
 * `metadata.oferta` del mensaje. Si la puerta ya sabía qué ofreció (la
 * equivalente de `generar_cotizacion`, el menú de `preparar_opciones`, el
 * «¿Cuál le cotizo?» de la ruta directa), lo declara y manda lo declarado.
 *
 * Leen el agente, la ruta directa, los candados de `generar_cotizacion` y el
 * Guardián, todos con `leerOfertaVigente`.
 */
import { sql } from "../db/client.js";
import { findByCode } from "./catalog.js";
import {
  ofertaEnElTexto, ofertaVigente, type FilaDelHilo, type OfertaDeCotizar, type OfertaLeida, type OpcionDeLamina,
} from "../domain/ofertaVigente.js";
import { soloLoDelTurno } from "../pipeline/corteDelTurno.js";

/** La última lámina del ciclo, para resolver qué llanta nombra la oferta. */
async function laminaVigente(conversationId: number, cycle: number): Promise<OpcionDeLamina[]> {
  const [pieza] = await sql<{ codes: unknown }[]>`
    select metadata->'codes' as codes from messages
    where conversation_id=${conversationId} and cycle=${cycle} and metadata->>'piece'='options'
    order by created_at desc, id desc limit 1
  `;
  const codigos = Array.isArray(pieza?.codes) ? pieza.codes.map(String) : [];
  return codigos
    .map((codigo) => findByCode(codigo))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ codigo: p.code, marca: p.brand ?? "", diseno: p.design ?? "", medida: p.sizeLabel ?? null }));
}

/**
 * El metadato que lleva el mensaje que se está enviando: `{ oferta }`, con
 * `null` cuando el texto no ofrece cotizar. Que la clave exista siempre es lo
 * que distingue un hilo con hechos de uno anterior a este cambio.
 */
export async function metadataDeOferta(
  conversationId: number,
  cycle: number,
  textoEnviado: string | null | undefined,
  declarada?: OfertaDeCotizar | null,
): Promise<{ oferta: OfertaDeCotizar | null }> {
  try {
    const oferta = ofertaEnElTexto(textoEnviado, await laminaVigente(conversationId, cycle), declarada);
    if (oferta) console.log(`📝 Oferta de cotizar guardada en la conv ${conversationId}: ${JSON.stringify(oferta)}`);
    return { oferta };
  } catch (error) {
    console.error(`⚠️ No se pudo calcular la oferta de la conv ${conversationId}:`, error);
    return { oferta: null };
  }
}

/** La oferta vigente del ciclo, leída del hecho guardado (o marcada para el respaldo). */
export async function leerOfertaVigente(
  conversationId: number,
  cycle: number,
  opciones: {
    /**
     * Cortar el hilo en el último mensaje del cliente: el Guardián revisa con
     * las piezas de ESTE turno ya guardadas (la lámina sale antes que el texto),
     * y sin el corte contaría el mensaje actual como uno «en el medio».
     */
    hastaElUltimoDelCliente?: boolean;
  } = {},
): Promise<OfertaLeida> {
  const filas = await sql<{
    role: string; content: string | null; metadata: Record<string, unknown> | null; author_kind: string | null; type: string | null;
  }[]>`
    select role, content, metadata, author_kind, type from messages
    where conversation_id=${conversationId} and cycle=${cycle} ${soloLoDelTurno()}
    order by created_at desc, id desc limit 24
  `;
  let hilo: FilaDelHilo[] = [...filas].reverse();
  if (opciones.hastaElUltimoDelCliente) {
    const ultimo = hilo.map((f) => f.role).lastIndexOf("user");
    if (ultimo >= 0) hilo = hilo.slice(0, ultimo + 1);
  }
  const leida = ofertaVigente(hilo);
  if (leida.fuente === "respaldo") {
    console.log(`↩️ Conv ${conversationId}: sin hecho de oferta en el hilo (anterior al deploy); se lee el texto como respaldo.`);
  }
  return leida;
}

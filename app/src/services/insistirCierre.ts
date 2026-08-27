/**
 * El candado que agrega la pregunta que falta cuando el turno la perdió.
 *
 * Ver `domain/preguntaPendiente.ts` para el porqué. Acá vive lo que necesita
 * base: qué sabe la conversación, qué cotización está viva y cuánto ahorra —
 * porque la pregunta del día lleva el monto del descuento (Joaquín, 26-ago).
 *
 * Corre al FINAL del turno, junto al aviso de stock y los números de
 * cotización, y por el mismo motivo: el Ángel Guardián reescribe el texto
 * entero y puede quitar la pregunta al resumir.
 */
import { business } from "../config.js";
import { sql } from "../db/client.js";
import { ahorroDeLaCotizacion, type LineaCotizada } from "../domain/ahorro.js";
import { cantidadQueConfirmamos } from "../domain/cantidadGrande.js";
import { preguntamosElDia } from "../domain/customerCommitment.js";
import { datoQueFalta } from "../domain/preguntaPendiente.js";
import { PREGUNTA_DE_LOCAL, preguntamosElLocal } from "../domain/storeSelection.js";
import { buildVisitPlanQuestion, composeBlocks, MAX_BLOCKS } from "./quoteMessages.js";

/** El mismo separador que parte el turno en mensajes (`splitBlocks`). */
const BLOCK_SEPARATOR_RE = /\n\s*-{3,}\s*\n/;

export interface CierreInsistido {
  texto: string;
  /** Qué se agregó, o `null` si el turno ya preguntaba lo que había que preguntar. */
  agregado: "local" | "dia" | null;
}

export async function insistirConLoQueFalta(
  conversationId: number,
  cycle: number,
  texto: string,
): Promise<CierreInsistido> {
  const [facts] = await sql<{
    nearest_store: string | null; visit_date: Date | null;
  }[]>`
    select nearest_store, visit_date from conversations where id=${conversationId}
  `;
  const [cotizacion] = await sql<{ items: LineaCotizada[] | null }[]>`
    select items from quotes
    where conversation_id=${conversationId} and cycle=${cycle}
    order by created_at desc limit 1
  `;
  const falta = datoQueFalta({
    hayCotizacion: Boolean(cotizacion),
    localElegido: Boolean(facts?.nearest_store),
    visitaRegistrada: Boolean(facts?.visit_date),
  });
  if (!falta) return { texto, agregado: null };

  // Si el turno está esperando OTRA respuesta que bloquea el funnel —confirmar
  // una cantidad grande antes de firmarla—, no se le encima una segunda
  // pregunta. Visto en el simulador el 27-ago: al «quiero 20 llantas» le
  // salieron juntas «¿me confirma que son 20?» y «¿a cuál local le queda mejor
  // ir?», y dos preguntas en un mensaje son la forma más rápida de que
  // conteste una sola.
  if (cantidadQueConfirmamos(texto) !== null) return { texto, agregado: null };

  // Si el turno YA la pregunta, no se toca: repetirla sería el ruido que este
  // candado quiere evitar, no arreglar.
  if (falta === "local" && preguntamosElLocal(texto)) return { texto, agregado: null };
  if (falta === "dia" && preguntamosElDia(texto)) return { texto, agregado: null };

  const pregunta = falta === "local"
    ? `${PREGUNTA_DE_LOCAL} 📍`
    : buildVisitPlanQuestion({
        conDescuentoAutorizado: false,
        locales: business.stores.map((store) => store.name),
        localElegido: facts?.nearest_store ?? null,
        ahorro: ahorroDeLaCotizacion(cotizacion?.items ?? null),
        // Los mapas ya salieron con la cotización; acá solo va la pregunta.
        enlaces: false,
      });
  // La pregunta tiene que SOBREVIVIR el corte. `splitBlocks` manda a lo sumo
  // MAX_BLOCKS mensajes por turno, así que si el texto ya viene lleno, agregar
  // la pregunta al final la borraría en silencio — que es peor que no
  // agregarla. Se le hace sitio soltando el bloque más viejo.
  const bloques = texto.split(BLOCK_SEPARATOR_RE).map((b) => b.trim()).filter(Boolean);
  const conSitio = bloques.slice(0, MAX_BLOCKS - 1);
  return { texto: composeBlocks(...conSitio, pregunta), agregado: falta };
}

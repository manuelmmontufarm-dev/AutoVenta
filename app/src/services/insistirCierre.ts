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
import { preguntaElDia, rechazaLosDiasPropuestos } from "../domain/customerCommitment.js";
import { datoQueFalta } from "../domain/preguntaPendiente.js";
import { despedidaQueCorresponde } from "../domain/cierrePerdido.js";
import { esCierreComercialDelTurno } from "../domain/cierreTurno.js";
import { PREGUNTA_DE_LOCAL, preguntaElLocal } from "../domain/storeSelection.js";
import { buildVisitPlanQuestion, composeBlocks, MAX_BLOCKS } from "./quoteMessages.js";
import type { Stage } from "./conversations.js";

/** El mismo separador que parte el turno en mensajes (`splitBlocks`). */
const BLOCK_SEPARATOR_RE = /\n\s*-{3,}\s*\n/;

export interface CierreInsistido {
  texto: string;
  /** Qué se agregó, o `null` si el turno ya preguntaba lo que había que preguntar. */
  agregado: "local" | "dia" | null;
}

async function ultimoTextoDelBot(conversationId: number, cycle: number): Promise<string | null> {
  const [row] = await sql<{ content: string | null }[]>`
    select content from messages
    where conversation_id=${conversationId} and cycle=${cycle}
      and role='assistant' and type='text' and author_kind='bot'
      and id < coalesce((
        select max(id) from messages
        where conversation_id=${conversationId} and cycle=${cycle} and direction='inbound'
      ), 9223372036854775807)
    order by created_at desc, id desc limit 1
  `;
  return row?.content ?? null;
}

function quitarPreguntaFinal(texto: string, esLaPregunta: (bloque: string) => boolean): string {
  const bloques = texto.split(BLOCK_SEPARATOR_RE).map((b) => b.trim()).filter(Boolean);
  if (bloques.length > 1) {
    return esLaPregunta(bloques[bloques.length - 1])
      ? composeBlocks(...bloques.slice(0, -1))
      : texto;
  }
  const unico = bloques[0] ?? texto;
  const abre = unico.lastIndexOf("¿");
  return abre > 0 && esLaPregunta(unico.slice(abre)) ? unico.slice(0, abre).trim() : unico;
}

/**
 * Si la misma pregunta quedó al final de dos turnos consecutivos, este turno
 * responde lo que el cliente preguntó y descansa. En el siguiente puede volver
 * a pedir el dato: no se abandona el cierre, se evita sonar como un bucle.
 */
export async function sinPreguntaPendienteConsecutiva(
  conversationId: number,
  cycle: number,
  texto: string,
  textoDelCliente?: string | null,
): Promise<string> {
  const anterior = await ultimoTextoDelBot(conversationId, cycle);
  if (!anterior) return texto;
  if (preguntaElLocal(anterior) && preguntaElLocal(texto)) {
    return quitarPreguntaFinal(texto, preguntaElLocal);
  }
  if (preguntaElDia(anterior) && preguntaElDia(texto)) {
    // «No puedo esos días» ES una respuesta a la pregunta del día: repreguntar
    // qué día SÍ puede no es un bucle, es lo único que hace avanzar la venta.
    // Producción 31-ago (conv 3 c20): este candado calló la repregunta y el
    // turno terminó en «aún no queda agendada la visita» sin preguntar nada.
    if (rechazaLosDiasPropuestos(textoDelCliente)) return texto;
    return quitarPreguntaFinal(texto, preguntaElDia);
  }
  return texto;
}

export async function insistirConLoQueFalta(
  conversationId: number,
  cycle: number,
  texto: string,
  textoDelCliente?: string | null,
  faseOperativa?: Stage,
): Promise<CierreInsistido> {
  // AL QUE SE DESPIDIÓ NO SE LE INSISTE. Este candado lee la base —¿hay
  // cotización?, ¿hay local?, ¿hay fecha?— y con eso decide que falta la
  // pregunta del día. Nada de eso cambia porque el cliente acabe de escribir
  // «ya compré en otro lugar»: la etapa la mueve el clasificador DESPUÉS de
  // enviar, así que en este momento sigue diciendo `seguimiento_venta`. Por eso
  // el 27-ago (conv 4732) salió «¿Qué día cree que puede pasar… con 25 % de
  // descuento, $73.92 menos» pegado a un adiós. El único dato que llega a
  // tiempo es el mensaje del cliente. Ver `domain/cierrePerdido.ts`.
  if (
    despedidaQueCorresponde(textoDelCliente ?? "")
    || esCierreComercialDelTurno(textoDelCliente ?? "")
  ) return { texto, agregado: null };
  // Simulador, 29-ago: una venta ya estaba en seguimiento, pero el cliente
  // pidió opciones para otra medida. El agente volvió bien a medir y mostró
  // opciones; este candado leyó el máximo histórico del Kanban y le pegó además
  // «¿a cuál local?». La pregunta de cierre solo corresponde cuando ESTE turno
  // sigue cerrando, no cuando el cliente acaba de volver a explorar.
  if (faseOperativa && !["cotizacion_enviada", "seguimiento_venta"].includes(faseOperativa)) {
    return { texto, agregado: null };
  }
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

  // El rechazo de los días propuestos cambia la regla del bucle: la pregunta
  // anterior YA fue contestada (con un «no»), así que repreguntar «¿qué día sí?»
  // no es insistir dos veces con lo mismo — es la única salida que avanza.
  const rechazoDias = falta === "dia" && rechazaLosDiasPropuestos(textoDelCliente);
  const anterior = await ultimoTextoDelBot(conversationId, cycle);
  if (falta === "local" && preguntaElLocal(anterior ?? "")) return { texto, agregado: null };
  if (falta === "dia" && !rechazoDias && preguntaElDia(anterior ?? "")) return { texto, agregado: null };


  // Si el turno YA la pregunta, no se toca: repetirla sería el ruido que este
  // candado quiere evitar, no arreglar.
  //
  // ESTRICTOS, no los laxos. `preguntamosElDia` se conforma con que el mensaje
  // NOMBRE un día, porque su trabajo es interpretar al cliente y ahí pasarse es
  // gratis. Acá decide si se calla el candado, y pasarse cuesta la venta:
  // producción, 27-ago, conv 3 c15 — el cliente tocó «Otro día» y el bot
  // contestó «cuando tenga claro *el día* que puede pasar, me avisa». El laxo
  // leyó «el día» como pregunta hecha, el candado se calló, y el turno terminó
  // sin preguntar nada. Manuel lo vio en su teléfono: «aquí debería preguntarle
  // qué día puede ir».
  if (falta === "local" && preguntaElLocal(texto)) return { texto, agregado: null };
  if (falta === "dia" && preguntaElDia(texto)) return { texto, agregado: null };

  const pregunta = falta === "local"
    ? `${PREGUNTA_DE_LOCAL} 📍`
    : rechazoDias
    // Tras un «no puedo esos días» la pregunta estándar sonaría a bucle; se
    // repregunta reconociendo el no y pidiendo el día que SÍ (Manuel, 31-ago:
    // «debería preguntar bueno entonces qué día sí podría»).
    ? `¿Qué día sí le vendría bien pasar${facts?.nearest_store ? ` por *${facts.nearest_store}*` : ""}? Lo anoto y le aviso al asesor. 📅`
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

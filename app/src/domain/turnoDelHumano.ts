/**
 * EL TURNO DEL HUMANO: quién le contesta al cliente cuando una persona ya
 * estuvo en el chat. Una sola regla, una sola fuente (familia 2-E, 28-sep).
 *
 * Conv 15426 (F-150, aro 20): el dueño atendió a mano el 21-sep hasta las
 * 16:45 y se despidió con «mañana nos volvemos a contactar». La pausa de 6 h
 * venció a las 22:45. Al día siguiente el cliente escribió «Buenas tardes» y
 * el bot contestó «¡Hola! 👋 Soy Martín… ¿Qué medida usa?», y le volvió a
 * pedir la medida dos veces más. La cadena, comprobada en la base:
 *
 *  1. 19,6 h de silencio → `reiniciarSiLaMemoriaVencio` abrió el ciclo 2
 *     (etapa «nuevo», ficha vacía), conservando `assigned_to='human'` y la
 *     pausa ya vencida;
 *  2. `isBotPaused` → falso (la pausa se mide sola, sin mirar quién habló);
 *  3. `devolverAlBotSiVencioLaPausa` → el chat pasó al bot;
 *  4. `lastOutboundText` del ciclo 2 → null → saludo de primer contacto.
 *
 * El plazo de la pausa decía «ya puede hablar el bot», pero el hilo decía otra
 * cosa: la última palabra era de una persona y el cliente le estaba
 * contestando a ella. Esa es la regla:
 *
 *  · pausa vigente → contesta el humano (como siempre);
 *  · el último saliente lo escribió una persona y nadie le devolvió el chat
 *    al bot (`assigned_to` ≠ 'bot') → contesta el humano, venza o no la pausa;
 *  · en cualquier otro caso, el bot.
 *
 * «Contesta el humano» NO es «nadie se entera»: quien llama levanta o refresca
 * una alerta alta para el asesor (`services/turnoDelHumano.ts`). Y el reloj de
 * 12 h (`rescatarChatsOlvidados`) sigue siendo la red: si nadie contesta en
 * horario de atención, devuelve el chat al bot con su alerta.
 *
 * Pura: sin base. La consulta y la alerta viven en el servicio.
 */

/** Los autores de un saliente que son personas, no el bot. */
const AUTORES_HUMANOS = new Set(["owner", "advisor"]);

export function esAutorHumano(autor: string | null | undefined): boolean {
  return AUTORES_HUMANOS.has(String(autor ?? ""));
}

export type QuienContesta =
  | { contesta: "bot" }
  | { contesta: "humano"; motivo: "pausa_vigente" | "el_humano_hablo_ultimo" };

export function quienContesta(input: {
  asignadoA: string | null | undefined;
  pausaHasta: Date | string | null | undefined;
  /** `author_kind` del último saliente del hilo, de CUALQUIER ciclo. */
  autorDelUltimoSaliente: string | null | undefined;
  ahora?: Date;
}): QuienContesta {
  const ahora = input.ahora ?? new Date();
  if (input.pausaHasta && new Date(input.pausaHasta).getTime() > ahora.getTime()) {
    return { contesta: "humano", motivo: "pausa_vigente" };
  }
  // `assigned_to='bot'` con una persona como último saliente solo pasa si
  // alguien se lo devolvió a propósito (panel, /restart, reapertura de un
  // cierre, rescate de 12 h). Esa es la única forma de sacarle el turno.
  if (input.asignadoA !== "bot" && esAutorHumano(input.autorDelUltimoSaliente)) {
    return { contesta: "humano", motivo: "el_humano_hablo_ultimo" };
  }
  return { contesta: "bot" };
}

/**
 * ¿Puede salir la bienvenida de primer contacto («Soy Martín… ¿Qué medida
 * usa?»)? No si lo último que leyó el cliente lo escribió una persona: para él
 * la conversación sigue, aunque el ciclo sea nuevo.
 */
export function puedeSaludarComoPrimerContacto(autorDelUltimoSaliente: string | null | undefined): boolean {
  return !esAutorHumano(autorDelUltimoSaliente);
}

/**
 * ¿Se puede olvidar el contexto por silencio (`reiniciarSiLaMemoriaVencio`)?
 * No si la última palabra fue de una persona: ese silencio es el del cliente
 * pensándolo («Ya te confirmo mañana»), no un chat frío. Vaciar la ficha ahí es
 * lo que hizo que el bot le pidiera otra vez la medida a quien ya la había dado.
 */
export function puedeOlvidarPorSilencio(autorDelUltimoSaliente: string | null | undefined): boolean {
  return !esAutorHumano(autorDelUltimoSaliente);
}

/** La alerta que ve el asesor cuando el cliente le escribió y el bot calló. */
export const TIPO_CLIENTE_SIN_RESPUESTA = "cliente_sin_respuesta";

export function claveClienteSinRespuesta(conversationId: number, cycle: number): string {
  return `${TIPO_CLIENTE_SIN_RESPUESTA}:${conversationId}:${cycle}`;
}

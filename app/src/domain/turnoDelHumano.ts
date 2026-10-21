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
 *  · pausa vigente → contesta el humano, salvo que la haya puesto la revisión
 *    automática y ninguna persona haya escrito en las últimas 48 h: ahí
 *    contesta el bot y el asesor recibe la alerta (familia 4, 20-oct);
 *  · el último saliente lo escribió una persona y nadie le devolvió el chat
 *    al bot (`assigned_to` ≠ 'bot') → contesta el humano, venza o no la pausa,
 *    mientras esa palabra tenga menos de 48 h; después, el bot y la alerta;
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

/**
 * POR QUÉ está pausado el bot (`conversations.bot_paused_reason`), escrito por
 * cada lugar que pausa en el momento de pausar (auditoría del 19-oct, familia
 * 4). Lo que se decide con él no se recupera releyendo mensajes.
 *
 *  · `revision_automatica` — el `advisor_review` de 24 h (`followUpProcessor`).
 *    Nadie humano está en el chat: es un recordatorio para el asesor.
 *  · `pidio_asesor` — el cliente pidió hablar con una persona.
 *  · `persona_escribio` — el asesor contestó (eco de su WhatsApp o panel).
 *  · `panel` — alguien tomó o pausó el chat desde el panel.
 *  · `opt_out` / `molesto` — el cliente pidió que no le escriban o se molestó.
 */
export type MotivoDePausa =
  | "revision_automatica"
  | "pidio_asesor"
  | "persona_escribio"
  | "panel"
  | "opt_out"
  | "molesto";

/**
 * Cuánto dura «la última palabra fue de una persona» (regla 3 de la familia 4).
 * Un mensaje del asesor del 31-ago no puede dejar mudo al cliente que vuelve el
 * 15-oct (chats 12639, 12666, 13435, 19480). Pasado este plazo contesta el bot
 * y el asesor recibe la alerta. Se usa también como «una persona estuvo en el
 * chat en esta visita» para la pausa automática.
 */
export const HORAS_DEL_TURNO_HUMANO = 48;

export type QuienContesta =
  | {
      contesta: "bot";
      /**
       * El bot contesta, pero había una razón para que no lo hiciera y el
       * asesor tiene que enterarse: la pausa la puso la revisión automática y
       * no hay ninguna persona en el chat, o la última persona que habló lo
       * hizo hace más de `HORAS_DEL_TURNO_HUMANO`. Quien llama le devuelve el
       * chat al bot y deja la alerta.
       */
      retoma?: "pausa_automatica" | "humano_hace_mucho";
    }
  | { contesta: "humano"; motivo: "pausa_vigente" | "el_humano_hablo_ultimo" };

function instante(fecha: Date | string | null | undefined): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  // 'infinity' llega de postgres.js como Invalid Date: no es una fecha que
  // se pueda comparar, y la pausa infinita es un residuo de antes del 28-sep.
  return Number.isFinite(t) ? t : null;
}

export function quienContesta(input: {
  asignadoA: string | null | undefined;
  pausaHasta: Date | string | null | undefined;
  /** Por qué se pausó (`bot_paused_reason`). Nulo = pausa vieja, de una persona. */
  motivoDeLaPausa?: string | null;
  /** `author_kind` del último saliente del hilo, de CUALQUIER ciclo. */
  autorDelUltimoSaliente: string | null | undefined;
  /** Cuándo escribió por última vez una persona (owner/advisor), cualquier ciclo. */
  ultimoSalienteHumanoEn?: Date | string | null;
  horasDelTurnoHumano?: number;
  ahora?: Date;
}): QuienContesta {
  const ahora = (input.ahora ?? new Date()).getTime();
  const plazo = (input.horasDelTurnoHumano ?? HORAS_DEL_TURNO_HUMANO) * 3_600_000;
  const humanoEn = instante(input.ultimoSalienteHumanoEn);
  const personaReciente = humanoEn !== null && ahora - humanoEn < plazo;

  const pausa = instante(input.pausaHasta);
  if (pausa !== null && pausa > ahora) {
    // UNA PAUSA AUTOMÁTICA NO DEJA MUDO A QUIEN ACABA DE ESCRIBIR (chat 26121:
    // la revisión de 24 h pausó a las 12:29, el cliente preguntó «Marcas y
    // precios» a las 12:50 y la respuesta llegó a las 08:42 del día siguiente).
    // Si nadie humano está en el chat, contesta el bot y el asesor se entera.
    if (input.motivoDeLaPausa === "revision_automatica" && !personaReciente) {
      return { contesta: "bot", retoma: "pausa_automatica" };
    }
    return { contesta: "humano", motivo: "pausa_vigente" };
  }
  // `assigned_to='bot'` con una persona como último saliente solo pasa si
  // alguien se lo devolvió a propósito (panel, /restart, reapertura de un
  // cierre, rescate de 12 h). Esa es la única forma de sacarle el turno…
  if (input.asignadoA !== "bot" && esAutorHumano(input.autorDelUltimoSaliente)) {
    // …salvo el tiempo: la última palabra de una persona vence. Sin la fecha
    // (llamador viejo) se conserva la regla de siempre.
    if (humanoEn !== null && !personaReciente) return { contesta: "bot", retoma: "humano_hace_mucho" };
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

/**
 * La alerta que ve el asesor cuando el bot retomó un chat que tenía una
 * razón para ser de una persona (pausa automática, o una persona que habló
 * hace días). No es un error: es para que el asesor sepa que el cliente
 * volvió y qué le dijo el bot.
 */
export const TIPO_BOT_RETOMO_EL_CHAT = "bot_retomo_el_chat";

/** La alerta que ve el asesor cuando el cliente le escribió y el bot calló. */
export const TIPO_CLIENTE_SIN_RESPUESTA = "cliente_sin_respuesta";

export function claveClienteSinRespuesta(conversationId: number, cycle: number): string {
  return `${TIPO_CLIENTE_SIN_RESPUESTA}:${conversationId}:${cycle}`;
}

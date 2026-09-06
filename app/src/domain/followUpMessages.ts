import type { Stage } from "./pipeline.js";

export type FollowUpMessageKind =
  | "in_window_first"
  | "in_window_second"
  | "post_window"
  | "advisor_review";

export interface FollowUpMessageContext {
  name?: string | null;
  stage: Stage;
  tireSize?: string | null;
  selectedProductCode?: string | null;
  /**
   * El nombre legible de la llanta elegida («KENDA KR20»), para escribirlo en
   * el mensaje. `selectedProductCode` es un SKU interno («35405026») y llegó a
   * salirle al cliente tal cual — «la opción 35405026» — porque era lo único
   * que este contexto traía (pendiente anotado en la auditoría del 27-ago).
   * El código queda como SEÑAL de que hay producto elegido; al texto solo va
   * esta etiqueta, y si falta, la medida.
   */
  selectedProductLabel?: string | null;
  nearestStore?: string | null;
  customerCommitment?: string | null;
  /**
   * El día que el cliente dijo que viene, ya interpretado (conversations.visit_date).
   * Sin este dato el seguimiento volvía a preguntar «¿qué día te queda mejor?»
   * a quien ya había contestado «el viernes» — la amnesia que Manuel cazó el
   * 18-ago en el chat de +593 99 874 7699.
   */
  visitDate?: Date | null;
  /**
   * La hora en palabras del cliente («de 4 a 5 pm»), de
   * `conversations.visit_time_label`. La hora que lleva dentro `visitDate` es
   * relleno: escribirla convierte el recordatorio en una cita inventada.
   */
  visitTimeLabel?: string | null;
  quoteNumber?: string | null;
  activeDiscountAmount?: number | null;
  activeDiscountCondition?: string | null;
  activeDiscountFinalTotal?: number | null;
  /**
   * El bloque de mapas ya armado por quien llama (`buildStoreLinksBlock`): los
   * dos locales, o solo el suyo si ya eligió. Llega hecho para que este módulo
   * siga siendo dominio puro — aquí no se sabe qué locales tiene el negocio.
   */
  storeLinks?: string | null;
  /**
   * Cuántas llantas trajo la última pieza de opciones del ciclo. Sin este dato
   * la plantilla de «eligiendo» decía «compararla con la otra alternativa» a
   * 22 clientes que tenían UNA sola opción en pantalla (auditoría 2-6 sep,
   * conv 13825). `null` = no hubo pieza o no se sabe.
   */
  optionsCount?: number | null;
  /**
   * El cliente ya contestó el menú Costo/Equilibrio/Premium (o eligió por
   * nombre). Con esto en true, preguntarle «¿qué prioriza?» o «¿cuál le
   * gustó más?» es repreguntar: 9 seguimientos lo hicieron en la ventana
   * (conv 15193, «Premium»).
   */
  preferenceAnswered?: boolean;
}

/**
 * ¿Este seguimiento tiene que llevar los mapas pegados?
 *
 * Joaquín, 25-ago: «si a las ~3 horas no contesta, que el seguimiento mande las
 * ubicaciones (los dos links)». El caso es el cliente que recibió la cotización
 * y la pregunta por día y local, y no contestó ninguna de las dos: mandarle otra
 * vez la pregunta pelada no le agrega nada — los mapas sí, porque el dato que le
 * falta para contestar es justamente dónde queda cada local.
 *
 * Sí se repiten a propósito, aunque ya hayan salido con la pregunta. Ese es el
 * punto: el turno anterior no logró respuesta.
 *
 * Condiciones: solo en ventana (fuera de ella manda una plantilla de Meta, con
 * su copy fijo), solo con cotización viva —sin cotización todavía no hay visita
 * que coordinar y el mapa es ruido— y solo si falta el local o el día. Con los
 * dos datos en la mano el portón `visita_agendada` ni siquiera deja salir el
 * seguimiento.
 */
export function followUpNeedsStoreLinks(
  context: FollowUpMessageContext,
  kind: FollowUpMessageKind,
): boolean {
  if (kind !== "in_window_first" && kind !== "in_window_second") return false;
  if (!context.storeLinks?.trim()) return false;
  if (!context.quoteNumber) return false;
  return !context.nearestStore || !context.visitDate;
}

/** Extrae un código de modelo escrito explícitamente por un asesor (ej. R380, KR33A). */
export function inferProductCode(text?: string | null): string | null {
  if (!text) return null;
  const candidates = text.toUpperCase().match(/\b[A-Z][A-Z0-9-]{2,14}\b/g) ?? [];
  return candidates.reverse().find((value) =>
    /\d/.test(value) && !/^R\d{2}$/.test(value) && !/^(?:USD|IVA)\d*$/.test(value)
  ) ?? null;
}

function firstName(name?: string | null): string | null {
  const value = name?.trim().split(/\s+/)[0];
  return value && value.length <= 30 ? value : null;
}

function questionPrefix(context: FollowUpMessageContext, kind: FollowUpMessageKind): string {
  const name = firstName(context.name);
  // Solo el contacto tardío vuelve a usar un saludo; dentro de una conversación
  // activa se continúa el hilo sin reiniciar la conversación.
  return kind === "post_window" && name ? `Hola, ${name} 👋 ` : "";
}

/** «viernes 22 de agosto», en hora de Ecuador: el cliente lee días, no ISO. */
function diaVisita(fecha: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long",
    day: "numeric",
    month: "long",
    // Sin la coma que mete Intl («viernes, 22 de agosto»): en un WhatsApp se
    // escribe como se dice.
  }).format(fecha).replace(",", "");
}

/** «viernes 22 de agosto de 4 a 5 pm» — el día, y la hora solo si la dijo él. */
function cuandoVisita(fecha: Date, franja?: string | null): string {
  const dia = diaVisita(fecha);
  return franja?.trim() ? `${dia} ${franja.trim()}` : dia;
}

export function buildContextualFollowUpMessage(
  context: FollowUpMessageContext,
  kind: FollowUpMessageKind,
  now = new Date(),
): string {
  const texto = redactarSeguimiento(context, kind, now);
  return followUpNeedsStoreLinks(context, kind)
    ? `${texto}\n${context.storeLinks!.trim()}`
    : texto;
}

function redactarSeguimiento(
  context: FollowUpMessageContext,
  kind: FollowUpMessageKind,
  now: Date,
): string {
  const prefix = questionPrefix(context, kind);
  const size = context.tireSize ? ` ${context.tireSize}` : "";
  // NUNCA el SKU crudo: al texto va la etiqueta legible o nada.
  const product = context.selectedProductLabel?.trim() ? ` ${context.selectedProductLabel.trim()}` : "";

  if (kind === "advisor_review") {
    const detail = context.customerCommitment
      ? `Prometió: “${context.customerCommitment}”.`
      : context.quoteNumber
        ? "Tiene una cotización pendiente."
        : `La conversación quedó en ${context.stage.replaceAll("_", " ")}.`;
    return `Revisar personalmente: ${detail} Decidir si conviene continuar la conversación o marcarla como Perdida; nunca cerrarla automáticamente.`;
  }

  if (context.activeDiscountAmount && context.activeDiscountCondition && context.activeDiscountFinalTotal) {
    const amount = context.activeDiscountAmount.toFixed(2);
    const total = context.activeDiscountFinalTotal.toFixed(2);
    return kind === "in_window_second"
      ? `😊 Recuerde que tiene $${amount} de descuento EXTRA sobre el precio base. Este segundo descuento aplica únicamente si ${context.activeDiscountCondition}; cumpliéndolo, el total queda en $${total}. ¿Le ayudo a coordinarlo?`
      : `${prefix}✨ Tiene $${amount} de descuento EXTRA sobre el precio base. Para recibir este segundo descuento debe cumplir: ${context.activeDiscountCondition}; así el total queda en $${total}. ¿Coordinamos el siguiente paso?`;
  }

  if (context.customerCommitment || context.stage === "seguimiento_venta") {
    const commitment = context.customerCommitment ? ` lo que me comentó: “${context.customerCommitment}”` : " su visita";
    const store = context.nearestStore ? ` a ${context.nearestStore}` : "";
    const enStore = context.nearestStore ? ` en ${context.nearestStore}` : "";
    const visita = context.visitDate ?? null;
    const yaPaso = visita ? visita.getTime() < now.getTime() : false;

    // Día Y local ya confirmados, y el día todavía no llega: no queda NADA que
    // preguntar. Preguntarlo igual es lo que hace que el bot parezca no haber
    // leído la conversación.
    //
    // Hasta el 26-ago estos dos mensajes ni salían: el portón «visita_agendada»
    // los cancelaba. Joaquín y Manuel decidieron lo contrario —que salgan, pero
    // CONFIRMANDO—: el primero devuelve el plan tal como quedó y abre la puerta
    // a preguntas; el segundo es el «no se olvide». Un cliente que ya dijo
    // cuándo viene no necesita que le pregunten, necesita que se lo recuerden.
    //
    // Van en «usted» como el resto del cierre: en el chat del 24-ago el bot
    // trató de usted toda la conversación y el seguimiento le salió con un «tu
    // visita» que delataba que lo escribió otra parte del sistema.
    if (visita && !yaPaso && context.nearestStore) {
      const cuando = cuandoVisita(visita, context.visitTimeLabel);
      const cotizacion = context.quoteNumber
        ? " Lleve a mano su cotización para que le respeten el precio."
        : "";
      return kind === "in_window_second"
        ? `🔔 No se olvide: le esperamos el *${cuando}*${enStore}.${cotizacion} Si necesita moverlo a otro día, dígame y lo reagendo 😊`
        : `✅ Perfecto, le esperamos el *${cuando}*${enStore}. Si tiene cualquier pregunta antes de pasar, dígame nomás 😊`;
    }

    // El día llegó y pasó sin que viniera. Aquí volver a preguntar SÍ es nuevo:
    // lo que se pide es una fecha distinta, y se dice por qué.
    if (yaPaso && visita) {
      return kind === "in_window_second"
        ? `🚗 Le esperábamos el ${cuandoVisita(visita, context.visitTimeLabel)}${enStore} y no pudimos atenderle. ¿Le reagendo para otro día? 😊`
        : `${prefix}😊 Quedamos para el ${cuandoVisita(visita, context.visitTimeLabel)}${enStore} y no alcanzó a pasar. ¿Qué día le queda mejor y lo dejo anotado?`;
    }

    // Dijo que viene pero sin día exacto («esta semana»), o falta el local.
    return kind === "in_window_second"
      ? `🚗 Me quedé pendiente de${commitment}. ¿Qué día le quedaría más cómodo para coordinar${store}? 😊`
      : `${prefix}😊 Sobre${commitment}, ¿le ayudo a dejar lista la visita${store}?`;
  }

  if (context.stage === "cotizacion_enviada") {
    // El número no se le escribe al cliente (26-ago): `quoteNumber` sigue
    // siendo la señal de que HAY cotización, no un texto para mostrarle.
    const quote = "";
    return kind === "in_window_second"
      ? `🛞 Solo quería saber qué le pareció la opción${product || size} de la cotización${quote}. ¿Hay algo que quiera revisar antes de decidir? 😊`
      : `${prefix}📄 ¿Qué le pareció la cotización${quote}${size}? Si desea, revisamos juntos cualquier duda para que elija tranquilo 😊`;
  }

  // El cliente ya eligió (contestó el menú o nombró la llanta): lo único que
  // cabe es avanzar con ESA, no volver al menú. Vale para «eligiendo» y para
  // «medida confirmada», que es donde quedan los que contestaron el menú y no
  // recibieron cotización.
  const yaEligio = context.preferenceAnswered && (context.stage === "seleccionando" || context.stage === "medida_confirmada" || Boolean(context.selectedProductCode));
  if (yaEligio) {
    const laElegida = product ? `la${product}` : "la opción que eligió";
    return kind === "in_window_second"
      ? `😊 Quedé pendiente de ${laElegida}${size}. ¿Le dejo lista la cotización, o prefiere ver otra opción?`
      : `${prefix}🛞 ¿Avanzamos con ${laElegida}${size}? Si le sirve, le dejo la cotización lista 😊`;
  }

  if (context.stage === "seleccionando" || context.selectedProductCode) {
    const opciones = context.optionsCount ?? null;
    if (opciones === 1) {
      return kind === "in_window_second"
        ? `😊 ¿Cómo vio la opción${product}${size}? Si le sirve, le dejo la cotización lista.`
        : `${prefix}🛞 ¿Cómo vio la opción${product}${size}? Es la que tengo disponible en su medida; si le sirve, le dejo la cotización lista 😊`;
    }
    const comparar = opciones !== null && opciones > 2
      ? "compararla con las otras opciones"
      : "compararla con la otra opción";
    return kind === "in_window_second"
      ? `😊 De las opciones que vimos${size}, ¿cuál le gustó más? Si me cuenta qué prioriza, le ayudo a decidir.`
      : `${prefix}🛞 ¿Cómo vio la opción${product}${size}? También puedo ayudarle a ${comparar} 😊`;
  }

  // Sin medida guardada, la etapa «medida confirmada» miente: el cliente dio
  // solo el aro o el vehículo (conv 14348, 14042). Lo honesto es pedirla.
  if (context.stage === "medida_confirmada" && context.tireSize) {
    return kind === "in_window_second"
      ? `😊 Ya con la medida${size} estamos cerca. ¿Prefiere priorizar duración, comodidad o precio?`
      : `${prefix}🛞 Ya tengo su medida${size}. ¿Le ayudo a elegir la mejor opción según el uso que le da y su presupuesto?`;
  }

  return kind === "in_window_second"
    ? "😊 Solo me falta la medida de la llanta para ayudarle bien. ¿Me la comparte cuando pueda?"
    : `${prefix}👋 Para recomendarle opciones reales, ¿me confirma la medida que aparece en el costado de su llanta?`;
}

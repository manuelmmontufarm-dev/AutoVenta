/**
 * Avisos al asesor alrededor de la visita prometida.
 *
 * De dónde sale: el bot ya pregunta qué día puede pasar el cliente y el kanban
 * lo muestra, pero una fecha que nadie mira no sirve de nada. Joaquín lo pidió
 * en dos tiempos, y son dos momentos distintos de verdad:
 *
 *  1. **Cuando el cliente da la fecha.** Es el instante en que la conversación
 *     pasa de "interesado" a "viene". El asesor tiene que estar pendiente de
 *     ESE chat desde ya, no enterarse el día que aparece en la tienda.
 *  2. **El día antes.** Una promesa de hace cinco días se enfría sola; un
 *     mensaje la víspera es lo que la convierte en visita. El aviso va al
 *     asesor para que empuje él, no al cliente: escribirle automáticamente a un
 *     cliente es otra decisión (plantillas, ventana de 24 h, opt-out) y no se
 *     toma de contrabando dentro de esta.
 *
 * Los dos avisos salen aunque el bot esté apagado. Apagado no significa que el
 * negocio pare: significa que las respuestas las da una persona, y esa persona
 * es justo la que necesita el aviso.
 */
import { sql } from "../db/client.js";
import { lineaCuponParaAviso } from "./coupons.js";
import { createBotAlert } from "./followUps.js";
import { notifyAdvisor } from "./advisorNotifications.js";

/** Día calendario en Guayaquil (YYYY-MM-DD). En UTC, la noche cae al día siguiente. */
export function diaGuayaquil(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(fecha);
}

/**
 * «sábado 9 de agosto, de 4 a 5 pm» — el asesor lee esto en el celular.
 *
 * La hora que lleva dentro `visit_date` casi nunca la dijo nadie: es el relleno
 * con el que se armó la fecha. Cuando el cliente SÍ dio una («de 4 a 5»,
 * guardada en `visit_time_label`), esa manda; cuando no, se escribe solo el
 * día. Escribir «10:00» de un cliente que dijo «de 4 a 5» es peor que no poner
 * hora: el asesor lo espera cuando no es.
 */
export function etiquetaVisita(fecha: Date, franja?: string | null): string {
  const dia = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long", day: "numeric", month: "long",
  }).format(fecha).replace(",", "");
  return franja?.trim() ? `${dia}, ${franja.trim()}` : dia;
}

/**
 * ¿Toca mandar ahora el recordatorio de la víspera?
 *
 * La condición "la visita es mañana" se cumple desde las 00:00, y el bucle
 * revisa cada cuarto de hora: sin esta ventana el asesor recibiría un WhatsApp
 * a medianoche. Se manda dentro del horario de atención (8:00–18:00), y el
 * primer chequeo que caiga ahí lo despacha — la deduplicación por fecha impide
 * que se repita durante el resto del día.
 */
export function esHoraDeRecordar(ahora: Date): boolean {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Guayaquil", hour: "2-digit", hour12: false,
    }).format(ahora),
  );
  return hora >= 8 && hora < 18;
}

/**
 * Clave de deduplicación de la fecha prometida. Lleva el día dentro a propósito:
 * repetir "voy el sábado" no genera un segundo aviso, pero cambiar de sábado a
 * lunes sí — porque para el asesor eso es información nueva.
 */
export function claveVisitaComprometida(
  conversationId: number, cycle: number, visitDate?: Date | null,
): string {
  return `${conversationId}:${cycle}:visita_comprometida:${visitDate ? diaGuayaquil(visitDate) : "sin-fecha"}`;
}

export function claveVisitaManana(conversationId: number, cycle: number, dia: string): string {
  return `${conversationId}:${cycle}:visita_manana:${dia}`;
}

export function claveVisitaHoy(conversationId: number, cycle: number, dia: string): string {
  return `${conversationId}:${cycle}:visita_hoy:${dia}`;
}

/** Aviso 1: el cliente acaba de decir cuándo viene. */
export async function avisarVisitaComprometida(input: {
  conversationId: number;
  cycle: number;
  /** Lo que escribió el cliente, tal cual. */
  texto: string;
  visitDate?: Date | null;
  /** «de 4 a 5 pm», si la dijo. */
  visitTimeLabel?: string | null;
}): Promise<void> {
  const dedupeKey = claveVisitaComprometida(input.conversationId, input.cycle, input.visitDate);
  const cuando = input.visitDate
    ? etiquetaVisita(input.visitDate, input.visitTimeLabel)
    : input.visitTimeLabel
      ? `sin día exacto (dijo ${input.visitTimeLabel}, falta la fecha)`
      : "sin día exacto (dio un tramo, no una fecha)";
  const resumen = input.visitDate
    ? `Cliente dijo cuándo viene: ${cuando}`
    : "Cliente dijo que viene, sin día exacto";
  const razon = `Escribió: «${input.texto.slice(0, 200)}». Interpretado como: ${cuando}.`;
  const accion = input.visitDate
    ? "Sigue esta conversación de cerca y confirma la hora. El día antes te llega un recordatorio."
    : "Pídele el día concreto: sin fecha no hay recordatorio que mandar ni visita que preparar.";

  await createBotAlert({
    conversationId: input.conversationId,
    cycle: input.cycle,
    type: "visita_comprometida",
    priority: "high",
    summary: resumen,
    exactReason: razon,
    suggestedAction: accion,
    dedupeKey,
  });
  await notifyAdvisor({
    conversationId: input.conversationId,
    cycle: input.cycle,
    eventType: "visita_comprometida",
    dedupeKey,
    title: resumen,
    reason: razon,
    action: accion,
    details: await detallesDeVenta(input.conversationId),
  });
}

interface VisitaPendiente {
  id: number;
  cycle: number;
  visit_date: Date;
  visit_time_label: string | null;
  commitment: string | null;
}

/**
 * Visitas prometidas para un día concreto, en conversaciones todavía abiertas.
 *
 * Deja fuera a quien YA se anunció hoy con el aviso de "dijo cuándo viene" para
 * esa misma fecha. «Voy mañana» es de las respuestas más comunes, y sin este
 * filtro el asesor recibía dos WhatsApp con quince minutos de diferencia
 * diciéndole lo mismo — la forma más rápida de que empiece a ignorarlos.
 */
export async function visitasDelDia(dia: string, ahora: Date): Promise<VisitaPendiente[]> {
  return sql<VisitaPendiente[]>`
    select c.id, c.current_cycle as cycle, c.visit_date, c.visit_time_label,
      case when c.customer_commitment_cycle = c.current_cycle
        then c.customer_commitment end as commitment
    from conversations c
    where c.status = 'open'
      and c.visit_date is not null
      and to_char(c.visit_date at time zone 'America/Guayaquil', 'YYYY-MM-DD') = ${dia}
      and not exists (
        select 1 from advisor_notifications n
        where n.conversation_id = c.id
          and n.event_type = 'visita_comprometida'
          and n.dedupe_key = c.id || ':' || c.current_cycle || ':visita_comprometida:' || ${dia}
          and n.created_at at time zone 'America/Guayaquil'
              >= date_trunc('day', ${ahora}::timestamptz at time zone 'America/Guayaquil')
      )
    order by c.visit_date
  `;
}

/**
 * Cuerpo común de los dos barridos por día. Lo único que cambia entre la víspera
 * y el día mismo es qué día se mira y qué se le pide al asesor que haga; el
 * resto —horario, deduplicación, detalles de venta— tiene que ser idéntico o los
 * dos avisos se comportan distinto sin que nadie lo haya decidido.
 */
async function barrerVisitasDelDia(input: {
  dia: string;
  ahora: Date;
  evento: "visita_manana" | "visita_hoy";
  dedupe: (conversationId: number, cycle: number, dia: string) => string;
  resumen: (cuando: string) => string;
  accion: string;
}): Promise<number> {
  const visitas = await visitasDelDia(input.dia, input.ahora);
  let avisados = 0;
  for (const visita of visitas) {
    const dedupeKey = input.dedupe(visita.id, visita.cycle, input.dia);
    const resumen = input.resumen(etiquetaVisita(visita.visit_date, visita.visit_time_label));
    const razon = visita.commitment
      ? `Lo prometió él mismo: «${visita.commitment.slice(0, 200)}».`
      : "Quedó agendado en la conversación.";
    await createBotAlert({
      conversationId: visita.id,
      cycle: visita.cycle,
      type: input.evento,
      priority: "high",
      summary: resumen,
      exactReason: razon,
      suggestedAction: input.accion,
      dedupeKey,
    });
    const envio = await notifyAdvisor({
      conversationId: visita.id,
      cycle: visita.cycle,
      eventType: input.evento,
      dedupeKey,
      title: resumen,
      reason: razon,
      action: input.accion,
      details: await detallesDeVenta(visita.id),
    });
    if (envio.sent) avisados += 1;
  }
  return avisados;
}

/**
 * Aviso 2: barrido de las visitas de mañana. Lo llama el worker; devuelve
 * cuántos avisos nuevos salieron (0 si no es la hora o si ya se avisaron).
 */
export async function revisarVisitasDeManana(ahora = new Date()): Promise<number> {
  if (!esHoraDeRecordar(ahora)) return 0;
  return barrerVisitasDelDia({
    dia: diaGuayaquil(new Date(ahora.getTime() + 86_400_000)),
    ahora,
    evento: "visita_manana",
    dedupe: claveVisitaManana,
    resumen: (cuando) => `Mañana viene un cliente: ${cuando}`,
    accion: "Escríbele hoy para confirmar la hora y tener las llantas listas cuando llegue.",
  });
}

/**
 * Aviso 3: las visitas de HOY, a primera hora hábil.
 *
 * La víspera sirve para preparar; hoy sirve para atender. Son dos trabajos
 * distintos y el asesor de local necesita los dos: el recordatorio de ayer se
 * pierde entre los mensajes de la tarde, y quien abre la tienda a las ocho no
 * tiene por qué acordarse de una promesa de hace cinco días.
 *
 * Comparte la ventana horaria y la deduplicación por día con el de mañana: el
 * bucle pasa cada cuarto de hora y el asesor recibe un solo mensaje.
 */
export async function revisarVisitasDeHoy(ahora = new Date()): Promise<number> {
  if (!esHoraDeRecordar(ahora)) return 0;
  return barrerVisitasDelDia({
    dia: diaGuayaquil(ahora),
    ahora,
    evento: "visita_hoy",
    dedupe: claveVisitaHoy,
    resumen: (cuando) => `Hoy viene un cliente: ${cuando}`,
    accion: "Ten listas las llantas y confírmale la hora: hoy es el día.",
  });
}

/**
 * Medida, total cotizado, local y CUPÓN: lo que el asesor necesita sin abrir el
 * panel.
 *
 * El cupón va aquí y no en un aviso aparte porque es el mismo dato del acuerdo:
 * «viene el lunes a Quito Sur, cotizó $555.57, su código es DT-PUMA47». Con eso
 * el asesor valida al cliente leyendo su propio WhatsApp —sin panel, sin base—
 * y en caja pueden cotejar el código que dicta la persona contra el que se
 * emitió. Lo pidió Manuel el 15-ago: el código tiene que viajar con todos los
 * acuerdos de visita, no solo con el mensaje al cliente.
 *
 * Cuando el cupón está apagado no aparece la línea y el aviso queda idéntico a
 * como era.
 */
async function detallesDeVenta(conversationId: number): Promise<string[]> {
  const [fila] = await sql<{
    tire_size: string | null; nearest_store: string | null;
    total: string | number | null; current_cycle: number;
  }[]>`
    select c.tire_size, c.nearest_store, c.current_cycle, q.total
    from conversations c
    left join lateral (
      select total from quotes
      where conversation_id = c.id and cycle = c.current_cycle
      order by created_at desc limit 1
    ) q on true
    where c.id = ${conversationId}
  `;
  const cupon = fila
    ? await lineaCuponParaAviso(conversationId, fila.current_cycle)
    : null;
  return [
    fila?.tire_size ? `📏 ${fila.tire_size}` : "",
    fila?.total != null ? `💵 Cotizado: $${Number(fila.total).toFixed(2)}` : "📄 Sin cotización todavía",
    fila?.nearest_store ? `🏬 ${fila.nearest_store}` : "",
    cupon ?? "",
  ].filter(Boolean);
}

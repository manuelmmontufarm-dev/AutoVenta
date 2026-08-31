/**
 * AutoVenta — bot de ventas de llantas por WhatsApp.
 * Punto de entrada: conecta webhook → pipeline → agente → WhatsApp.
 */
import { config } from "./config.js";
import { createServer } from "./server/webhook.js";

// Las rutas async del panel (admin.ts) corren sin try/catch y Express 4 no
// captura sus promesas rechazadas: un ECONNRESET de Postgres en medio de una
// consulta (p. ej. listFollowUpBoard) se volvía unhandledRejection y Node ≥15
// mataba el proceso entero — así se cayó Depot Tire el 20-ago. El bot debe
// sobrevivir a un corte puntual de red con la base; la request afectada se
// pierde, el proceso no.
process.on("unhandledRejection", (reason) => {
  console.error(
    "🧯 Promesa rechazada sin capturar (el proceso sigue vivo):",
    reason instanceof Error ? reason.stack ?? reason.message : reason,
  );
});
import { initWa, setWaHandlers, sendCustomerText, sendCustomerButtons, showTyping, downloadMedia } from "./wa/client.js";
import { describirFotoDeLlanta } from "./services/vision.js";
import { transcribirAudio } from "./services/transcripcion.js";
import { conResumenDeLinks } from "./services/linkPreview.js";
import { getPublicChannelConfig } from "./services/channel.js";
import { getPhaseFlags, activeLevel } from "./services/phases.js";
import { InboundPipeline } from "./pipeline/inbound.js";
import { runAgent } from "./agent/agent.js";
import type { AgentContext } from "./agent/tools.js";
import { classifyStage } from "./agent/classifier.js";
import { startCatalogSync } from "./services/catalog.js";
import { ensureSchema } from "./db/schema.js";
import {
  appendMessage,
  devolverAlBotSiVencioLaPausa,
  getOrCreateConversation,
  isBotPaused,
  lastOutboundText,
  logFunnelEvent,
  recordMessageStatus,
  setStage,
  setExplicitStore,
  registrarCompromisoDeVisita,
  previousInboundText,
  updateConversationFacts,
  reiniciarConversacion,
  yaProcesado,
} from "./services/conversations.js";
import { emitLiveEvent } from "./services/liveEvents.js";
import { registrarMensajeDeAsesor } from "./services/advisorWindow.js";
import { isBotActive } from "./services/botPower.js";
import {
  extractFlotationSizes, extractTireSizes, formatFlotationSize, formatTireSize,
} from "./domain/tireSize.js";
import {
  extractVehicleYear,
} from "./domain/salesIntent.js";
import { getHubMetrics } from "./services/hubData.js";
import {
  cancelPendingFollowUps,
  createBotAlert,
  handleInboundFollowUpState,
  scheduleConversationFollowUps,
} from "./services/followUps.js";
import { markDiscountNoticeSent } from "./services/discountOffers.js";
import { extractCustomerCommitment, preguntamosElDia } from "./domain/customerCommitment.js";
import { avisarVisitaComprometida } from "./services/visitAlerts.js";
import { emitirCuponDeConfirmacion } from "./services/coupons.js";
import { mensajeCupon } from "./domain/coupons.js";
import { authorizeConversationOutbound } from "./services/whatsappPolicy.js";
import { splitBlocks } from "./services/quoteMessages.js";
import { prepararSalida } from "./services/prepararSalida.js";
import { AVISO_DE_TRASPASO } from "./domain/pideAsesor.js";
import { flagRepetitiveConversation } from "./services/conversationQuality.js";
import { notifyPendingHumanRequests } from "./services/advisorNotifications.js";
import { startEmbeddedFollowUpWorker } from "./workers/embeddedFollowUpWorker.js";
import { extractExplicitStore, preguntamosElLocal } from "./domain/storeSelection.js";
import { tryDirectSalesRoute } from "./services/directSalesRoutes.js";
import { tryRecotizarPorCantidad } from "./services/recotizar.js";
import { firstContactReply, isGenericFirstContact } from "./domain/firstContact.js";
import { despedidaQueCorresponde } from "./domain/cierrePerdido.js";
import { botonesParaBloque, recortarTitulo, textoDeBoton, type BloqueConBotones } from "./domain/botones.js";
import { esComandoDeReinicio, MENSAJE_DE_REINICIO } from "./domain/reinicio.js";
import { algunLocalAbre, getStoreHours } from "./services/settings.js";
import { respuestaDeCierreDelTurno, tipoDeCierreDelTurno } from "./domain/cierreTurno.js";

/** Pausa entre bloques: suficiente para que se lean como mensajes seguidos y no como spam. */
const PAUSA_ENTRE_BLOQUES_MS = 900;

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pipeline = new InboundPipeline(async ({ from, name, text, waMessageIds, receivedAt }) => {
  // El mensaje ya quedó guardado en recibirMensaje(), antes de responderle 200
  // a Meta. Aquí solo se elabora la respuesta sobre el texto ya agrupado.
  const conversation = await getOrCreateConversation(from, name);
  const inboundSafety = await handleInboundFollowUpState(conversation.id, text);
  // La medida puede venir métrica (205/55R16) o en pulgadas (30x9.5R15). Sin
  // esta segunda, el bot no registraba nada y terminaba diciendo que no había.
  const parsedSize = extractTireSizes(text)[0];
  const parsedFlotation = parsedSize ? null : extractFlotationSizes(text)[0];
  const parsedVehicleYear = extractVehicleYear(text);
  const previousOutbound = await lastOutboundText(conversation.id);
  // «Al sur me resulta más fácil» solo es elección de local si acabamos de
  // preguntar el local — la misma lógica contextual que el día de visita.
  const respondiendoAlLocal = preguntamosElLocal(previousOutbound);
  const explicitStore = extractExplicitStore(text, { respondiendoAlLocal });
  // El día de la visita llega casi siempre como respuesta seca ("el sábado")
  // a la pregunta que el bot hace tras cotizar. Sin mirar lo que preguntamos
  // antes, esa respuesta no era un compromiso para nadie.
  // Haber preguntado el LOCAL también abre la puerta al día. Desde el 26-ago el
  // turno de la cotización pregunta solo el local (Joaquín: primero a cuál va,
  // después qué día), así que nuestro último mensaje ya no nombra ningún día —
  // y sin esto un «al sur el viernes» registraba el local y tiraba el viernes,
  // que el bot volvía a preguntar en el turno siguiente. Los dos nombres de
  // local en nuestro mensaje son señal suficiente de que estamos planificando
  // la visita: un día suelto en la respuesta es sobre eso.
  const commitment = extractCustomerCommitment(text, receivedAt, {
    respondiendoAlDia: preguntamosElDia(previousOutbound) || respondiendoAlLocal,
  });
  await updateConversationFacts(conversation.id, {
    ...(parsedSize ? { tireSize: formatTireSize(parsedSize) } : {}),
    ...(parsedFlotation ? { tireSize: formatFlotationSize(parsedFlotation) } : {}),
    ...(parsedVehicleYear ? { vehicleYear: parsedVehicleYear } : {}),
  });
  // La visita va aparte porque hay que JUNTARLA con lo dicho antes: la hora
  // suele llegar en un mensaje y el día en el siguiente.
  const visitaRegistrada = commitment
    ? await registrarCompromisoDeVisita(conversation.id, {
        texto: commitment.text,
        visitDate: commitment.visitDate,
        visitTimeLabel: commitment.visitTimeLabel,
      })
    : null;
  if (explicitStore) await setExplicitStore(conversation.id, explicitStore);
  // El aviso va aunque el bot esté apagado: apagado significa que contesta una
  // persona, y esa persona es justo la que tiene que enterarse de que este
  // cliente dijo cuándo viene. En segundo plano para no demorar la respuesta.
  if (commitment) {
    void avisarVisitaComprometida({
      conversationId: conversation.id,
      cycle: conversation.current_cycle,
      texto: commitment.text,
      visitDate: visitaRegistrada?.visitDate,
      visitTimeLabel: visitaRegistrada?.visitTimeLabel,
    }).catch((error) => console.error("⚠️ No se pudo avisar la visita comprometida:", error));
  }
  // Cupón de confirmación: se emite en el MISMO turno en que el cliente dice
  // cuándo viene, para que el código llegue pegado a esa confirmación y no en
  // un mensaje suelto que se lee sin contexto. Devuelve null mientras el cupón
  // esté apagado, que es el estado por defecto hasta la luz verde de Depot.
  // Esperado (no `void`) porque el mensaje se anexa a la respuesta de abajo.
  // `solo_hora` no cobra cupón: el texto dice «por confirmar su visita» y en
  // caja se paga de verdad. Quien dijo «de 4 a 5» y todavía no el día no
  // confirmó ninguna visita — se le anota y se le pregunta la fecha.
  const cupon = commitment && commitment.tipo !== "solo_hora"
    ? await emitirCuponDeConfirmacion({
        conversationId: conversation.id,
        cycle: conversation.current_cycle,
      })
    : null;
  emitLiveEvent("message", conversation.id);
  emitLiveEvent("sync", conversation.id);

  // Opt-out o molestia detienen el bot antes de typing, IA o cualquier envío.
  //
  // ESTE es el corte de verdad cuando el cliente pide un asesor: pasa acá,
  // antes de `isBotPaused` y antes de la política. Por eso el pedido salía MUDO
  // — el cliente no sabía si su mensaje había llegado ni cuándo le iban a
  // contestar. En la auditoría del 27-ago eso les pasó a 151 clientes, muchos
  // preguntando un precio o poniendo el día de la visita.
  if (inboundSafety.optedOut || inboundSafety.negative || inboundSafety.requestedHuman) {
    await avisarTraspasoSiLoPidio(conversation.id, from, inboundSafety);
    return;
  }

  if (conversation.stage === "nuevo") {
    await logFunnelEvent(conversation.id, "primer_mensaje");
    // La tarjeta no avanza porque el bot respondió: avanza únicamente cuando
    // el contenido del cliente demuestra una nueva sección comercial.
    await logFunnelEvent(conversation.id, "cliente_respondio");
  }

  // Interruptor global (Ajustes → apagar el bot). Va DESPUÉS de guardar el
  // mensaje: apagado el bot no contesta, pero el dueño sigue viendo todo lo que
  // le escriben y puede responder a mano desde el panel.
  if (!(await isBotActive())) return;

  // Handoff: si el dueño está atendiendo este chat a mano, el bot calla — pero
  // lo del cliente ya quedó guardado arriba para que el dueño lo lea en /mensajes.
  if (await isBotPaused(conversation)) return;

  // Llegar hasta aquí con el chat en 'human' significa que la pausa del handoff
  // ya venció: el plazo se cumplió y nadie lo devolvió. Vuelve al bot (decisión
  // del 8-ago) — si no, el bot redactaba y la política le bloqueaba el envío.
  if (await devolverAlBotSiVencioLaPausa(conversation.id)) {
    console.log(`🤖 Venció la pausa del asesor en ${conversation.id}: el bot retoma la conversación.`);
    emitLiveEvent("sync", conversation.id);
  }

  // ¿Podríamos siquiera ENVIAR la respuesta? Preguntarlo antes de escribirla.
  //
  // El 8-ago Manuel lo describió exacto: «en la página sale como si responde
  // pero en vida real no». La cadena era esta: un asesor toma el chat
  // (assigned_to='human' + pausa de BOT_PAUSE_HOURS). Pasan esas horas, la
  // pausa vence pero `assigned_to` sigue en 'human' — nadie lo devuelve al bot.
  // Desde ahí, cada mensaje del cliente disparaba un turno COMPLETO del modelo
  // (herramientas, catálogo, a veces visión) y recién al final `sendCustomerText`
  // lo bloqueaba por política `human_control`. La respuesta se guardaba como
  // fallida y el panel la pintaba con doble check: plata gastada, mensaje que
  // nadie recibió, y un chat que parecía atendido.
  //
  // La misma comprobación ya existía en `resumeBotIfUnanswered`; faltaba justo
  // en el camino por el que entra el 100% de los mensajes.
  const permiso = await authorizeConversationOutbound({
    conversationId: conversation.id,
    contentType: "text",
    actor: "bot",
  });
  if (!permiso.allowed) {
    console.log(
      `🤐 El bot no responde en la conversación ${conversation.id}: ${permiso.code}. ` +
        "El mensaje del cliente quedó guardado; contesta un humano desde el panel.",
    );
    return;
  }

  // Recién aquí se sabe que el bot va a responder: "escribiendo…" honesto.
  void showTyping(waMessageIds[waMessageIds.length - 1]).catch(() => {});

  // Los links se abren AQUÍ, no en el webhook.
  //
  // Hacerlo antes de pipeline.push() invertía el orden de la conversación: el
  // debounce es de 5 s y un link se lleva hasta 10, así que el «¿cuánto cuesta?»
  // que el cliente escribe un segundo después entraba al buffer primero, se
  // respondía solo, y el mensaje del link llegaba tarde y provocaba un segundo
  // turno. Aquí el push ya ocurrió con el texto crudo (orden y agrupación
  // intactos) y la espera cae sobre el turno, después del showTyping — el
  // cliente ve "escribiendo…" durante toda la lectura del link.
  //
  // Efecto colateral asumido: en la base queda lo que el cliente escribió de
  // verdad (la URL cruda), no el resumen. El dato que vende —la medida— sí
  // persiste, porque se guarda en los HECHOS de la conversación aquí abajo.
  const textoConLinks = await conResumenDeLinks(text, from);
  if (textoConLinks !== text && !parsedSize && !parsedFlotation) {
    const medidaDelLink = extractTireSizes(textoConLinks)[0];
    const flotacionDelLink = medidaDelLink ? null : extractFlotationSizes(textoConLinks)[0];
    if (medidaDelLink || flotacionDelLink) {
      await updateConversationFacts(conversation.id, {
        tireSize: medidaDelLink
          ? formatTireSize(medidaDelLink)
          : formatFlotationSize(flotacionDelLink!),
      });
    }
  }

  const agentContext: AgentContext = { conversation, customerPhone: from, customerName: name,
    currentUserText: textoConLinks };
  // El saludo genérico de los anuncios no necesita gastar un turno de IA. Esta
  // respuesta fija deja claro que la medida es la vía rápida, no la única: el
  // bot también puede arrancar por vehículo, aro o uso. Si el cliente ya dio
  // cualquier dato concreto, sigue al agente completo para que lo aproveche.
  const isFirstGenericMessage = conversation.stage === "nuevo"
    && previousOutbound === null
    && isGenericFirstContact(textoConLinks);
  // Conv 11818, 27-ago-2026: «Ya Ise el pedido aquí en Ibarra gracias» terminó
  // recibiendo los mapas. El candado de `prepararSalida` sí cambiaba el texto
  // final por una despedida, pero una herramienta ya había mandado el mapa (y
  // en el simulador, la guía de medida) antes de que ese candado pudiera verlo.
  // Una salida terminal se reconoce aquí: las herramientas sirven para vender,
  // y cuando el cliente ya compró en otro lado no deben ejecutarse siquiera.
  const cierreAntesDeHerramientas = despedidaQueCorresponde(textoConLinks);
  const cierreDelTurno = cierreAntesDeHerramientas
    ? null
    : tipoDeCierreDelTurno(
        textoConLinks,
        await previousInboundText(conversation.id),
      );
  // Un cambio de cantidad NO se contesta con palabras: sale la pieza nueva.
  // El 27-ago (conv 3) el modelo prometió el ajuste dos turnos seguidos sin
  // llamar una sola herramienta, y el cliente nunca supo cuánto costaban 3
  // llantas. Va ANTES de la ruta de visita porque «deme solo 3» no es una
  // respuesta sobre el local ni sobre el día. Ver services/recotizar.ts.
  const directReply = cierreAntesDeHerramientas || cierreDelTurno
    ? null
    : isFirstGenericMessage
      ? firstContactReply()
      : (await tryRecotizarPorCantidad(
          { conversation, customerPhone: from, customerName: name, previousOutbound },
          textoConLinks,
        ))
        ?? await tryDirectSalesRoute(
          { conversation, customerPhone: from, explicitStore, commitment },
          textoConLinks,
        );
  if (isFirstGenericMessage) {
    await logFunnelEvent(conversation.id, "respuesta_directa", { route: "first_contact" });
  }
  const reply = cierreAntesDeHerramientas
    ?? (cierreDelTurno ? respuestaDeCierreDelTurno(cierreDelTurno) : null)
    ?? directReply
    ?? await runAgent(agentContext, textoConLinks);
  await flagRepetitiveConversation(conversation.id, reply);

  // Toda la cadena de candados vive en services/prepararSalida.ts, para que
  // valga igual por las cuatro puertas por las que el bot le habla a un cliente
  // —esta, `resumeBot` y `followUpProcessor`— y no solo por esta. El orden y su
  // porqué están allí, en `PASOS`.
  const salida = await prepararSalida(reply, {
    conversation, tipo: "respuesta", huella: agentContext.toolTrace ?? [],
    textoDelCliente: textoConLinks, faseOperativa: agentContext.faseOperativa,
    suprimirEmpujeComercial: Boolean(cierreAntesDeHerramientas || cierreDelTurno),
    consultaFueraDeCatalogo: agentContext.consultaFueraDeCatalogo,
  });
  if (!salida.texto) return;

  // Varios mensajes cortos en vez de uno largo: es como escribe el vendedor
  // humano de los chats que el cliente puso de ejemplo. Los bloques los separa
  // el agente con '---'; sin separadores esto envía un solo mensaje, igual que antes.
  //
  // Envío con red de seguridad: si Meta rechaza, la respuesta queda guardada
  // como "failed" y visible en el hub — nunca se pierde en silencio.
  const bloques = splitBlocks(salida.texto);
  // El cupón va como bloque aparte y al final: es un mensaje que el cliente va
  // a buscar días después en el chat, y mezclado dentro del párrafo del bot se
  // pierde. Solo cuando se acaba de emitir — si ya lo tenía, repetírselo cada
  // vez que cambia la fecha lo convierte en ruido.
  if (cupon && !cupon.yaExistia) {
    bloques.push(mensajeCupon({
      codigo: cupon.codigo,
      porcentaje: cupon.porcentaje,
    }));
  }
  // Los botones van SOLO en el último bloque: son la pregunta con la que cierra
  // el turno, y dos mensajes con botones seguidos se leen como formulario.
  // `null` es la respuesta normal — la mayoría de los turnos no terminan en una
  // pregunta de conjunto cerrado y salen como texto, igual que siempre.
  const conBotones = await botonesDelUltimoBloque(conversation, bloques, textoConLinks);
  for (const [indice, bloque] of bloques.entries()) {
    if (indice > 0) await esperar(PAUSA_ENTRE_BLOQUES_MS);
    try {
      const botones = indice === bloques.length - 1 ? conBotones : null;
      // Se GUARDA el bloque completo, no el cuerpo recortado: los detectores
      // del dominio leen los últimos salientes para entender la respuesta del
      // cliente, y tienen que ver la misma pregunta que se hizo.
      const sentId = botones
        ? await sendCustomerButtons(conversation.id, from, botones.cuerpo, botones.botones)
        : await sendCustomerText(conversation.id, from, bloque);
      await appendMessage(conversation.id, "assistant", bloque, sentId, {
        authorKind: "bot",
        status: "sent",
      });
    } catch (sendError) {
      console.error(`❌ No se pudo enviar la respuesta a ${from}:`, sendError);
      // Si un bloque no sale, los siguientes tampoco van a salir (ventana
      // cerrada, token vencido…). Se guardan todos como fallidos para que el
      // hub muestre la respuesta completa que el cliente nunca recibió.
      for (const restante of bloques.slice(indice)) {
        await appendMessage(conversation.id, "assistant", restante, undefined, {
          authorKind: "bot",
          status: "failed",
        });
      }
      break;
    }
  }
  if (agentContext.discountNotice) {
    await markDiscountNoticeSent(agentContext.discountNotice.source, agentContext.discountNotice.id);
  }
  emitLiveEvent("message", conversation.id);
  emitLiveEvent("sync", conversation.id);

  // «No gracias» cierra el empuje de ESTA visita sin falsear una venta
  // perdida ni borrar el historial. También cancela lo ya agendado: respetar
  // el no solo durante treinta segundos y escribirle mañana sería insistir.
  if (cierreDelTurno) {
    // Una compra explícitamente terminada sí es evidencia de funnel y debe
    // quedar en ventas. El clasificador resuelve este caso de forma
    // determinística (sin llamada de IA) antes de cortar los seguimientos.
    if (cierreDelTurno === "compra_terminada") {
      await classifyStage(conversation, text, reply);
    }
    await cancelPendingFollowUps(
      conversation.id,
      `cierre_comercial_del_turno:${cierreDelTurno}`,
      conversation.current_cycle,
    ).catch((error) => console.error("⚠️ No se pudo cancelar seguimiento tras cierre:", error));
    return;
  }

  // Post-turno: primero consolida la etapa y luego agenda contra ese estado.
  // Los seguimientos (Oportunidades) solo se agendan si la Fase 4 está activa.
  const consolidateStage = directReply
    ? Promise.resolve()
    : classifyStage(conversation, text, reply);
  void consolidateStage
    .then(async () => {
      const ph = await getPhaseFlags();
      if (ph.fase4) await scheduleConversationFollowUps(conversation.id);
    })
    .catch((error) => console.error("⚠️ No se pudo programar seguimiento:", error));
});

/**
 * EL PEDIDO DE ASESOR NO SE CONTESTA CON SILENCIO.
 *
 * Se llama desde el ÚNICO sitio que de verdad corta este turno: el corte por
 * `inboundSafety`, que pasa antes de `isBotPaused` y antes de la política. Lo
 * probé primero en esas dos puertas de más abajo y el aviso no salía nunca,
 * porque el turno ya había muerto arriba.
 *
 * Sin esto, el turno donde el cliente pide una persona sale MUDO: no sabe si su
 * mensaje llegó ni cuándo le contestan. En la auditoría del 27-ago eso les pasó
 * a 151 clientes. Ver `domain/pideAsesor.ts`.
 */
async function avisarTraspasoSiLoPidio(
  conversationId: number,
  telefono: string,
  inboundSafety: { requestedHuman: boolean; optedOut: boolean },
): Promise<void> {
  if (!inboundSafety.requestedHuman || inboundSafety.optedOut) return;
  const providerId = await sendCustomerText(conversationId, telefono, AVISO_DE_TRASPASO)
    .catch(() => null);
  await appendMessage(conversationId, "assistant", AVISO_DE_TRASPASO, providerId ?? undefined, {
    authorKind: "bot", status: providerId ? "sent" : "failed",
  }).catch(() => undefined);
  console.log(`🤝 Traspaso avisado en la conv ${conversationId}: el cliente pidió un asesor.`);
}

// Handlers del webhook: se registran una vez y se re-aplican solos cada vez que
// la instancia de WhatsApp se reconstruye (token pegado desde el panel).
/**
 * Guarda el mensaje del cliente ANTES de que el webhook responda 200, y recién
 * después lo pasa al agrupador.
 *
 * El orden importa: Meta entrega at-least-once y solo reintenta lo que no
 * recibió 200. Si se responde 200 con el mensaje todavía en un buffer en
 * memoria, un reinicio lo borra y Meta nunca lo reenvía — el cliente escribió y
 * nadie se entera. Persistir primero también le da a cada mensaje su propia
 * fila con su wa_message_id, que es lo que permite que la deduplicación
 * definitiva sea la de la base (unique) y no un Map que muere con el proceso.
 */
/**
 * Los botones del último bloque, o null si esa pregunta no es de conjunto
 * cerrado. Nunca lanza: un botón es un atajo, y ningún atajo puede impedir que
 * la respuesta salga como texto.
 */
async function botonesDelUltimoBloque(
  conversation: { id: number; current_cycle: number },
  bloques: readonly string[],
  mensajeDelCliente: string,
): Promise<BloqueConBotones | null> {
  const ultimo = bloques[bloques.length - 1];
  if (!ultimo) return null;
  try {
    const hours = await getStoreHours();
    const propuesta = botonesParaBloque(ultimo, {
      ciclo: conversation.current_cycle,
      mensajeDelCliente,
      estaAbierto: (fecha) => algunLocalAbre(hours, fecha),
    });
    if (!propuesta || propuesta.botones.length < 2) return null;
    return {
      ...propuesta,
      botones: propuesta.botones.map((b) => ({ ...b, titulo: recortarTitulo(b.titulo) })),
    };
  } catch (error) {
    console.warn("⚠️ No se pudieron armar los botones; sale como texto:", error);
    return null;
  }
}

async function recibirMensaje(
  from: string,
  name: string | undefined,
  texto: string,
  waMessageId: string,
  receivedAt: Date,
): Promise<void> {
  // Si escribe un asesor, su ventana de 24 h se reabre. No lo desvía del
  // pipeline a propósito: un asesor probando el bot tiene que ver que contesta.
  void registrarMensajeDeAsesor(from, receivedAt).catch((error) =>
    console.warn("⚠️ No se pudo refrescar la ventana del asesor:", error),
  );
  const conversation = await getOrCreateConversation(from, name);
  const esNuevo = await appendMessage(conversation.id, "user", texto, waMessageId, { occurredAt: receivedAt });
  if (!esNuevo) return; // reentrega de Meta: ya estaba guardado
  emitLiveEvent("message", conversation.id);

  // `/restart`: empezar de cero sin esperar. El mensaje del cliente ya quedó
  // guardado ARRIBA, en el ciclo que se va a archivar, así que el reinicio no
  // pierde el rastro de quién lo pidió. No entra al pipeline: no hay nada que
  // contestarle al agente y hacerlo correr sería gastar un turno de modelo.
  if (esComandoDeReinicio(texto)) {
    const reiniciada = await reiniciarConversacion(conversation.id);
    console.log(`🔄 Reinicio manual en la conv ${conversation.id}: ciclo ${reiniciada?.current_cycle ?? "?"}`);
    try {
      const sentId = await sendCustomerText(conversation.id, from, MENSAJE_DE_REINICIO, "owner");
      await appendMessage(conversation.id, "assistant", MENSAJE_DE_REINICIO, sentId, {
        authorKind: "bot", status: "sent",
      });
    } catch (error) {
      console.error(`❌ No se pudo avisar del reinicio a ${from}:`, error);
    }
    emitLiveEvent("message", conversation.id);
    emitLiveEvent("sync", conversation.id);
    return;
  }

  pipeline.push(from, waMessageId, texto, name, receivedAt);
}

setWaHandlers({
  message: async ({ from, name, message, received }) => {
    // Solo marca como leído. El "escribiendo…" se muestra en el pipeline cuando
    // el bot de verdad va a responder (pausado = ni typing ni respuesta).
    void received().catch(() => {});

    const receivedAt = new Date(Number(message.timestamp) * 1000);

    // Reentrega de Meta: se corta ANTES de gastar (16-ago). El deduplicado real
    // sigue estando en `appendMessage`, pero llega al final: para una foto o un
    // audio, la reentrega ya había bajado el media y pagado la llamada a la
    // visión antes de descubrir que el mensaje estaba repetido. Meta reintrega
    // en cuanto el 200 tarda, que es justo lo que pasa mientras se procesa una
    // foto — así que era el caso normal, no el raro.
    if (await yaProcesado(message.id)) {
      console.log(`↩️ Reentrega de Meta ignorada: ${message.id}`);
      return;
    }

    switch (message.type) {
      case "text":
        // El texto entra TAL CUAL y sin esperar a nada: el agrupador (debounce)
        // necesita ver los mensajes en el orden en que llegaron. Los links que
        // traiga se abren después, dentro del pipeline, con el "escribiendo…" ya
        // encendido.
        await recibirMensaje(from, name, message.text.body, message.id, receivedAt);
        break;
      case "interactive": {
        // UN TOQUE ES UN MENSAJE DE TEXTO.
        //
        // Se traduce al texto que el cliente habría escrito y entra por el
        // MISMO pipeline: el agente, los candados y los parsers de siempre.
        // Así el bot no tiene un camino nuevo que mantener, y un cliente que
        // ignora los botones y escribe recorre exactamente el mismo flujo.
        // La unión de la librería discrimina por la clave presente, así que se
        // estrecha con `in`: un `interactive` que no sea respuesta a un botón
        // ni a una lista (un flow, por ejemplo) se ignora sin romper nada.
        const inter = message.interactive;
        const respuesta = "button_reply" in inter
          ? inter.button_reply
          : "list_reply" in inter
            ? inter.list_reply
            : null;
        if (!respuesta) break;
        const conv = await getOrCreateConversation(from, name);
        await recibirMensaje(
          from,
          name,
          textoDeBoton(respuesta.id, respuesta.title, conv.current_cycle),
          message.id,
          receivedAt,
        );
        break;
      }
      case "location":
        await recibirMensaje(
          from,
          name,
          `[El cliente compartió su ubicación: lat ${message.location.latitude}, lng ${message.location.longitude}]`,
          message.id,
          receivedAt,
        );
        break;
      case "image": {
        // La foto se transcribe y entra como texto normal: el debounce la junta
        // con lo que el cliente escriba alrededor y extractTireSizes le saca la
        // medida sola. El ack a Meta ya salió arriba (received()), así que el
        // await de la descarga+visión no arriesga un reintento del webhook.
        const media = await downloadMedia(message.image.id);
        const caption = message.image.caption?.trim();
        const visionConversation = await getOrCreateConversation(from, name);
        const leido = media ? await describirFotoDeLlanta(media.bytes, media.mimeType, caption, {
          conversationId: visionConversation.id,
          stage: visionConversation.stage,
        }) : null;
        // El caption es lo que el cliente ESCRIBIÓ junto a la foto («Esa llanta
        // mi amigo, a como me da») — perderlo era perder la pregunta.
        const cuerpo = leido
          ? `[El cliente mandó una foto. Se lee: ${leido}]`
          : "[El cliente mandó una foto que no se pudo leer. Pídele con amabilidad que escriba lo que dice el costado de la llanta.]";
        await recibirMensaje(
          from,
          name,
          caption ? `${cuerpo}\n${caption}` : cuerpo,
          message.id,
          receivedAt,
        );
        break;
      }
      case "audio": {
        // La nota de voz se transcribe y entra como texto normal: el debounce la
        // junta con lo que el cliente escriba alrededor y extractTireSizes le
        // saca la medida sola. El ack a Meta ya salió arriba (received()), así
        // que el await de la descarga+transcripción no arriesga un reintento del
        // webhook.
        const media = await downloadMedia(message.audio.id);
        const dicho = media ? await transcribirAudio(media.bytes, media.mimeType) : null;
        const cuerpo = dicho
          ? `[El cliente mandó un audio. Dice: ${dicho}]`
          : "[El cliente mandó un audio que no se pudo escuchar. Pídele con amabilidad que escriba su consulta o mande la medida escrita.]";
        await recibirMensaje(from, name, cuerpo, message.id, receivedAt);
        break;
      }
      case "document": {
        // Mucha gente manda la foto del costado con la opción «Documento» de
        // WhatsApp, para que no se comprima: llega como `document` con mime
        // image/*, no como `image`. Antes caía en el `default` y se descartaba
        // sin dejar rastro — sin fila en `messages`, sin evento en el panel, sin
        // seguimiento y sin respuesta. Desde fuera parecía el bot caído.
        const mime = (message.document.mime_type ?? "").toLowerCase();
        if (mime.startsWith("image/")) {
          const media = await downloadMedia(message.document.id);
          const caption = message.document.caption?.trim();
          const docConversation = await getOrCreateConversation(from, name);
          const leido = media ? await describirFotoDeLlanta(media.bytes, media.mimeType, caption, {
            conversationId: docConversation.id,
            stage: docConversation.stage,
          }) : null;
          const cuerpo = leido
            ? `[El cliente mandó una foto (como documento). Se lee: ${leido}]`
            : "[El cliente mandó una foto como documento y no se pudo leer. Pídele con amabilidad que escriba lo que dice el costado de la llanta.]";
          await recibirMensaje(
            from,
            name,
            caption ? `${cuerpo}\n${caption}` : cuerpo,
            message.id,
            receivedAt,
          );
        } else {
          await recibirMensaje(
            from,
            name,
            "[El cliente mandó un archivo que el bot no puede abrir. Pídele con amabilidad la medida escrita o una foto del costado de la llanta.]",
            message.id,
            receivedAt,
          );
        }
        break;
      }
      default: {
        // Una REACCIÓN no es un mensaje: es un 👍 sobre algo que ya se dijo, y
        // contestarle «mándame la medida» es ruido. Esas y las de sistema se
        // siguen ignorando.
        //
        // Lo demás que el bot no sabe leer —video, sticker, contacto— SÍ se
        // registra, aunque no se pueda interpretar: así queda la fila, el panel
        // lo muestra, el seguimiento se agenda y el agente contesta algo. Un
        // cliente que graba un video del costado de la llanta y no recibe nada
        // es un lead que se pierde en silencio, y desde fuera parece el bot
        // caído.
        const mudos = ["reaction", "system", "order", "unknown", "unsupported"];
        if (mudos.includes(message.type)) break;
        await recibirMensaje(
          from,
          name,
          "[El cliente mandó un mensaje que el bot no puede ver (video, sticker o similar). Pídele con amabilidad la medida escrita o una foto del costado de la llanta.]",
          message.id,
          receivedAt,
        );
        break;
      }
    }
  },
  status: async ({ status, id, timestamp, error, conversation, pricing }) => {
    const conversationId = await recordMessageStatus(id, status, {
      error: error ?? null,
      conversation: conversation ?? null,
      pricing: pricing ?? null,
    }, new Date(Number(timestamp) * 1000));
    emitLiveEvent("status", conversationId ?? undefined);
    if (conversationId) emitLiveEvent("message", conversationId);
  },
});

// Aplica el esquema al arrancar (idempotente) → deploy sin paso manual de migración.
await ensureSchema();
await getHubMetrics(7);
console.log("✅ Esquema de base de datos listo");

// El canal se resuelve desde DB (settings) con respaldo del entorno. Sin
// credenciales completas, el webhook queda inactivo y se activa en caliente al
// guardar el canal desde el panel (PUT /api/channel → reloadWa).
const wa = await initWa();
const channel = await getPublicChannelConfig();
const phases = await getPhaseFlags();
console.log(
  wa
    ? `✅ Canal de WhatsApp listo (token: ${channel.tokenSource})`
    : "⚠️  Canal de WhatsApp sin configurar — el webhook está inactivo hasta llenarlo desde el panel.",
);
console.log(
  `✅ Fase activa: ${activeLevel(phases)} (fase2=${phases.fase2}, fase3=${phases.fase3}, fase4=${phases.fase4})`,
);

startCatalogSync();

// Seguimientos: se levantan aquí salvo que haya un servicio dedicado
// (FOLLOW_UP_WORKER=externo). Sin esto, un deploy sin servicio worker deja los
// seguimientos apagados en silencio.
startEmbeddedFollowUpWorker();

const app = createServer();
app.listen(config.port, () => {
  console.log(`🚀 AutoVenta escuchando en :${config.port}`);
  void notifyPendingHumanRequests()
    .then((sent) => {
      if (sent) console.log(`📲 ${sent} solicitud(es) humana(s) pendiente(s) notificadas al asesor`);
    })
    .catch((error) => console.error("⚠️ No se pudieron recuperar avisos pendientes al asesor:", error));
});

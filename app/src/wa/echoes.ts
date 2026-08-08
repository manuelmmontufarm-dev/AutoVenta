/**
 * Ecos de mensajes salientes (`message_echoes` / `smb_message_echoes`).
 *
 * De dónde sale esto: ticket 1286 del 6-ago-2026. El cliente Rodrigo Villamarín
 * mandó VEINTE mensajes seguidos (16:18 → 16:29 UTC) y en el panel no aparecía
 * ni una respuesta. Parecía que se le había ignorado, pero sus propios mensajes
 * delataban lo contrario: «Ok muchísimas gracias», «Haaaa ok», «Ok mi nombre es
 * Rodrigo Villamarín» — alguien le estaba contestando. Ese alguien escribía
 * desde WhatsApp, no desde el panel, y esas respuestas no existían para nosotros.
 *
 * `whatsapp-api-js` solo despacha `field === "messages"` y `"calls"`; los campos
 * de eco los descarta en silencio. El resultado era triple:
 *  · el panel mostraba conversaciones que parecían abandonadas;
 *  · el agente no veía lo que el humano ya había dicho, así que al retomar
 *    repetía preguntas y reenviaba cotizaciones;
 *  · la auditoría las contaba como `sin_respuesta_del_bot`.
 *
 * Aquí se interceptan esos campos ANTES de `handle_post`, se guardan como
 * mensajes salientes de `owner` y —si el mensaje no salió de este código— se
 * pasa la conversación a control humano para que el bot no hable encima.
 *
 * La lectura del payload y la firma viven en `domain/echoPayload.ts` (puras);
 * aquí queda solo lo que toca la base.
 */
import {
  contenidoDeEco,
  esPayloadDeEco,
  extraerEcos,
  firmaValida,
  tipoDeEco,
  type EchoMessage,
} from "../domain/echoPayload.js";
import { getChannelConfig } from "../services/channel.js";
import {
  appendMessage,
  getOrCreateConversation,
  setConversationAssignee,
} from "../services/conversations.js";
import { registrarEcoDescartado, registrarEcoGuardado } from "../services/echoHealth.js";
import { esEnvioPropio } from "./outboundRegistry.js";

export interface EchoOutcome {
  /** true = el payload era un eco y ya está resuelto; no lo toque handle_post. */
  handled: boolean;
  status: number;
  /** Cuántos ecos ajenos y nuevos entraron (los propios y los repetidos no cuentan). */
  guardados?: number;
}

/**
 * Procesa el payload completo. Devuelve `handled:false` si no era un eco, para
 * que el webhook siga su camino normal hacia `handle_post`.
 */
export async function handleEchoWebhook(
  rawBody: string,
  firma: string | undefined,
): Promise<EchoOutcome> {
  if (!esPayloadDeEco(rawBody)) return { handled: false, status: 200 };

  const canal = await getChannelConfig();
  // Los dos descartes se distinguen porque se arreglan en sitios distintos: sin
  // app secret es un campo vacío en Ajustes; con firma inválida el secret está
  // pero no es el de esta app. Antes los dos morían en el mismo console.error y
  // desde el panel se veían igual que "el asesor no escribió nada".
  if (!canal.appSecret) {
    await registrarEcoDescartado("sin_app_secret");
    console.error(
      "🚨 Llegó un eco de WhatsApp pero el canal no tiene app secret: no se puede validar la firma y se descarta.",
    );
    return { handled: true, status: 401 };
  }
  if (!firmaValida(rawBody, firma, canal.appSecret)) {
    await registrarEcoDescartado("firma_invalida");
    console.error("🚨 Eco de WhatsApp con firma inválida: descartado.");
    return { handled: true, status: 401 };
  }

  let guardados = 0;
  for (const eco of extraerEcos(rawBody)) {
    try {
      guardados += (await guardarEco(eco)) ? 1 : 0;
    } catch (error) {
      // Un eco que falla no puede tumbar el 200: Meta reintentaría el lote
      // entero y duplicaría el trabajo de los que sí entraron.
      console.error(`⚠️ No se pudo guardar el eco ${eco.id}:`, error);
    }
  }
  return { handled: true, status: 200, guardados };
}

/** Guarda un eco. Devuelve true solo si era ajeno Y nuevo (es decir, un handoff). */
async function guardarEco(eco: EchoMessage): Promise<boolean> {
  const propio = esEnvioPropio(eco.id);
  const conversation = await getOrCreateConversation(eco.to);
  const occurredAt = eco.timestamp ? new Date(Number(eco.timestamp) * 1000) : new Date();

  const esNuevo = await appendMessage(
    conversation.id,
    "assistant",
    contenidoDeEco(eco),
    eco.id,
    {
      type: tipoDeEco(eco),
      // `owner` y no `bot`: lo escribió una persona. El panel lo pinta con la
      // etiqueta "Vendedor" y la auditoría no lo cuenta como mérito del bot.
      authorKind: "owner",
      status: "sent",
      metadata: { origen: "echo", waType: eco.type ?? "text" },
      occurredAt,
    },
  );

  // Solo un mensaje ajeno y nuevo significa handoff. El eco de nuestro propio
  // envío no puede pausar al bot por su propia respuesta.
  if (esNuevo && !propio) {
    await registrarEcoGuardado();
    await setConversationAssignee(conversation.id, "human");
    console.log(
      `👤 Asesor respondió desde WhatsApp en la conversación ${conversation.id}: bot en pausa.`,
    );
  }
  return esNuevo && !propio;
}

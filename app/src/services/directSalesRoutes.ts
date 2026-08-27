import { business, config } from "../config.js";
import type { CustomerCommitment } from "../domain/customerCommitment.js";
import type { ExplicitStore } from "../domain/storeSelection.js";
import { sql } from "../db/client.js";
import { ensureCatalogReady, findByCode } from "./catalog.js";
import { faltanteDeCotizacion } from "./stockCorto.js";
import { recordatorioStockCorto } from "../domain/stockCorto.js";
import {
  appendMessage,
  logFunnelEvent,
  logQuoteArtifact,
  setStage,
  type Conversation,
} from "./conversations.js";
import { applicableBenefitTexts } from "./benefits.js";
import { composeBlocks } from "./quoteMessages.js";
import { buildStoreLinksBlockOnce } from "./storeLinks.js";
import { fraseDeAhorro } from "../domain/ahorro.js";
import { ahorroVigente } from "./ahorroVigente.js";
import { brandProfilesForRender } from "./brandProfiles.js";
import { getPiecesConfig } from "./settings.js";
import { renderQuoteImage, toRenderLine } from "../render/quoteImage.js";
import { sendImage } from "../wa/client.js";

interface StoredQuoteLine {
  code?: string;
  quantity?: number;
  brand?: string;
  design?: string;
  salePriceWithTax?: number;
  listPriceWithTax?: number;
}

export interface DirectSalesContext {
  conversation: Conversation;
  customerPhone: string;
  explicitStore?: ExplicitStore | null;
  commitment?: CustomerCommitment | null;
}

export function canUseDirectVisitRoute(input: {
  stage: Conversation["stage"];
  hasQuote: boolean;
  hasExplicitStore: boolean;
  hasCommitment: boolean;
  text: string;
}): boolean {
  const closingStage = input.stage === "cotizacion_enviada" || input.stage === "seguimiento_venta";
  if (!closingStage && !input.hasQuote) return false;
  if (!input.hasExplicitStore && !input.hasCommitment) return false;
  return !input.text.includes("?") && normalized(input.text).split(/\s+/).length <= 18;
}

const normalized = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Pedido conservador: no confunde "cotízame otra medida" con un reenvío. */
export function requestsQuoteResend(text: string): boolean {
  const value = normalized(text);
  const asksSend = /\b(?:reenvia|reenvie|reenvias|manda|mande|envia|envie|otra vez|de nuevo|nuevamente)\b|\botra\s+(?:foto|imagen)\b|\bno\s+(?:me\s+)?(?:llego|aparece)|\bno\s+(?:(?:la|lo)\s+)?veo\b/.test(value);
  const asksArtifact = /\b(?:foto|imagen|cotizacion|proforma|pdf)\b/.test(value);
  const changesOrder = /\b(?:otra medida|otra opcion|otras opciones|cambia|cambiar|diferente|compara|comparacion)\b/.test(value);
  return asksSend && asksArtifact && !changesOrder;
}

function dateLabel(value: Date): string {
  return value.toLocaleDateString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Re-renderiza la cotización existente; no crea número, quote ni precio nuevo. */
export async function resendLatestQuoteImage(
  conversationId: number,
  phone: string,
): Promise<string | null> {
  const [quote] = await sql<{
    id: number;
    quote_number: string;
    items: StoredQuoteLine[];
    subtotal: string | number;
    tax: string | number;
    total: string | number;
    created_at: Date;
  }[]>`
    select id, quote_number, items, subtotal, tax, total, created_at
    from quotes
    where conversation_id=${conversationId}
      and cycle=(select current_cycle from conversations where id=${conversationId})
    order by created_at desc limit 1
  `;
  const stored = quote?.items?.[0];
  if (!quote || !stored?.code) return null;

  await ensureCatalogReady();
  const product = findByCode(stored.code);
  if (!product) return null;
  const quantity = Math.max(1, Number(stored.quantity ?? 1));
  const line = await toRenderLine(product, quantity);
  // La pieza debe conservar el snapshot vendido aunque el catálogo cambie hoy.
  line.unitConIva = Number(stored.salePriceWithTax ?? line.unitConIva);
  line.pvpConIva = stored.listPriceWithTax == null ? line.pvpConIva : Number(stored.listPriceWithTax);
  const filename = `Cotizacion-${business.name.replace(/\s/g, "")}-${quote.quote_number}-reenvio.png`;
  const png = await renderQuoteImage({
    number: quote.quote_number,
    dateLabel: dateLabel(quote.created_at),
    ...(await getPiecesConfig()),
    brandProfiles: await brandProfilesForRender(),
    benefits: await applicableBenefitTexts({ brands: [product.brand], quantity }),
    lines: [line],
    subtotal: Number(quote.subtotal),
    iva: Number(quote.tax),
    total: Number(quote.total),
  });
  const providerId = await sendImage(
    conversationId,
    phone,
    png,
    "Aquí está de nuevo su cotización 🏁",
    filename,
  );
  await appendMessage(conversationId, "assistant", `Cotización ${quote.quote_number} reenviada`, providerId, {
    type: "image",
    authorKind: "bot",
    status: "sent",
    metadata: { piece: "quote", filename, quoteNumber: quote.quote_number, resend: true },
  });
  await logQuoteArtifact({
    conversationId,
    quoteId: quote.id,
    kind: "quote",
    products: quote.items,
    filename,
    providerId,
  });
  await logFunnelEvent(conversationId, "respuesta_directa", { route: "quote_resend" });

  /**
   * La pieza reenviada dice «4 unidades cotizadas». Si hoy hay 3, este camino
   * estaba volviendo a prometer las 4 sin una palabra — y es un camino que NO
   * pasa por el agente ni por su tool, así que el candado de `tools.ts` no lo
   * cubre. Tres puertas para la misma cotización: las tres tienen que decir lo
   * mismo (ver `domain/stockCorto.ts`).
   */
  const corto = faltanteDeCotizacion({
    quote_number: quote.quote_number,
    total: quote.total,
    items: quote.items as Array<{ code?: string; quantity?: number }>,
  });
  return corto
    ? `Se la envié nuevamente 👆\n---\n${recordatorioStockCorto(corto.stockHoy, corto.cantidad)}`
    : "Se la envié nuevamente 👆";
}

function visitDateText(value: Date | null): string | null {
  return value?.toLocaleDateString("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).replace(",", "") ?? null;
}

/**
 * Cómo se le devuelve la visita al cliente.
 *
 * Manda la fecha YA INTERPRETADA, no lo que él tecleó. Desde que el extractor
 * tolera faltas (26-ago), `customer_commitment` puede ser literalmente «X eso
 * el juebes», y esta ruta lo escupía de vuelta entre asteriscos como si fuera
 * la fecha: «Perfecto: *X eso el juebes en Depot Tire Quito Sur*». Repetirle su
 * propio typo formateado como dato es peor que no confirmar nada.
 *
 * Sin fecha devuelve null: el turno cae en la rama que confirma lo que sí se
 * sabe y pide el día que falta, en vez de dar por registrado lo que no está.
 */
function etiquetaDeVisita(visitDate: Date | null, franja: string | null): string | null {
  const dia = visitDateText(visitDate);
  if (!dia) return null;
  return franja?.trim() ? `${dia} ${franja.trim()}` : dia;
}

/**
 * Un tramo sin día («esta semana») sí se le repite al cliente; una frase entera
 * no. `customer_commitment` guarda lo que él escribió tal cual, y eso puede ser
 * un párrafo: devolvérselo entre asteriscos como si fuera el dato registrado es
 * lo que hacía esta ruta antes de que se le pusiera este filtro.
 */
function tramoBreve(crudo: string | null): string | null {
  const valor = crudo?.trim();
  if (!valor || valor.length > 30) return null;
  return /\b(?:semana|finde|fin de semana|manana|mañana|hoy)\b/i.test(
    valor.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
  ) ? valor : null;
}

export async function tryDirectSalesRoute(
  ctx: DirectSalesContext,
  text: string,
): Promise<string | null> {
  if (!config.openai.directSalesRoutesEnabled) return null;
  if (requestsQuoteResend(text)) {
    return resendLatestQuoteImage(ctx.conversation.id, ctx.customerPhone).catch((error) => {
      console.error("❌ Ruta directa de reenvío falló; continúa el agente:", error);
      return null;
    });
  }
  const [facts] = await sql<{
    nearest_store: string | null;
    visit_date: Date | null;
    visit_time_label: string | null;
    customer_commitment: string | null;
    has_quote: boolean;
  }[]>`
    select c.nearest_store, c.visit_date, c.visit_time_label, c.customer_commitment,
      exists(select 1 from quotes q where q.conversation_id=c.id and q.cycle=c.current_cycle) as has_quote
    from conversations c where c.id=${ctx.conversation.id}
  `;
  // El Kanban puede ir atrasado. Una cotización real es evidencia más fuerte
  // que la etapa para reconocer respuestas secas como "Martes 10 am".
  if (!canUseDirectVisitRoute({
    stage: ctx.conversation.stage,
    hasQuote: facts?.has_quote ?? false,
    hasExplicitStore: Boolean(ctx.explicitStore),
    // Con FECHA, no con cualquier compromiso. Desde que el extractor también
    // reconoce una hora suelta (26-ago), «X la tarde de 4 a 5 x yo soy de
    // probincia i ese día paso x ai» cuenta como compromiso — y esta ruta le
    // quitaba el turno al agente para contestarlo con una plantilla, perdiendo
    // el «si viene desde provincia, un asesor le atiende al llegar» que el bot
    // sí supo decir. Esta ruta es para la respuesta SECA con día («el jueves»);
    // lo demás lo contesta el vendedor.
    hasCommitment: Boolean(ctx.commitment?.visitDate),
    text,
  })) return null;
  const store = facts?.nearest_store ?? null;
  const visit = visitDateText(facts?.visit_date ?? null);
  const franja = facts?.visit_time_label?.trim() || null;
  const visitLabel = etiquetaDeVisita(facts?.visit_date ?? null, franja);
  const parcial = franja ?? tramoBreve(facts?.customer_commitment ?? null);
  // Con el local ya decidido va su link de Maps, una sola vez en toda la
  // conversación. Es el mensaje que un asesor tuvo que mandar a mano la noche
  // del 17-ago porque el bot había contestado la dirección escrita: el cliente
  // que acaba de elegir local es justo el que necesita cómo llegar.
  const mapa = store ? await buildStoreLinksBlockOnce(ctx.conversation.id, store, { soloDestacado: true }) : "";
  let reply: string;
  if (store && visitLabel) {
    reply = composeBlocks(`Perfecto: *${visitLabel} en ${store}*. Ya quedó registrado para el asesor.`, mapa);
  } else if (store && parcial) {
    // Sabemos el local y algo del cuándo, pero NO el día. Se confirma lo que hay
    // y se pide solo lo que falta: decir «ya quedó registrado» sin fecha es la
    // confirmación falsa que costó la visita del 24-ago.
    reply = composeBlocks(`Perfecto, le anoto *${parcial}* en *${store}*. ¿Qué día sería?`, mapa);
  } else if (store) {
    // Acaba de elegir local: es el turno de pedirle el día, y el que Joaquín
    // quiere «corto pero valioso» — con la cifra del descuento a la vista,
    // porque el número de plata es lo que hace que contesten. El descuento no
    // depende de que dé el día: ya está en el precio que la pieza imprime, así
    // que la frase dice lo que ES, no lo que ganaría. Ver `domain/ahorro.ts`.
    const ahorro = await ahorroVigente(ctx.conversation.id, ctx.conversation.current_cycle);
    reply = composeBlocks(
      // La confirmación y el mapa son el MISMO mensaje; la pregunta va sola en
      // el siguiente, que es lo que hace que la contesten.
      mapa ? `Perfecto, *${store}*.\n${mapa}` : `Perfecto, *${store}*.`,
      ahorro
        ? `¿Qué día cree que puede pasar? Le aviso al asesor para que le tenga lista su cotización con ${fraseDeAhorro(ahorro)}. 📅`
        : "¿Qué día cree que puede pasar? Le aviso al asesor para que le atienda apenas llegue. 📅",
    );
  } else {
    reply = `Perfecto${visit ? `, registré su visita para ${visit}` : ""}. ¿Le queda mejor *Cumbayá* o *Quito Sur*?`;
  }
  await setStage(ctx.conversation.id, "seguimiento_venta", {
    actor: "customer",
    reason: "Local o fecha capturados por ruta determinística",
  });
  await logFunnelEvent(ctx.conversation.id, "respuesta_directa", { route: "visit_capture" });
  return reply;
}

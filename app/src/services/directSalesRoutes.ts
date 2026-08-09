import { business, config } from "../config.js";
import type { CustomerCommitment } from "../domain/customerCommitment.js";
import type { ExplicitStore } from "../domain/storeSelection.js";
import { sql } from "../db/client.js";
import { ensureCatalogReady, findByCode } from "./catalog.js";
import {
  appendMessage,
  logFunnelEvent,
  logQuoteArtifact,
  setStage,
  type Conversation,
} from "./conversations.js";
import { applicableBenefitTexts } from "./benefits.js";
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
    `Aquí está de nuevo su cotización ${quote.quote_number} 🏁`,
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
  return `Aquí está de nuevo su cotización *${quote.quote_number}* por $${Number(quote.total).toFixed(2)}.`;
}

function visitDateText(value: Date | null): string | null {
  return value?.toLocaleDateString("es-EC", {
    timeZone: "America/Guayaquil",
    weekday: "long",
    day: "numeric",
    month: "long",
  }) ?? null;
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
  const closingStage = ctx.conversation.stage === "cotizacion_enviada" || ctx.conversation.stage === "seguimiento_venta";
  if (!closingStage || (!ctx.explicitStore && !ctx.commitment)) return null;
  // Una pregunta adicional merece el cerebro comercial; esta ruta solo maneja
  // respuestas secas como "sábado en Quito Sur".
  if (text.includes("?") || normalized(text).split(/\s+/).length > 18) return null;

  const [facts] = await sql<{
    nearest_store: string | null;
    visit_date: Date | null;
    customer_commitment: string | null;
  }[]>`select nearest_store, visit_date, customer_commitment from conversations where id=${ctx.conversation.id}`;
  const store = facts?.nearest_store ?? null;
  const visit = visitDateText(facts?.visit_date ?? null);
  let reply: string;
  if (store && (visit || facts?.customer_commitment)) {
    reply = `Perfecto, quedó registrado: *${store}*${visit ? `, ${visit}` : ""}. El asesor tendrá a mano su cotización cuando llegue.`;
  } else if (store) {
    reply = `Perfecto, *${store}*. ¿Qué día puede pasar?`;
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

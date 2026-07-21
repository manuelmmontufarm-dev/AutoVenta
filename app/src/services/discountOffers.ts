import { sql } from "../db/client.js";
import {
  buildDiscountCustomerMessage,
  calculateDiscount,
  detectManualDiscount,
  type DiscountKind,
} from "../domain/discounts.js";
import { emitLiveEvent } from "./liveEvents.js";

export interface ActiveDiscountOffer {
  id: number;
  quoteId: number | null;
  quoteNumber: string | null;
  kind: DiscountKind;
  valueCents: number;
  baseTotalCents: number;
  discountAmountCents: number;
  finalTotalCents: number;
  reason: string;
  condition: string;
  expiresAt: Date | null;
  status: string;
}

interface QuoteRow {
  id: number;
  items: unknown;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  original_subtotal: string | number | null;
  original_tax: string | number | null;
  original_total: string | number | null;
  quote_number: string | null;
  sale_number: string | null;
}

export async function getActiveDiscountOffer(conversationId: number): Promise<ActiveDiscountOffer | null> {
  const [row] = await sql<{
    id: number; quote_id: number | null; quote_number: string | null; kind: DiscountKind;
    value_cents: number; base_total_cents: number; discount_amount_cents: number;
    final_total_cents: number; reason: string; condition_text: string;
    expires_at: Date | null; status: string;
  }[]>`
    select o.id, o.quote_id, q.quote_number, o.kind, o.value_cents,
      o.base_total_cents, o.discount_amount_cents, o.final_total_cents,
      o.reason, o.condition_text, o.expires_at, o.status
    from discount_offers o
    left join quotes q on q.id = o.quote_id
    join conversations c on c.id = o.conversation_id and c.current_cycle = o.cycle
    where o.conversation_id = ${conversationId}
      and o.status in ('approved','offered','accepted')
      and (o.expires_at is null or o.expires_at > now())
    order by o.created_at desc limit 1
  `;
  return row ? {
    id: Number(row.id), quoteId: row.quote_id ? Number(row.quote_id) : null,
    quoteNumber: row.quote_number, kind: row.kind, valueCents: row.value_cents,
    baseTotalCents: row.base_total_cents, discountAmountCents: row.discount_amount_cents,
    finalTotalCents: row.final_total_cents, reason: row.reason,
    condition: row.condition_text, expiresAt: row.expires_at, status: row.status,
  } : null;
}

export async function createDiscountOffer(input: {
  conversationId: number;
  kind?: DiscountKind;
  valueCents: number;
  reason: string;
  condition: string;
  expiresAt?: Date | null;
  source?: "admin_form" | "manual_message";
  sourceMessageId?: number | null;
}): Promise<ActiveDiscountOffer> {
  const offer = await sql.begin(async (tx) => {
    const [conversation] = await tx<{ current_cycle: number; status: string }[]>`
      select current_cycle, status from conversations where id = ${input.conversationId} for update
    `;
    if (!conversation || conversation.status !== "open") throw new Error("La conversación no está activa");
    const [quote] = await tx<QuoteRow[]>`
      select id, items, subtotal, tax, total, original_subtotal, original_tax,
        original_total, quote_number, sale_number
      from quotes where conversation_id = ${input.conversationId}
        and cycle = ${conversation.current_cycle}
      order by created_at desc, id desc limit 1 for update
    `;
    if (!quote) throw new Error("Primero debe existir una cotización real");
    const baseTotalCents = Math.round(Number(quote.original_total ?? quote.total) * 100);
    const breakdown = calculateDiscount(baseTotalCents, input.kind ?? "total_amount", input.valueCents);
    const originalSubtotal = Number(quote.original_subtotal ?? quote.subtotal);
    const originalTax = Number(quote.original_tax ?? quote.tax);

    const [previous] = await tx<{ id: number }[]>`
      update discount_offers set status = 'superseded', updated_at = now()
      where conversation_id = ${input.conversationId} and cycle = ${conversation.current_cycle}
        and status in ('approved','offered','accepted') returning id
    `;
    const [created] = await tx<{ id: number }[]>`
      insert into discount_offers (
        conversation_id, cycle, quote_id, kind, value_cents, base_total_cents,
        discount_amount_cents, final_total_cents, reason, condition_text,
        expires_at, status, source, created_by, source_message_id, supersedes_offer_id
      ) values (
        ${input.conversationId}, ${conversation.current_cycle}, ${quote.id},
        ${input.kind ?? "total_amount"}, ${input.valueCents}, ${breakdown.baseTotalCents},
        ${breakdown.discountAmountCents}, ${breakdown.finalTotalCents},
        ${input.reason.trim()}, ${input.condition.trim()}, ${input.expiresAt ?? null},
        ${input.source === "manual_message" ? "offered" : "approved"},
        ${input.source ?? "admin_form"}, 'owner', ${input.sourceMessageId ?? null},
        ${previous?.id ?? null}
      ) returning id
    `;
    const finalTotal = breakdown.finalTotalCents / 100;
    const finalSubtotal = Math.round((finalTotal / 1.15) * 100) / 100;
    const finalTax = Math.round((finalTotal - finalSubtotal) * 100) / 100;
    const revisionNumber = `${quote.quote_number ?? `COT-${quote.id}`}-D${created.id}`;
    const [revision] = await tx<{ id: number }[]>`
      insert into quotes (
        conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number,
        original_subtotal, original_tax, original_total, discount_amount,
        discount_reason, discount_condition, discount_offer_id
      ) values (
        ${input.conversationId}, ${conversation.current_cycle}, ${sql.json(quote.items as never)},
        ${finalSubtotal}, ${finalTax}, ${finalTotal}, ${revisionNumber}, ${quote.sale_number},
        ${originalSubtotal}, ${originalTax}, ${baseTotalCents / 100},
        ${breakdown.discountAmountCents / 100}, ${input.reason.trim()},
        ${input.condition.trim()}, ${created.id}
      ) returning id
    `;
    await tx`update discount_offers set quote_id = ${revision.id} where id = ${created.id}`;
    await tx`
      update conversations set savings_amount = ${breakdown.discountAmountCents / 100},
        offer_expires_at = ${input.expiresAt ?? null},
        follow_up_reason = ${`Oferta autorizada: ${input.condition.trim()}`}, updated_at = now()
      where id = ${input.conversationId}
    `;
    await tx`
      insert into funnel_events (conversation_id, cycle, type, data)
      values (${input.conversationId}, ${conversation.current_cycle}, 'discount_offer_created',
        ${sql.json({ offerId: Number(created.id), amount: breakdown.discountAmountCents / 100, finalTotal, reason: input.reason, condition: input.condition } as never)})
    `;
    return Number(created.id);
  });
  emitLiveEvent("sync", input.conversationId);
  const active = await getActiveDiscountOffer(input.conversationId);
  if (!active || active.id !== offer) throw new Error("No se pudo recuperar la oferta creada");
  return active;
}

export function discountOfferMessage(offer: ActiveDiscountOffer): string {
  return buildDiscountCustomerMessage({
    quoteNumber: offer.quoteNumber,
    discountAmountCents: offer.discountAmountCents,
    finalTotalCents: offer.finalTotalCents,
    condition: offer.condition,
    expiresAt: offer.expiresAt,
  });
}

export async function markDiscountOfferSent(offerId: number, messageId?: number | null): Promise<void> {
  await sql`
    update discount_offers set status = 'offered', offered_at = coalesce(offered_at, now()),
      source_message_id = coalesce(source_message_id, ${messageId ?? null}), updated_at = now()
    where id = ${offerId}
  `;
}

export async function captureManualDiscount(
  conversationId: number,
  text: string,
  providerMessageId?: string,
): Promise<ActiveDiscountOffer | null> {
  const draft = detectManualDiscount(text);
  if (!draft) {
    if (/\b(?:descuento|rebaja|oferta|ahorro)\b/i.test(text)) {
      const [conversation] = await sql<{ current_cycle: number }[]>`select current_cycle from conversations where id=${conversationId}`;
      if (conversation) await sql`
        insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key)
        values (${conversationId}, ${conversation.current_cycle}, 'discount_needs_review', 'high',
          'Descuento manual requiere estructura', ${text.slice(0, 500)},
          'Confirmar monto, razón y condición desde la ficha para reflejarlo en la cotización.',
          ${`${conversationId}:${conversation.current_cycle}:discount_review:${providerMessageId ?? Date.now()}`})
        on conflict do nothing
      `;
    }
    return null;
  }
  const [message] = providerMessageId
    ? await sql<{ id: number }[]>`select id from messages where wa_message_id=${providerMessageId}`
    : [];
  try {
    return await createDiscountOffer({
      conversationId,
      kind: draft.kind,
      valueCents: draft.valueCents,
      reason: "Descuento ofrecido manualmente por asesor",
      condition: draft.condition ?? "continúa con la compra",
      source: "manual_message",
      sourceMessageId: message?.id ? Number(message.id) : null,
    });
  } catch (error) {
    const [conversation] = await sql<{ current_cycle: number }[]>`select current_cycle from conversations where id=${conversationId}`;
    if (conversation) await sql`
      insert into bot_alerts (conversation_id, cycle, type, priority, summary, exact_reason, suggested_action, dedupe_key)
      values (${conversationId}, ${conversation.current_cycle}, 'discount_needs_review', 'high',
        'No se pudo registrar el descuento escrito por el asesor',
        ${(error instanceof Error ? error.message : "Oferta ambigua").slice(0, 500)},
        'Abrir la ficha y confirmar una oferta válida.',
        ${`${conversationId}:${conversation.current_cycle}:discount_invalid:${providerMessageId ?? Date.now()}`})
      on conflict do nothing
    `;
    emitLiveEvent("alert", conversationId);
    return null;
  }
}

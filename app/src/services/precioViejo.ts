/**
 * El seguimiento no repite el precio de una cotización que el catálogo de hoy
 * ya cambió. Ver `domain/precioViejo.ts` (caso s12, simulador 20-nov-2026).
 *
 * Lee la última cotización del ciclo y la compara con el catálogo en memoria
 * (el Excel de Fénix o Contífico de HOY) y con el precio vivo del Interbot
 * donde lo hay. Nunca rompe un envío: ante un error, el texto sale como vino.
 */
import { sql } from "../db/client.js";
import { findByCode } from "./catalog.js";
import { getInterbotPrice } from "./interbotPrices.js";
import { createBotAlert } from "./followUps.js";
import { montosViejosDeLaCotizacion, sinMontosViejos, type CotizacionFirmada, type PreciosDeHoy } from "../domain/precioViejo.js";

export function preciosDeHoy(codigo: string): PreciosDeHoy | null {
  const producto = findByCode(codigo);
  if (!producto) return null;
  const vivo = getInterbotPrice(codigo);
  return [
    producto.minimumPriceWithTax,
    producto.customerPriceWithTax,
    vivo?.precioPromoConIva,
    vivo?.pvpMinConIva,
    vivo?.pvpFullConIva,
  ];
}

export async function sinPrecioViejoDeLaCotizacion(
  conversationId: number,
  cycle: number,
  texto: string,
): Promise<string> {
  if (!/\$\s?\d/.test(texto)) return texto;
  try {
    const [cotizacion] = await sql<(CotizacionFirmada & { quote_number: string | null })[]>`
      select quote_number, total, subtotal, items from quotes
      where conversation_id = ${conversationId} and cycle = ${cycle}
      order by created_at desc limit 1
    `;
    const viejos = montosViejosDeLaCotizacion(cotizacion ?? null, preciosDeHoy);
    const { texto: limpio, quitados } = sinMontosViejos(texto, viejos);
    if (!quitados.length) return texto;
    console.warn(`🏷️ Seguimiento de la conv ${conversationId}: se quitó el precio viejo de la cotización (${quitados.join(", ")}).`);
    await createBotAlert({
      conversationId,
      cycle,
      type: "precio_de_cotizacion_cambio",
      priority: "medium",
      summary: "El precio de la cotización cambió en el catálogo; el seguimiento salió sin el monto viejo",
      exactReason:
        `La cotización ${cotizacion?.quote_number ?? "vigente"} se firmó con ${quitados.join(", ")} y el catálogo de hoy trae otro precio. `
        + `Enviado: «${limpio.slice(0, 200)}».`,
      suggestedAction: "Si el cliente vuelve, confírmale el precio de hoy o rehaz la cotización.",
      dedupeKey: `${conversationId}:${cycle}:precio_de_cotizacion_cambio`,
    }).catch(() => undefined);
    return limpio || texto;
  } catch (error) {
    console.warn("⚠️ No se pudo revisar el precio de la cotización antes de enviar:", error instanceof Error ? error.message : error);
    return texto;
  }
}

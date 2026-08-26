/**
 * ¿La cotización vigente promete más llantas de las que hay hoy?
 *
 * Una sola respuesta para los tres que la necesitan —el candado de salida, el
 * reenvío de la pieza y el Ángel Guardián—, porque la pregunta es la misma y
 * tres versiones de la misma consulta se contestan distinto el día que alguien
 * toca una. Ver `domain/stockCorto.ts` para el porqué de todo esto.
 *
 * Se compara contra el stock de HOY, leído del catálogo en memoria: la
 * cotización se firmó con el número de ayer y en bodega pueden haber repuesto.
 */
import { sql } from "../db/client.js";
import { findByCode } from "./catalog.js";
import { recordatorioQueFalta } from "../domain/stockCorto.js";
import { createBotAlert } from "./followUps.js";

export interface FaltanteVigente {
  numero: string | null;
  codigo: string;
  cantidad: number;
  stockHoy: number;
  total: number;
  etiqueta: string;
}

interface FilaCotizacion {
  quote_number: string | null;
  total: string | number;
  items: Array<{
    code?: string; quantity?: number; brand?: string; design?: string; sizeLabel?: string;
  }> | null;
}

/**
 * Devuelve el faltante de la última cotización del ciclo, o `null` si no hay
 * cotización, si alcanza, o si está en cero (el agotado tiene su propio camino:
 * decirle «hoy hay 0» a alguien que ya tiene un número firmado es una
 * conversación del asesor, no un recordatorio).
 */
export async function faltanteDeLaCotizacionVigente(
  conversationId: number,
  cycle: number,
): Promise<FaltanteVigente | null> {
  const [cotizacion] = await sql<FilaCotizacion[]>`
    select quote_number, total, items from quotes
    where conversation_id = ${conversationId} and cycle = ${cycle}
    order by created_at desc limit 1
  `;
  return faltanteDeCotizacion(cotizacion ?? null);
}

/** El mismo cálculo sobre una fila ya leída, para no consultar dos veces. */
export function faltanteDeCotizacion(cotizacion: FilaCotizacion | null): FaltanteVigente | null {
  const línea = (cotizacion?.items ?? [])[0];
  const codigo = línea?.code;
  const cantidad = línea?.quantity;
  if (!cotizacion || !codigo || !cantidad) return null;

  const producto = findByCode(codigo);
  if (!producto) return null;
  if (cantidad <= producto.stock) return null;
  if (producto.stock <= 0) return null;

  return {
    numero: cotizacion.quote_number ?? null,
    codigo,
    cantidad,
    stockHoy: producto.stock,
    total: Number(cotizacion.total),
    etiqueta: [línea.brand, línea.design, línea.sizeLabel].filter(Boolean).join(" "),
  };
}


/**
 * LA ÚLTIMA PALABRA SOBRE EL STOCK, DESPUÉS DE TODOS LOS DEMÁS.
 *
 * Esto no puede vivir solo dentro de `applyOutboundGuard`, y el motivo es el
 * orden en que se despacha un turno (`index.ts`):
 *
 *     runAgent → applyOutboundGuard → revisarConGuardian → enviar
 *
 * El guardián de IA corre DESPUÉS y reescribe el texto. Y es exactamente quien
 * borró el aviso en producción: el 26-ago corrigió un borrador por otra cosa y
 * su versión —la que leyó el cliente— decía «la cotización vigente … 4 × KENDA
 * KR203 … $262.60» sin una palabra de que había 3. Un candado que corre antes
 * del que reescribe no es un candado.
 *
 * Así que esta función se llama al final, cuando ya nadie va a tocar el texto:
 * después del guardián en el turno normal, y después del guardián en el
 * seguimiento automático. Es idempotente —si el aviso ya está, no hace nada—,
 * así que llamarla dos veces no duplica nada.
 */
export async function asegurarAvisoDeStock(
  conversationId: number,
  cycle: number,
  texto: string,
): Promise<{ texto: string; pegado: boolean }> {
  try {
    const corto = await faltanteDeLaCotizacionVigente(conversationId, cycle);
    if (!corto) return { texto, pegado: false };
    const recordatorio = recordatorioQueFalta(texto, corto);
    if (!recordatorio) return { texto, pegado: false };

    console.warn(
      `📦 Aviso de stock corto pegado antes de enviar (conv ${conversationId}): ` +
      `${corto.cantidad} cotizadas, ${corto.stockHoy} en catálogo`,
    );
    await createBotAlert({
      conversationId,
      cycle,
      type: "guard_stock_recordado",
      priority: "medium",
      summary: "El bot repitió la cotización sin decir que no hay tantas (se le pegó el aviso)",
      exactReason:
        `El mensaje afirmaba la cotización ${corto.numero ?? "vigente"} (${corto.cantidad} unidades) y no ` +
        `mencionaba que hoy hay ${corto.stockHoy} de ${corto.etiqueta || corto.codigo}. ` +
        "Al cliente le llegó con el recordatorio pegado, pero quien redactó lo había omitido.",
      suggestedAction:
        "Confirmar en bodega cuántas hay de verdad. Si se repite seguido, el cliente está recibiendo el aviso a medias.",
      dedupeKey: `${conversationId}:${cycle}:guard:stock_recordado`,
    }).catch(() => {});
    return { texto: `${texto}\n\n${recordatorio}`, pegado: true };
  } catch (error) {
    // Nunca romper el envío por esto: un mensaje sin recordatorio es un
    // problema; un cliente sin respuesta es peor.
    console.warn("⚠️ No se pudo revisar el stock antes de enviar:", error instanceof Error ? error.message : error);
    return { texto, pegado: false };
  }
}

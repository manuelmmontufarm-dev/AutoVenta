/**
 * Ruta directa: la recomendación con la pieza ya enviada.
 *
 * Cuando el cliente pide que le recomienden o cuenta para qué la quiere y la
 * pieza de opciones ya salió, la respuesta ES la pieza otra vez con la
 * recomendada entregada — la misma herramienta del agente, con los mismos
 * códigos — y, como en el turno normal, la cotización del juego de 4 detrás
 * (Manuel, 31-ago: la recomendación no pide permiso para cotizar). El agente
 * no entra: tres corridas seguidas del simulador (1-sep) mostraron que con la
 * regla en el manual igual contestaba en texto. Ver domain/recomendacionConPieza.ts.
 *
 * Mismo patrón que `recotizar.ts`: si la herramienta se niega, contesta el
 * agente, que sabe explicar el motivo.
 */
import { sql } from "../db/client.js";
import { buildTools } from "../agent/tools.js";
import { config } from "../config.js";
import { composeBlocks } from "./quoteMessages.js";
import { logFunnelEvent } from "./conversations.js";
import {
  pideLaRecomendacionConPiezaEnviada,
  recomendadaDeLaPieza,
  type PiezaDeOpciones,
} from "../domain/recomendacionConPieza.js";
import type { Conversation } from "./conversations.js";
import { findByCode } from "./catalog.js";
import { tipoDeProducto } from "../domain/tireTypes.js";
import { elegirRecomendadaPorUso, usoDeclarado } from "../domain/recomendacionPorUso.js";

export interface RecomendarContext {
  conversation: Conversation;
  customerPhone: string;
  customerName?: string;
}

export async function tryRecomendarConLaPieza(
  ctx: RecomendarContext,
  text: string,
): Promise<string | null> {
  if (!config.openai.directSalesRoutesEnabled) return null;

  const [pieza] = await sql<{ metadata: PiezaDeOpciones | null }[]>`
    select metadata from messages
    where conversation_id=${ctx.conversation.id}
      and cycle=${ctx.conversation.current_cycle}
      and type='image' and metadata->>'piece'='options'
      and coalesce(status, 'sent') <> 'failed'
    order by created_at desc limit 1
  `;
  const [cotizacion] = await sql<{ id: number }[]>`
    select id from quotes
    where conversation_id=${ctx.conversation.id} and cycle=${ctx.conversation.current_cycle}
    limit 1
  `;
  if (!pideLaRecomendacionConPiezaEnviada(text, pieza?.metadata ?? null, Boolean(cotizacion))) return null;
  const guardada = recomendadaDeLaPieza(pieza!.metadata!);
  // Si contó PARA QUÉ la quiere, la recomendada se reelige con ese uso entre
  // las opciones que ya tiene en pantalla (Manuel, 1-sep: la pieza guardaba
  // la elegida ANTES de saber el uso). Ver domain/recomendacionPorUso.ts.
  const uso = usoDeclarado(text);
  const porUso = uso
    ? elegirRecomendadaPorUso(
        uso,
        pieza!.metadata!.codes.map((codigo) => {
          const item = findByCode(codigo);
          return {
            codigo,
            tipo: item ? tipoDeProducto(item.code, item.design) : null,
            precioConIva: item?.minimumPriceWithTax ?? null,
          };
        }),
        guardada.recomendado,
      )
    : null;
  const { recomendado, motivo } = porUso ? { recomendado: porUso.codigo, motivo: porUso.motivo } : guardada;
  if (porUso && porUso.codigo !== guardada.recomendado) {
    console.log(`🎯 Recomendada reelegida por uso «${uso}» en la conv ${ctx.conversation.id}: ${guardada.recomendado} → ${porUso.codigo}`);
  }

  const agentCtx = {
    conversation: ctx.conversation,
    customerPhone: ctx.customerPhone,
    customerName: ctx.customerName,
    currentUserText: text,
  };
  const tools = buildTools(agentCtx);
  const opciones = tools.find((t) => t.function.name === "preparar_opciones");
  const cotizar = tools.find((t) => t.function.name === "generar_cotizacion");
  if (!opciones || !cotizar) return null;

  let salida: {
    error?: string;
    mensaje_para_enviar?: string;
    recomendacion_entregada?: boolean;
    /** La recomendada es una equivalente: el texto pregunta «¿le cotizo…?» y la cotización espera su sí. */
    consentimiento_pendiente?: boolean;
  };
  try {
    salida = JSON.parse(await opciones.execute({
      codes: pieza!.metadata!.codes,
      recomendado,
      motivo,
      nombre_cliente: ctx.customerName ?? "Cliente",
      cantidad: null,
    }));
  } catch (error) {
    console.error("❌ Recomendar con la pieza falló; sigue el agente:", error);
    return null;
  }
  if (salida.error || !salida.mensaje_para_enviar) return null;

  console.log(`🎯 Recomendación con la pieza en la conv ${ctx.conversation.id}: ${recomendado}`);
  await logFunnelEvent(ctx.conversation.id, "respuesta_directa", { route: "recomendacion_con_pieza" })
    .catch(() => undefined);

  // La cotización del juego de 4, como en el turno normal. Si se niega (stock,
  // candado), el cliente igual se queda con la pieza y la recomendación.
  // Si la recomendada es una EQUIVALENTE, el texto ya cerró con «¿Le cotizo la
  // X en MEDIDA?» y la cotización espera el sí del cliente (conv 13635).
  let textoCotizacion: string | null = null;
  if (salida.recomendacion_entregada && !salida.consentimiento_pendiente) {
    try {
      const cot = JSON.parse(await cotizar.execute({
        items: [{ code: recomendado, cantidad: 4 }],
        nombre_cliente: null,
      })) as { enviada?: boolean; error?: string; mensaje_para_enviar?: string };
      if (cot.enviada && !cot.error && cot.mensaje_para_enviar) textoCotizacion = cot.mensaje_para_enviar;
    } catch (error) {
      console.error("❌ La cotización tras la recomendación falló:", error);
    }
  }
  return composeBlocks(salida.mensaje_para_enviar, textoCotizacion);
}

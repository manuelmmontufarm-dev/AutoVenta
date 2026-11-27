/**
 * LA ÚNICA PUERTA A UN MODELO DE CHAT.
 *
 * Quien necesite una respuesta de chat llama acá con una petición de Chat
 * Completions y recibe una respuesta de Chat Completions. Si el modelo empieza
 * con `claude-` la atiende Anthropic (`chatClaude.ts` traduce de ida y de
 * vuelta); si no, OpenAI tal cual, con los mismos parámetros de siempre.
 *
 * Quedan fuera, y siguen en OpenAI: la transcripción de audios (Anthropic no
 * transcribe) y la investigación de fitment (usa la búsqueda web de OpenAI).
 *
 * SI CLAUDE FALLA, CONTESTA OPENAI (24-nov-2026). Una cuenta nueva de Anthropic
 * tiene límites bajos y créditos prepagados: un 429, un «credit balance is too
 * low», una clave vencida o una caída no pueden dejar al cliente sin respuesta
 * ni al borrador sin revisar. La petición ya viene en el dialecto de OpenAI,
 * así que se repite tal cual en `config.anthropic.respaldoOpenAI`. Quién
 * contestó de verdad se lee con `modeloQueAtendio` (para cobrar bien).
 */
import type OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { config, type EsfuerzoClaude } from "../config.js";
import { chatReasoningEffort } from "./aiRequestPolicy.js";
import { completarConClaude, type CacheDeClaude, type PeticionChat } from "./chatClaude.js";
import { esModeloClaude } from "./claudeCliente.js";

/** Respuestas que NO vinieron del modelo pedido, y de cuál vinieron. */
const ATENDIO_EL_RESPALDO = new WeakMap<object, string>();

/** La misma petición, vestida para un modelo de OpenAI. */
export function peticionDeRespaldo(peticion: PeticionChat, model: string): PeticionChat {
  const conHerramientas = (peticion.tools?.length ?? 0) > 0;
  const esfuerzo = chatReasoningEffort(model, conHerramientas);
  return {
    ...peticion,
    model,
    ...(esfuerzo ? { reasoning_effort: esfuerzo, verbosity: "low" as const } : {}),
  };
}

export async function completarChat(
  openai: OpenAI,
  peticion: PeticionChat,
  opciones: { esfuerzo?: EsfuerzoClaude; cache?: CacheDeClaude } = {},
): Promise<ChatCompletion> {
  if (!esModeloClaude(peticion.model)) return openai.chat.completions.create(peticion);
  try {
    return await completarConClaude(peticion, { esfuerzo: opciones.esfuerzo ?? "low", cache: opciones.cache });
  } catch (error) {
    const respaldo = config.anthropic.respaldoOpenAI;
    if (!respaldo) throw error;
    console.warn(
      `⚠️ ${peticion.model} falló (${error instanceof Error ? error.message : String(error)}); contesta ${respaldo}.`,
    );
    const respuesta = await openai.chat.completions.create(peticionDeRespaldo(peticion, respaldo));
    ATENDIO_EL_RESPALDO.set(respuesta, respaldo);
    return respuesta;
  }
}

/** El modelo que de verdad contestó: el pedido, salvo que haya entrado el respaldo. */
export function modeloQueAtendio(respuesta: ChatCompletion, pedido: string): string {
  return ATENDIO_EL_RESPALDO.get(respuesta) ?? pedido;
}

/**
 * Tokens que esta llamada ESCRIBIÓ al caché. Solo Claude lo cobra aparte (más
 * caro que la entrada normal); con OpenAI es siempre 0.
 */
export function tokensEscritosEnCache(respuesta: ChatCompletion): number {
  return (respuesta.usage as { cache_write_tokens?: number } | undefined)?.cache_write_tokens ?? 0;
}

/**
 * De lo escrito al caché, la parte con TTL de 1 hora (se cobra 2× la entrada en
 * vez de 1,25×). Va DENTRO de `tokensEscritosEnCache`. Solo el vendedor en Claude.
 */
export function tokensEscritosEnCache1h(respuesta: ChatCompletion): number {
  return (respuesta.usage as { cache_write_1h_tokens?: number } | undefined)?.cache_write_1h_tokens ?? 0;
}

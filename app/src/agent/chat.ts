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
 */
import type OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import type { EsfuerzoClaude } from "../config.js";
import { completarConClaude, type PeticionChat } from "./chatClaude.js";
import { esModeloClaude } from "./claudeCliente.js";

export async function completarChat(
  openai: OpenAI,
  peticion: PeticionChat,
  opciones: { esfuerzo?: EsfuerzoClaude } = {},
): Promise<ChatCompletion> {
  if (esModeloClaude(peticion.model)) {
    return completarConClaude(peticion, { esfuerzo: opciones.esfuerzo ?? "low" });
  }
  return openai.chat.completions.create(peticion);
}

/**
 * Tokens que esta llamada ESCRIBIÓ al caché. Solo Claude lo cobra aparte (más
 * caro que la entrada normal); con OpenAI es siempre 0.
 */
export function tokensEscritosEnCache(respuesta: ChatCompletion): number {
  return (respuesta.usage as { cache_write_tokens?: number } | undefined)?.cache_write_tokens ?? 0;
}

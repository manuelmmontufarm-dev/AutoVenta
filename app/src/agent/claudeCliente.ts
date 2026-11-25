import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

/**
 * EL CLIENTE DE CLAUDE, CON EL MISMO TOPE DE ESPERA QUE EL DE OPENAI.
 *
 * Mismas dos constantes que `openaiCliente.ts` y por la misma razón: el SDK
 * espera por defecto hasta 10 minutos y reintenta dos veces, y en un chat de
 * WhatsApp eso es un cliente mirando «escribiendo…» sin fin. 45 s por llamada
 * y UN reintento; lo que falle después cae en el rescate del agente.
 */
export const CLAUDE_TIMEOUT_MS = 45_000;
export const CLAUDE_MAX_RETRIES = 1;

/** El proveedor lo decide el nombre del modelo: no hay otra variable. */
export function esModeloClaude(model: string | null | undefined): boolean {
  return typeof model === "string" && model.startsWith("claude-");
}

let cliente: Anthropic | null = null;

/** Lanza si no hay clave: el arranque ya avisó y apagó lo que dependía de ella. */
export function clienteClaude(): Anthropic {
  if (!config.anthropic.apiKey) {
    throw new Error("invalid_request_error: falta ANTHROPIC_API_KEY y se pidió un modelo claude-");
  }
  cliente ??= new Anthropic({
    apiKey: config.anthropic.apiKey,
    timeout: CLAUDE_TIMEOUT_MS,
    maxRetries: CLAUDE_MAX_RETRIES,
  });
  return cliente;
}

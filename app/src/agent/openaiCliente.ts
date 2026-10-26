import OpenAI from "openai";
import { config } from "../config.js";

/**
 * UN SOLO CLIENTE DE OPENAI, CON TOPE DE ESPERA CORTO.
 *
 * Manuel, 26-oct 16:17 (conv 3): escribió «qué promociones tiene activas» y
 * la respuesta salió a las 16:19:10, porque la primera llamada al modelo se
 * quedó colgada hasta que el SDK la dio por vencida (16:18:51) y recién ahí
 * entró el reintento, que contestó en 19 segundos. El SDK espera por defecto
 * hasta 10 minutos y reintenta dos veces: para un chat de WhatsApp eso es
 * un cliente mirando «escribiendo…» sin fin.
 *
 * Acá: 45 s por llamada y UN reintento del SDK. Lo que falle después cae en
 * el rescate del propio agente (`runAgent` → modelo de escalación sin
 * herramientas), que ya existía para 429/500. Son constantes y no variables
 * de entorno a propósito: el simulador copia el entorno de producción y una
 * variable nueva lo deja atrás sin avisar (test/simuladorFidelidad).
 */
export const OPENAI_TIMEOUT_MS = 45_000;
export const OPENAI_MAX_RETRIES = 1;

export function nuevoClienteOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: config.openai.apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES,
  });
}

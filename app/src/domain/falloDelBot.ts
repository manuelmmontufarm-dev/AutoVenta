/**
 * EL BOT NO RESPONDIÓ: QUÉ PASÓ, EN PALABRAS SIMPLES, Y CUÁNDO SE AVISA.
 *
 * 24-nov-2026, 16:35–17:58. Se acabó el crédito de OpenAI y 13 chats (12 de
 * Depot, 1 de Competimotor) recibieron «tengo un problema técnico». El bot sí
 * dejó una alerta por chat en el panel, pero a nadie le sonó el teléfono:
 * Manuel se enteró más de una hora después. Lo mismo había pasado el 11-sep.
 *
 * Acá vive lo que no toca la base ni la red, para poder probarlo con un reloj
 * fijo:
 *
 *  · `causaDelFallo`: del error crudo a una causa con nombre y con qué hacer.
 *  · `decidirAviso`: un aviso al abrirse el incidente, un recordatorio
 *    espaciado mientras siga fallando y nada más. Con el bot caído y 30
 *    mensajes entrando, a soporte le llegan dos avisos, no treinta.
 *  · `puedeCerrarse`: el «volvió a responder» no sale con el primer acierto si
 *    los fallos siguen frescos (un límite de velocidad intermitente abriría y
 *    cerraría el incidente cada minuto).
 *  · los textos del aviso. Son fijos a propósito: el aviso de que OpenAI no
 *    responde no puede depender de OpenAI para redactarse.
 */

export const CAUSAS_DE_FALLO = [
  "sin_credito",
  "clave_invalida",
  "limite_de_uso",
  "proveedor_sin_respuesta",
  "proveedor_caido",
  "modelo_inexistente",
  "envio_rechazado",
  "turno_colgado",
  "error_interno",
] as const;

export type CausaDeFallo = (typeof CAUSAS_DE_FALLO)[number];

/** Las causas que se arreglan cuando el modelo vuelve a contestar. */
export const CAUSAS_DE_IA: readonly CausaDeFallo[] = [
  "sin_credito", "clave_invalida", "limite_de_uso", "proveedor_sin_respuesta", "proveedor_caido",
  "modelo_inexistente",
];

/** Qué pasó, para alguien que no programa. Una frase, sin jerga. */
export const CAUSA_EN_SIMPLE: Record<CausaDeFallo, string> = {
  sin_credito: "Se acabó el crédito de OpenAI",
  clave_invalida: "OpenAI rechazó la clave del bot",
  limite_de_uso: "OpenAI está frenando al bot por exceso de uso",
  proveedor_sin_respuesta: "OpenAI no contestó a tiempo",
  proveedor_caido: "OpenAI está caído",
  modelo_inexistente: "OpenAI no reconoce el modelo configurado",
  envio_rechazado: "WhatsApp rechazó el mensaje del bot",
  turno_colgado: "El bot se quedó colgado sin terminar la respuesta",
  error_interno: "El bot tuvo un error interno",
};

/** Qué tiene que hacer soporte. */
export const QUE_HACER: Record<CausaDeFallo, string> = {
  sin_credito: "Recarga en platform.openai.com → Billing.",
  clave_invalida: "Revisa OPENAI_API_KEY del servicio en Railway.",
  limite_de_uso: "Si no se pasa solo en unos minutos, revisa los límites de la cuenta de OpenAI.",
  proveedor_sin_respuesta: "Si se repite, mira status.openai.com.",
  proveedor_caido: "Mira status.openai.com; mientras tanto se contesta a mano.",
  modelo_inexistente: "Revisa el nombre del modelo en las variables del servicio en Railway.",
  envio_rechazado: "Revisa el token de WhatsApp en Ajustes → Canal.",
  turno_colgado: "Revisa los logs del servicio en Railway.",
  error_interno: "Revisa el chat y los logs del servicio en Railway.",
};

// ── De qué proveedor ─────────────────────────────────────────────────────────

/**
 * Desde el 24-nov-2026 el vendedor y el Guardián de Depot corren en Claude
 * (Anthropic) y el resto en OpenAI. Las dos cuentas se recargan en páginas
 * distintas: decirle a soporte «recarga OpenAI» cuando lo que se acabó es el
 * crédito de Anthropic es mandarlo al lugar equivocado.
 */
export type ProveedorDeIA = "openai" | "anthropic";

/** El texto que delata a Anthropic en un error crudo (formas reales, 27-nov-2026). */
const DE_ANTHROPIC = /\[anthropic\]|anthropic|claude-|credit balance is too low|invalid x-api-key|authentication_error|overloaded_error|"type":"api_error"/i;

/**
 * `agent/chat.ts` marca con `proveedor: "anthropic"` lo que sale de Claude; lo
 * demás se reconoce por el texto (un timeout no dice de quién es: sin marca, OpenAI).
 */
export function proveedorDelError(error: unknown): ProveedorDeIA {
  if (error && typeof error === "object" && (error as { proveedor?: unknown }).proveedor === "anthropic") return "anthropic";
  return DE_ANTHROPIC.test(textoDelError(error)) ? "anthropic" : "openai";
}

const QUE_HACER_ANTHROPIC: Partial<Record<CausaDeFallo, string>> = {
  sin_credito: "Recarga en console.anthropic.com → Billing (la misma clave la usan Depot, Competimotor y el simulador) y anota el saldo nuevo en Ajustes → Bot.",
  clave_invalida: "Revisa ANTHROPIC_API_KEY del servicio en Railway.",
  limite_de_uso: "Si no se pasa solo en unos minutos, revisa los límites de la cuenta en console.anthropic.com.",
  proveedor_sin_respuesta: "Si se repite, mira status.claude.com.",
  proveedor_caido: "Mira status.claude.com.",
  modelo_inexistente: "Revisa el nombre del modelo claude-… en las variables del servicio en Railway.",
};

/** La causa en simple, nombrando al proveedor que de verdad falló. */
export function causaEnSimple(causa: CausaDeFallo, proveedor: ProveedorDeIA = "openai"): string {
  const base = CAUSA_EN_SIMPLE[causa];
  if (proveedor !== "anthropic" || !CAUSAS_DE_IA.includes(causa)) return base;
  return base.replace("OpenAI", "Anthropic (Claude)");
}

export function queHacer(causa: CausaDeFallo, proveedor: ProveedorDeIA = "openai"): string {
  return (proveedor === "anthropic" ? QUE_HACER_ANTHROPIC[causa] : undefined) ?? QUE_HACER[causa];
}

const textoDelError = (error: unknown): string => {
  if (error === null || error === undefined) return "";
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  const e = error as { message?: unknown; code?: unknown; type?: unknown };
  return [e.code, e.type, e.message].filter((x) => typeof x === "string").join(" ");
};

// «credit balance is too low» es como Anthropic dice que se acabó el crédito:
// viene con 400 `invalid_request_error`, no con 429 como OpenAI.
export const SIN_CREDITO = /insufficient_quota|no credits remaining|exceeded your current quota|billing_hard_limit|billing_not_active|add credits|credit balance is too low|purchase credits/i;
const CLAVE = /invalid_api_key|incorrect api key|invalid api key|invalid x-api-key|authentication_error|api key (?:was )?(?:revoked|disabled|not found)|account_deactivated/i;
const MODELO = /model_not_found|not_found_error|does not exist|model:/i;
const SIN_RESPUESTA = /\b(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\b|timed? ?out|connection error|socket hang up|fetch failed/i;
const LIMITE = /rate.?limit|too many requests/i;
const CAIDO = /service unavailable|bad gateway|internal server error|overloaded/i;

/**
 * De qué clase fue el fallo. Primero el texto del crédito y de la clave: un 429
 * es «límite de uso» o «sin crédito» según lo que diga, y la diferencia decide
 * si Manuel tiene que recargar o esperar. Después el código de estado.
 */
export function causaDelFallo(error: unknown): CausaDeFallo {
  const texto = textoDelError(error);
  const status = (error as { status?: unknown } | null)?.status;
  const codigo = typeof status === "number" ? status : Number(texto.match(/^\s*(?:\w+:\s*)?(\d{3})\b/)?.[1] ?? NaN);
  if (SIN_CREDITO.test(texto)) return "sin_credito";
  if (CLAVE.test(texto) || codigo === 401 || codigo === 403) return "clave_invalida";
  if (codigo === 404 && MODELO.test(texto)) return "modelo_inexistente";
  if (codigo === 429 || LIMITE.test(texto)) return "limite_de_uso";
  if (codigo === 408 || SIN_RESPUESTA.test(texto)) return "proveedor_sin_respuesta";
  if ([500, 502, 503, 504, 529].includes(codigo) || CAIDO.test(texto)) return "proveedor_caido";
  return "error_interno";
}

// ── Cuándo se avisa ──────────────────────────────────────────────────────────

/** El primer recordatorio, media hora después del aviso de apertura. */
export const PRIMER_RECORDATORIO_MS = 30 * 60 * 1000;
/** Los siguientes, cada dos horas: un incidente largo no puede sonar toda la noche. */
export const RECORDATORIO_SIGUIENTE_MS = 2 * 60 * 60 * 1000;
/** Sin fallos durante este rato, un acierto cierra el incidente. */
export const CALMA_PARA_CERRAR_MS = 3 * 60 * 1000;

export type DecisionDeAviso = "abrir" | "recordar" | "nada";

/**
 * Qué se hace con un fallo recién registrado. `nuevo` = este fallo abrió el
 * incidente. Un fallo sobre un incidente ya abierto solo suena si pasó el
 * intervalo desde el último aviso.
 */
export function decidirAviso(
  incidente: { nuevo: boolean; ultimoAvisoAt: Date | null; recordatorios: number },
  ahora: Date,
): DecisionDeAviso {
  if (incidente.nuevo) return "abrir";
  if (!incidente.ultimoAvisoAt) return "abrir";
  const espera = incidente.recordatorios === 0 ? PRIMER_RECORDATORIO_MS : RECORDATORIO_SIGUIENTE_MS;
  return ahora.getTime() - incidente.ultimoAvisoAt.getTime() >= espera ? "recordar" : "nada";
}

/** ¿Este acierto alcanza para dar el incidente por cerrado? */
export function puedeCerrarse(ultimoFalloAt: Date, ahora: Date): boolean {
  return ahora.getTime() - ultimoFalloAt.getTime() >= CALMA_PARA_CERRAR_MS;
}

// ── Los textos ───────────────────────────────────────────────────────────────

export interface TextoDeAviso {
  titulo: string;
  cuerpo: string;
}

/** «1 h 22 min», «35 min», «menos de 1 min». */
export function duracionEnPalabras(ms: number): string {
  const minutos = Math.floor(Math.max(0, ms) / 60_000);
  if (minutos < 1) return "menos de 1 min";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const chats = (n: number): string => (n === 1 ? "1 chat" : `${n} chats`);

/** El aviso de apertura: quién, qué pasó, en qué chat y qué hacer. */
export function textoDeCaida(input: {
  cliente: string; causa: CausaDeFallo; chat: string | null; proveedor?: ProveedorDeIA;
}): TextoDeAviso {
  const chat = input.chat ? ` Chat afectado: ${input.chat}.` : "";
  return {
    titulo: `🔴 ${input.cliente}: el bot no está respondiendo`,
    cuerpo: `${causaEnSimple(input.causa, input.proveedor)}.${chat} ${queHacer(input.causa, input.proveedor)}`,
  };
}

/** El recordatorio: sigue caído, cuántos chats van y desde cuándo. */
export function textoDeRecordatorio(input: {
  cliente: string; causa: CausaDeFallo; chatsAfectados: number; desde: Date; ahora: Date; proveedor?: ProveedorDeIA;
}): TextoDeAviso {
  return {
    titulo: `🔴 ${input.cliente}: el bot SIGUE sin responder`,
    cuerpo:
      `${causaEnSimple(input.causa, input.proveedor)}. Van ${chats(input.chatsAfectados)} sin respuesta en `
      + `${duracionEnPalabras(input.ahora.getTime() - input.desde.getTime())}. ${queHacer(input.causa, input.proveedor)}`,
  };
}

/** El cierre: volvió, cuánto duró y cuántos chats quedaron esperando. */
export function textoDeVuelta(input: {
  cliente: string; causa: CausaDeFallo; chatsAfectados: number; desde: Date; ahora: Date; proveedor?: ProveedorDeIA;
}): TextoDeAviso {
  const pendientes = input.chatsAfectados === 1
    ? " 1 chat quedó sin respuesta: revísalo en el panel."
    : input.chatsAfectados > 1
      ? ` ${chats(input.chatsAfectados)} quedaron sin respuesta: revísalos en el panel.`
      : "";
  return {
    titulo: `🟢 ${input.cliente}: el bot volvió a responder`,
    cuerpo:
      `Estuvo sin responder ${duracionEnPalabras(input.ahora.getTime() - input.desde.getTime())} `
      + `(${causaEnSimple(input.causa, input.proveedor).toLowerCase()}).${pendientes}`,
  };
}

// ── Claude falla y contesta el respaldo ──────────────────────────────────────

/**
 * Con el respaldo de `agent/chat.ts` el cliente NO se queda sin respuesta si
 * Claude falla: contesta gpt-5.5. Justamente por eso nadie se entera. Si lo que
 * pasó es que se acabó el crédito de Anthropic, la clave quedó mal pegada o el
 * modelo está mal escrito, el bot puede pasar días en OpenAI (que se cobra en
 * otra cuenta) y la prueba de Claude deja de medir a Claude. Este aviso es
 * naranja, no rojo: el bot sigue contestando.
 */
export function textoDeClaudeConRespaldo(input: { cliente: string; causa: CausaDeFallo; respaldo: string }): TextoDeAviso {
  return {
    titulo: `🟠 ${input.cliente}: Claude no contesta, responde ${input.respaldo}`,
    cuerpo:
      `${causaEnSimple(input.causa, "anthropic")}. El bot sigue respondiendo con ${input.respaldo} `
      + `(se cobra en la cuenta de OpenAI). ${queHacer(input.causa, "anthropic")}`,
  };
}

export function textoDeClaudeVuelve(input: { cliente: string; causa: CausaDeFallo; respaldo: string; desde: Date; ahora: Date }): TextoDeAviso {
  return {
    titulo: `🟢 ${input.cliente}: Claude volvió a contestar`,
    cuerpo:
      `Contestó ${input.respaldo} durante ${duracionEnPalabras(input.ahora.getTime() - input.desde.getTime())} `
      + `(${causaEnSimple(input.causa, "anthropic").toLowerCase()}).`,
  };
}

const usd = (n: number): string => `$${n.toFixed(2)}`;

/** El aviso de saldo bajo. `aproximado` cuando el gasto se estima con lo que registró este bot. */
export function textoDeSaldoBajo(input: {
  cliente: string; restanteUsd: number; umbralUsd: number; aproximado: boolean; proveedor?: ProveedorDeIA;
}): TextoDeAviso {
  const nombre = input.proveedor === "anthropic" ? "Anthropic (Claude)" : "OpenAI";
  const donde = input.proveedor === "anthropic" ? "console.anthropic.com → Billing" : "platform.openai.com → Billing";
  const cuanto = input.restanteUsd <= 0
    ? `Según la cuenta ya no queda crédito de ${nombre}`
    : `Quedan ${input.aproximado ? "unos " : ""}${usd(input.restanteUsd)} de crédito de ${nombre}`;
  return {
    titulo: `🟠 ${input.cliente}: saldo de ${nombre} bajo`,
    cuerpo:
      `${cuanto} (aviso por debajo de ${usd(input.umbralUsd)}). `
      + `Recarga en ${donde} y anota el saldo nuevo en Ajustes → Bot.`,
  };
}

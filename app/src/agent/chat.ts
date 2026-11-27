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
import { causaDelFallo, type CausaDeFallo } from "../domain/falloDelBot.js";
import { chatReasoningEffort } from "./aiRequestPolicy.js";
import { completarConClaude, RechazoDeClaude, type PeticionChat } from "./chatClaude.js";
import { CLAUDE_MAX_RETRIES, CLAUDE_TIMEOUT_MS, esModeloClaude } from "./claudeCliente.js";

/** Respuestas que NO vinieron del modelo pedido, y de cuál vinieron. */
const ATENDIO_EL_RESPALDO = new WeakMap<object, string>();
/** Por qué contestó el respaldo: va a `ai_runs.tools` como `respaldo_claude:<motivo>`. */
const MOTIVO_DEL_RESPALDO = new WeakMap<object, string>();

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

// ── Pausa de Claude después de un fallo (27-nov-2026) ────────────────────────
//
// Sin esto, CADA llamada probaba Claude primero aunque la anterior acabara de
// fallar igual. Con el crédito agotado eso es solo un 400 rápido por llamada;
// con Anthropic colgado era esperar el tope de 45 s (más un reintento) en cada
// ronda del vendedor, en el rescate y en el Guardián: un turno de 3 rondas
// pasaba de los 5 min y saltaba `turno_colgado`. Tras un fallo del proveedor,
// las llamadas siguientes van directo al respaldo un rato y después se vuelve
// a probar Claude con UNA llamada real (no hay otra forma de saber si volvió).
//
// Lo que depende del contenido (rechazo, respuesta vacía o cortada) no pausa:
// la próxima petición es otra y Claude puede contestarla bien.

const MINUTO = 60_000;
const PAUSA_MS: Partial<Record<CausaDeFallo, number>> = {
  sin_credito: 5 * MINUTO,
  clave_invalida: 5 * MINUTO,
  modelo_inexistente: 5 * MINUTO,
  limite_de_uso: 30_000,
  proveedor_caido: MINUTO,
  proveedor_sin_respuesta: MINUTO,
};
/** Estas afectan a la CUENTA entera (todos los modelos claude-); las demás, a un modelo. */
const DE_LA_CUENTA: ReadonlySet<CausaDeFallo> = new Set(["sin_credito", "clave_invalida"]);
/** Estas necesitan a una persona: se avisa a soporte aunque el cliente haya recibido respuesta. */
export const CAUSAS_QUE_AVISAN: ReadonlySet<CausaDeFallo> = new Set(["sin_credito", "clave_invalida", "modelo_inexistente"]);

interface Pausa { hasta: number; causa: CausaDeFallo }
const pausas = new Map<string, Pausa>();
const TODA_LA_CUENTA = "*";

function pausaVigente(model: string, ahora: number): Pausa | null {
  for (const clave of [TODA_LA_CUENTA, model]) {
    const pausa = pausas.get(clave);
    if (pausa && pausa.hasta > ahora) return pausa;
    if (pausa) pausas.delete(clave);
  }
  return null;
}

/** `retry-after` del 429, si vino (segundos), acotado a algo razonable. */
function esperaPedida(error: unknown): number | null {
  const cabeceras = (error as { headers?: { get?: (k: string) => string | null } } | null)?.headers;
  const valor = typeof cabeceras?.get === "function" ? Number(cabeceras.get("retry-after")) : NaN;
  return Number.isFinite(valor) && valor > 0 ? Math.min(Math.max(valor * 1000, 5_000), 5 * MINUTO) : null;
}

function pausar(model: string, causa: CausaDeFallo, error: unknown, ahora: number): void {
  const ms = causa === "limite_de_uso" ? (esperaPedida(error) ?? PAUSA_MS.limite_de_uso!) : PAUSA_MS[causa];
  if (!ms) return;
  pausas.set(DE_LA_CUENTA.has(causa) ? TODA_LA_CUENTA : model, { hasta: ahora + ms, causa });
}

/** Para las pruebas. */
export function _olvidarPausasDeClaude(): void {
  pausas.clear();
  revisarVuelta = true;
  ultimaRevisionDeVuelta = 0;
}

/** Qué se registra como motivo: la causa del proveedor o lo que pasó con el contenido. */
function motivoDe(error: unknown, causa: CausaDeFallo): string {
  if (error instanceof RechazoDeClaude) return "rechazo";
  const texto = error instanceof Error ? error.message : String(error);
  if (texto.startsWith("empty_response")) return "respuesta_vacia";
  if (texto.startsWith("truncated_response")) return "cortada";
  return causa;
}

// ── Aviso a soporte ──────────────────────────────────────────────────────────
//
// El respaldo hace que el cliente no note nada, y por eso mismo nadie se
// enteraba: con el crédito de Anthropic agotado (o la clave mal pegada) el bot
// podía pasar días en gpt-5.5. Se avisa con `services/avisosASoporte.ts`
// (importado al vuelo: este archivo no tiene por qué cargar la base y WhatsApp
// para contestar un chat).

export interface AvisosDeClaude {
  fallo: (input: { error: unknown; causa: CausaDeFallo; respaldo: string }) => Promise<unknown>;
  volvio: (input: { respaldo: string }) => Promise<{ quedanAbiertos: boolean }>;
}
const avisosReales: AvisosDeClaude = {
  fallo: async (input) => (await import("../services/avisosASoporte.js")).reportarFalloDeClaude(input),
  volvio: async (input) => (await import("../services/avisosASoporte.js")).reportarClaudeResponde(input),
};
let avisos: AvisosDeClaude = avisosReales;
/** Para las pruebas: en vez de la base y WhatsApp, estas funciones. */
export function _usarAvisosDeClaude(fns: AvisosDeClaude | null): void {
  avisos = fns ?? avisosReales;
}

/** ¿Puede haber un incidente de Claude abierto? Arranca en sí: puede venir de antes de un reinicio. */
let revisarVuelta = true;
let ultimaRevisionDeVuelta = 0;
const REVISION_DE_VUELTA_MS = MINUTO;

function claudeContesto(respaldo: string, ahora: number): void {
  if (!revisarVuelta || ahora - ultimaRevisionDeVuelta < REVISION_DE_VUELTA_MS) return;
  ultimaRevisionDeVuelta = ahora;
  void avisos.volvio({ respaldo })
    .then((r) => { if (!r.quedanAbiertos) revisarVuelta = false; })
    .catch(() => undefined);
}

/** Lo que sale de Claude sin respaldo lleva la marca: el aviso de «no responde» nombra a Anthropic. */
function marcarDeAnthropic(error: unknown): unknown {
  if (error && typeof error === "object" && Object.isExtensible(error)) {
    Object.assign(error, { proveedor: "anthropic" });
  }
  return error;
}

export interface OpcionesDeChat {
  esfuerzo?: EsfuerzoClaude;
  /**
   * Tope de espera del intento con Claude. El Guardián tiene 20 s en total: si
   * Claude se lleva los 45 s de siempre, el respaldo nunca alcanza a revisar.
   */
  tiempoClaudeMs?: number;
}

export async function completarChat(
  openai: OpenAI,
  peticion: PeticionChat,
  opciones: OpcionesDeChat = {},
): Promise<ChatCompletion> {
  if (!esModeloClaude(peticion.model)) return openai.chat.completions.create(peticion);
  const respaldo = config.anthropic.respaldoOpenAI;
  const ahora = Date.now();

  const pausa = respaldo ? pausaVigente(peticion.model, ahora) : null;
  if (respaldo && pausa) {
    const respuesta = await openai.chat.completions.create(peticionDeRespaldo(peticion, respaldo));
    ATENDIO_EL_RESPALDO.set(respuesta, respaldo);
    MOTIVO_DEL_RESPALDO.set(respuesta, `${pausa.causa}:en_pausa`);
    return respuesta;
  }

  try {
    const respuesta = await completarConClaude(peticion, {
      esfuerzo: opciones.esfuerzo ?? "low",
      http: {
        timeout: opciones.tiempoClaudeMs ?? CLAUDE_TIMEOUT_MS,
        // Con respaldo, reintentar es hacer esperar al cliente por algo que
        // gpt-5.5 contesta ya. Sin respaldo, el reintento es lo único que hay.
        maxRetries: respaldo ? 0 : CLAUDE_MAX_RETRIES,
      },
    });
    // El respaldo DEL SERVIDOR (Sonnet/Fable ante un rechazo) contesta con
    // otro modelo y otra tarifa: se registra el que contestó de verdad.
    if (respuesta.model && esModeloClaude(respuesta.model) && respuesta.model !== peticion.model) {
      ATENDIO_EL_RESPALDO.set(respuesta, respuesta.model);
    }
    if (respaldo) claudeContesto(respaldo, Date.now());
    return respuesta;
  } catch (error) {
    if (!respaldo) throw marcarDeAnthropic(error);
    const causa = causaDelFallo(error);
    const motivo = motivoDe(error, causa);
    // Un tope corto que pidió quien llama (el Guardián, 12 s) es una decisión de
    // latencia, no prueba de que Anthropic esté caído: Haiku pasa de 12 s en
    // menos del 1 % de las revisiones. Ese timeout no pausa al modelo.
    const timeoutPropio = causa === "proveedor_sin_respuesta" && opciones.tiempoClaudeMs !== undefined;
    if (motivo === causa && !timeoutPropio) pausar(peticion.model, causa, error, Date.now());
    console.warn(
      `⚠️ ${peticion.model} falló (${motivo}: ${error instanceof Error ? error.message : String(error)}); contesta ${respaldo}.`,
    );
    if (motivo === causa && CAUSAS_QUE_AVISAN.has(causa)) {
      revisarVuelta = true;
      void avisos.fallo({ error, causa, respaldo }).catch(() => undefined);
    }
    const respuesta = await openai.chat.completions.create(peticionDeRespaldo(peticion, respaldo));
    ATENDIO_EL_RESPALDO.set(respuesta, respaldo);
    MOTIVO_DEL_RESPALDO.set(respuesta, motivo);
    return respuesta;
  }
}

/** El modelo que de verdad contestó: el pedido, salvo que haya entrado el respaldo. */
export function modeloQueAtendio(respuesta: ChatCompletion, pedido: string): string {
  return ATENDIO_EL_RESPALDO.get(respuesta) ?? pedido;
}

/**
 * Si contestó el respaldo de OpenAI, la marca para `ai_runs.tools`
 * (`respaldo_claude:sin_credito`, `respaldo_claude:rechazo`…); si no, null.
 * Así una auditoría cuenta cuántos turnos de «Claude» atendió en verdad gpt-5.5.
 */
export function marcaDelRespaldo(respuesta: ChatCompletion): string | null {
  const motivo = MOTIVO_DEL_RESPALDO.get(respuesta);
  return motivo ? `respaldo_claude:${motivo}` : null;
}

/**
 * Tokens que esta llamada ESCRIBIÓ al caché. Solo Claude lo cobra aparte (más
 * caro que la entrada normal); con OpenAI es siempre 0.
 */
export function tokensEscritosEnCache(respuesta: ChatCompletion): number {
  return (respuesta.usage as { cache_write_tokens?: number } | undefined)?.cache_write_tokens ?? 0;
}

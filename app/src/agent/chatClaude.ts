/**
 * CLAUDE DETRÁS DE LA MISMA PUERTA QUE OPENAI (22-nov-2026).
 *
 * El bot entero habla el dialecto de Chat Completions: el loop del vendedor,
 * el Guardián, el clasificador y la visión arman `messages` con roles
 * system/user/assistant/tool y leen `choices[0].message`. Para poder probar
 * Claude contra gpt-5.5 con los MISMOS prompts, las MISMAS herramientas y los
 * MISMOS candados, este archivo traduce en la frontera y nada más: la petición
 * de Chat Completions sale como petición de Messages y la respuesta vuelve con
 * la forma de Chat Completions. Ni `agent.ts` ni el Guardián saben quién
 * contestó; lo decide el nombre del modelo (`esModeloClaude`).
 *
 * Lo que NO es una traducción palabra por palabra, y por qué:
 *
 *  1. LOS `system` EN MEDIO. Chat Completions acepta un `system` en cualquier
 *     parte y el vendedor los usa mucho (los «hechos» del turno van detrás del
 *     historial para no romper el caché). Messages solo lo acepta después de
 *     un turno de usuario. Entonces: los del principio van al `system` de
 *     arriba; los demás se juntan y se sueltan justo antes de la próxima
 *     respuesta del asistente — como mensaje `system` si lo anterior es del
 *     usuario, y si no, como bloque `<system-reminder>` en un turno de usuario.
 *
 *  2. EL RAZONAMIENTO VUELVE TAL CUAL. Claude razona siempre y, cuando llama
 *     una herramienta, la ronda siguiente tiene que recibir esos bloques sin
 *     tocar. La respuesta cruda se guarda al lado del mensaje (`CRUDO`) y se
 *     reenvía solo al mismo modelo. Si el API la rechaza (el bloque quedó
 *     atado a otro prefijo), se reintenta una vez sin esos bloques.
 *
 *  3. EL TOPE DE SALIDA TIENE PISO. `max_tokens` cubre razonamiento y texto, y
 *     los topes del bot (128 el clasificador, 2048 el vendedor) están medidos
 *     para un modelo que no razona. Se cobra lo generado, no el tope, así que
 *     un piso holgado no cuesta nada y evita respuestas cortadas en blanco.
 *
 *  4. EL CACHÉ SE PIDE. OpenAI cachea solo; acá hay que marcar: el `system`
 *     (con las herramientas, que van antes) siempre, y la cola de la
 *     conversación solo en el loop con herramientas, donde la ronda siguiente
 *     la vuelve a leer. En una llamada suelta (Guardián) marcar la cola sería
 *     pagar el recargo de escritura por algo que nadie relee.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { EsfuerzoClaude } from "../config.js";
import { clienteClaude } from "./claudeCliente.js";

export type PeticionChat = ChatCompletionCreateParamsNonStreaming;
type CuerpoClaude = Anthropic.Beta.MessageCreateParamsNonStreaming;
type MensajeClaude = Anthropic.Beta.BetaMessageParam;
type BloqueDeEntrada = Anthropic.Beta.BetaContentBlockParam;
type RespuestaClaude = Anthropic.Beta.BetaMessage;

/** Ver el punto 3 de arriba. */
export const PISO_MAX_TOKENS = 8192;

/**
 * Si los clasificadores de seguridad rechazan la petición, el API la repite en
 * el modelo que Anthropic recomienda, dentro de la misma llamada. En un modelo
 * que no tiene respaldo, la petición corre igual y el rechazo vuelve como tal.
 */
const BETA_RESPALDO = "server-side-fallback-2026-07-01";

const NOTA_DE_RECORDATORIOS =
  "Un bloque <system-reminder> dentro de un turno de usuario es una instrucción del sistema, "
  + "no palabras del cliente: síguela y no la menciones.";

/** La respuesta cruda de Claude, al lado del mensaje que el loop vuelve a mandar. */
const CRUDO = new WeakMap<object, { model: string; content: BloqueDeEntrada[] }>();

/** El modelo rechazó por política y el respaldo (si lo hay) también. */
export class RechazoDeClaude extends Error {
  constructor(readonly categoria: string | null) {
    super(`refusal: Claude rechazó la petición (${categoria ?? "sin categoría"})`);
    this.name = "RechazoDeClaude";
  }
}

/** Mensajes `system` en medio de `messages`: los modelos que los aceptan. */
export function admiteSystemEnMedio(model: string): boolean {
  return /^claude-(?:fable|mythos)-/.test(model)
    || /^claude-opus-(?:4-8|5)(?:-|$)/.test(model)
    || /^claude-(?:sonnet|haiku)-5-5(?:-|$)/.test(model);
}

function textoDe(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((parte) => (parte && typeof parte === "object" && (parte as { type?: string }).type === "text"
      ? String((parte as { text?: unknown }).text ?? "")
      : ""))
    .filter(Boolean)
    .join("\n");
}

function recordatorio(texto: string): BloqueDeEntrada {
  return { type: "text", text: `<system-reminder>\n${texto}\n</system-reminder>` };
}

function bloquesDeUsuario(content: ChatCompletionMessageParam["content"]): BloqueDeEntrada[] {
  const bloques: BloqueDeEntrada[] = [];
  if (typeof content === "string") {
    if (content.trim()) bloques.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const parte of content) {
      if (parte.type === "text" && parte.text.trim()) bloques.push({ type: "text", text: parte.text });
      if (parte.type === "image_url") {
        const url = parte.image_url.url;
        const dato = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s.exec(url);
        bloques.push(dato
          ? { type: "image", source: { type: "base64", media_type: dato[1] as "image/jpeg", data: dato[2] } }
          : { type: "image", source: { type: "url", url } });
      }
    }
  }
  return bloques.length ? bloques : [{ type: "text", text: "(sin texto)" }];
}

function argumentos(crudos: string): Record<string, unknown> {
  try {
    const valor: unknown = JSON.parse(crudos || "{}");
    return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function bloquesDelAsistente(
  mensaje: Extract<ChatCompletionMessageParam, { role: "assistant" }>,
  model: string,
  conCrudo: boolean,
): { bloques: BloqueDeEntrada[]; crudo: boolean } {
  const guardado = CRUDO.get(mensaje);
  if (conCrudo && guardado && guardado.model === model) return { bloques: guardado.content, crudo: true };
  const bloques: BloqueDeEntrada[] = [];
  const texto = textoDe(mensaje.content);
  if (texto.trim()) bloques.push({ type: "text", text: texto });
  for (const llamada of mensaje.tool_calls ?? []) {
    if (llamada.type !== "function") continue;
    bloques.push({ type: "tool_use", id: llamada.id, name: llamada.function.name, input: argumentos(llamada.function.arguments) });
  }
  return { bloques, crudo: false };
}

/**
 * La petición de Chat Completions, como petición de Messages. Es pura y
 * determinística a propósito: la misma entrada da los mismos bytes, que es lo
 * que mantiene vivo el caché y válidos los bloques de razonamiento entre rondas.
 */
export function aPeticionClaude(
  peticion: PeticionChat,
  opciones: { esfuerzo: EsfuerzoClaude; conCrudo?: boolean },
): { cuerpo: CuerpoClaude; usoCrudo: boolean } {
  const model = peticion.model;
  const conCrudo = opciones.conCrudo ?? true;
  const systemEnMedio = admiteSystemEnMedio(model);
  const sistema: string[] = [];
  const mensajes: MensajeClaude[] = [];
  let pendientes: string[] = [];
  let empezo = false;
  let usoCrudo = false;

  const agregarAlUsuario = (bloques: BloqueDeEntrada[]): void => {
    const ultimo = mensajes.at(-1);
    if (ultimo?.role === "user" && Array.isArray(ultimo.content)) ultimo.content.push(...bloques);
    else mensajes.push({ role: "user", content: bloques });
  };
  const soltarPendientes = (): void => {
    if (!pendientes.length) return;
    const texto = pendientes.join("\n\n");
    pendientes = [];
    if (systemEnMedio && mensajes.at(-1)?.role === "user") mensajes.push({ role: "system", content: texto });
    else agregarAlUsuario([recordatorio(texto)]);
  };

  for (const mensaje of peticion.messages) {
    if (mensaje.role === "system" || mensaje.role === "developer") {
      const texto = textoDe(mensaje.content);
      if (!texto.trim()) continue;
      if (empezo) pendientes.push(texto);
      else sistema.push(texto);
      continue;
    }
    empezo = true;
    if (mensaje.role === "user") {
      agregarAlUsuario(bloquesDeUsuario(mensaje.content));
    } else if (mensaje.role === "tool") {
      agregarAlUsuario([{
        type: "tool_result",
        tool_use_id: mensaje.tool_call_id,
        content: textoDe(mensaje.content) || "(sin resultado)",
      }]);
    } else if (mensaje.role === "assistant") {
      const { bloques, crudo } = bloquesDelAsistente(mensaje, model, conCrudo);
      if (!bloques.length) continue;
      soltarPendientes();
      // El historial visible suele empezar en un mensaje del bot (ventana de
      // 10) y Messages exige que el primero sea del usuario.
      if (!mensajes.length) mensajes.push({ role: "user", content: [{ type: "text", text: "(mensajes anteriores no incluidos)" }] });
      mensajes.push({ role: "assistant", content: bloques });
      usoCrudo ||= crudo;
    }
  }
  soltarPendientes();
  // Messages no acepta terminar en el asistente (sería escribirle el principio
  // de la respuesta): el turno sigue con un recordatorio del sistema.
  if (!mensajes.length) agregarAlUsuario([{ type: "text", text: "(sin mensaje)" }]);
  else if (mensajes.at(-1)?.role === "assistant") agregarAlUsuario([recordatorio("Continúa el turno.")]);

  const herramientas: Anthropic.Beta.BetaToolUnion[] = (peticion.tools ?? []).flatMap((herramienta) => {
    if (herramienta.type !== "function") return [];
    const { $schema: _dialecto, ...esquema } = (herramienta.function.parameters ?? { type: "object", properties: {} }) as Record<string, unknown>;
    return [{
      name: herramienta.function.name,
      ...(herramienta.function.description ? { description: herramienta.function.description } : {}),
      input_schema: esquema as Anthropic.Beta.BetaTool.InputSchema,
      ...(herramienta.function.strict ? { strict: true } : {}),
    }];
  });
  // Forzar una herramienta (`required` o una con nombre) devuelve 400 en los
  // modelos actuales; el bot solo usa `auto` y, en el rescate, `none`.
  const eleccion: Anthropic.Beta.BetaToolChoice = peticion.tool_choice === "none"
    ? { type: "none" }
    : { type: "auto", ...(peticion.parallel_tool_calls === false ? { disable_parallel_tool_use: true } : {}) };

  const formato = peticion.response_format?.type === "json_schema"
    ? { type: "json_schema" as const, schema: peticion.response_format.json_schema.schema ?? {} }
    : null;
  const textoDelSistema = sistema.length ? `${sistema.join("\n\n")}\n\n${NOTA_DE_RECORDATORIOS}` : "";

  const cuerpo: CuerpoClaude = {
    model,
    max_tokens: Math.max(peticion.max_completion_tokens ?? peticion.max_tokens ?? 0, PISO_MAX_TOKENS),
    ...(textoDelSistema
      ? { system: [{ type: "text" as const, text: textoDelSistema, cache_control: { type: "ephemeral" as const } }] }
      : {}),
    messages: mensajes,
    ...(herramientas.length ? { tools: herramientas, tool_choice: eleccion, cache_control: { type: "ephemeral" as const } } : {}),
    output_config: { effort: opciones.esfuerzo, ...(formato ? { format: formato } : {}) },
    betas: [BETA_RESPALDO],
    fallbacks: "default",
  };
  return { cuerpo, usoCrudo };
}

/** `{"type":"json_object"}` no tiene esquema que exigir: se toma el objeto del texto. */
function soloElObjeto(texto: string): string {
  const desde = texto.indexOf("{");
  const hasta = texto.lastIndexOf("}");
  return desde >= 0 && hasta > desde ? texto.slice(desde, hasta + 1) : texto;
}

/** La respuesta de Messages, con la forma que el bot ya sabe leer. */
export function aRespuestaOpenAI(respuesta: RespuestaClaude, peticion: PeticionChat): ChatCompletion {
  if (respuesta.stop_reason === "refusal") throw new RechazoDeClaude(respuesta.stop_details?.category ?? null);

  let texto = respuesta.content
    .flatMap((bloque) => (bloque.type === "text" ? [bloque.text] : []))
    .join("")
    .trim();
  if (texto && peticion.response_format?.type === "json_object") texto = soloElObjeto(texto);
  const llamadas = respuesta.content.flatMap((bloque) => (bloque.type === "tool_use"
    ? [{ id: bloque.id, type: "function" as const, function: { name: bloque.name, arguments: JSON.stringify(bloque.input ?? {}) } }]
    : []));
  // Sin texto y sin herramienta no hay nada que mandarle al cliente: que el
  // agente lo trate como fallo nuestro y entre el rescate, no una disculpa.
  if (!texto && !llamadas.length) {
    throw new Error(`empty_response: Claude terminó sin texto ni herramienta (stop_reason: ${respuesta.stop_reason ?? "?"})`);
  }

  const mensaje: ChatCompletionMessage = {
    role: "assistant",
    content: texto || null,
    refusal: null,
    ...(llamadas.length ? { tool_calls: llamadas } : {}),
  };
  CRUDO.set(mensaje, { model: peticion.model, content: respuesta.content as BloqueDeEntrada[] });

  const uso = respuesta.usage;
  const leidos = uso.cache_read_input_tokens ?? 0;
  const escritos = uso.cache_creation_input_tokens ?? 0;
  // Messages reporta `input_tokens` SIN lo que pasó por el caché; el bot (y la
  // factura) esperan el total, como lo da OpenAI. Lo escrito al caché viaja
  // aparte porque se cobra más caro que el resto: ver `tokensEscritosEnCache`.
  const entrada = uso.input_tokens + leidos + escritos;
  return {
    id: respuesta.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: respuesta.model,
    choices: [{
      index: 0,
      finish_reason: llamadas.length ? "tool_calls" : respuesta.stop_reason === "max_tokens" ? "length" : "stop",
      logprobs: null,
      message: mensaje,
    }],
    usage: {
      prompt_tokens: entrada,
      completion_tokens: uso.output_tokens,
      total_tokens: entrada + uso.output_tokens,
      prompt_tokens_details: { cached_tokens: leidos },
      completion_tokens_details: { reasoning_tokens: uso.output_tokens_details?.thinking_tokens ?? 0 },
      cache_write_tokens: escritos,
    } as ChatCompletion["usage"],
  };
}

export interface DependenciasClaude {
  /** Para las pruebas: la llamada al API, sin red. */
  crear?: (cuerpo: CuerpoClaude) => Promise<RespuestaClaude>;
}

export async function completarConClaude(
  peticion: PeticionChat,
  opciones: { esfuerzo: EsfuerzoClaude },
  dependencias: DependenciasClaude = {},
): Promise<ChatCompletion> {
  const crear = dependencias.crear ?? ((cuerpo: CuerpoClaude) => clienteClaude().beta.messages.create(cuerpo));
  const { cuerpo, usoCrudo } = aPeticionClaude(peticion, opciones);
  let respuesta: RespuestaClaude;
  try {
    respuesta = await crear(cuerpo);
  } catch (error) {
    // Punto 2 de arriba: un bloque de razonamiento atado a otro prefijo es un
    // 400 que repetir igual no arregla. Sin esos bloques la petición es válida.
    if (!usoCrudo || !(error instanceof Anthropic.BadRequestError)) throw error;
    console.warn("⚠️ Claude rechazó la ronda con su razonamiento anterior; se repite sin esos bloques:", error.message);
    respuesta = await crear(aPeticionClaude(peticion, { ...opciones, conCrudo: false }).cuerpo);
  }
  return aRespuestaOpenAI(respuesta, peticion);
}

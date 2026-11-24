/**
 * UN ANTHROPIC DE MENTIRA QUE RECHAZA LO QUE EL DE VERDAD RECHAZA.
 *
 * Sirve `POST /v1/messages` y `GET /v1/models/:id` en un puerto local. No
 * intenta ser inteligente: su trabajo es devolver 400 ante cada forma de
 * petición que la API real no acepta (reglas leídas de la documentación el
 * 22-nov-2026), para que un error de traducción se vea en una prueba sin clave
 * y no en el primer cliente. Lo que SÍ contesta es fijo y predecible.
 *
 * Reglas que aplica:
 *  · el primer mensaje es del usuario y el último no es del asistente;
 *  · un `system` en medio va después de un turno de usuario y antes de uno del
 *    asistente (o al final), y solo en modelos que lo aceptan;
 *  · todo `tool_use` recibe su `tool_result` en el mensaje siguiente, primero;
 *  · si hay bloques de herramienta, viene la lista `tools`;
 *  · nada de `temperature`, `thinking` apagado, `tool_choice` forzado ni texto vacío;
 *  · a lo sumo 4 marcas de caché;
 *  · un bloque `thinking` reenviado vale solo con el MISMO prefijo que lo produjo.
 */
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";

type Bloque = { type: string; [k: string]: unknown };
type Mensaje = { role: string; content: string | Bloque[] };
interface Cuerpo {
  model: string; max_tokens: number; system?: unknown; messages: Mensaje[]; tools?: { name: string; input_schema?: { type?: string } }[];
  tool_choice?: { type: string }; output_config?: { effort?: string; format?: { type: string; schema?: unknown } };
  [k: string]: unknown;
}

const SYSTEM_EN_MEDIO = /^claude-(?:fable|mythos)-|^claude-opus-(?:4-8|5)(?:-|$)|^claude-(?:sonnet|haiku)-5-5(?:-|$)/;
const bloques = (m: Mensaje): Bloque[] => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content);
const huella = (x: unknown): string => createHash("sha1").update(JSON.stringify(x)).digest("hex").slice(0, 16);

/** Devuelve el motivo del 400, o null si la petición es válida. */
export function motivoDeRechazo(cuerpo: Cuerpo, cabeceras: Record<string, string | string[] | undefined>): string | null {
  // El SDK 1.x manda la clave como `Authorization: Bearer`; los anteriores, como `x-api-key`.
  if (!cabeceras["x-api-key"] && !cabeceras.authorization) return "falta la clave (x-api-key o Authorization)";
  if ("betas" in cuerpo) return "`betas` viajó en el cuerpo: va en la cabecera anthropic-beta";
  if (cuerpo.fallbacks !== undefined && !String(cabeceras["anthropic-beta"] ?? "").includes("server-side-fallback-")) return "fallbacks sin su cabecera beta";
  if (!(cuerpo.max_tokens > 0)) return "max_tokens: Field required";
  for (const prohibido of ["temperature", "top_p", "top_k"]) if (prohibido in cuerpo) return `${prohibido} is not supported for this model`;
  const thinking = cuerpo.thinking as { type?: string } | undefined;
  if (thinking && thinking.type !== "adaptive") return `thinking.type.${thinking.type} is not supported for this model`;
  if (cuerpo.tool_choice && !["auto", "none"].includes(cuerpo.tool_choice.type)) return 'tool_choice: type "tool" and "any" are not supported for this model.';
  for (const t of cuerpo.tools ?? []) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(t.name)) return `tools: nombre inválido «${t.name}»`;
    if (t.input_schema?.type !== "object") return `tools.${t.name}.input_schema.type: debe ser "object"`;
  }
  const ms = cuerpo.messages;
  if (!ms?.length) return "messages: at least one message is required";
  if (ms[0].role !== "user") return "messages: first message must use the user role";
  if (ms.at(-1)!.role === "assistant") return "This model does not support assistant message prefill";

  let marcas = JSON.stringify(cuerpo.system ?? "").split('"cache_control"').length - 1 + (cuerpo.cache_control ? 1 : 0);
  let hayHerramientas = false;
  for (let i = 0; i < ms.length; i += 1) {
    const m = ms[i];
    marcas += JSON.stringify(m.content).split('"cache_control"').length - 1;
    if (m.role === "system") {
      if (!SYSTEM_EN_MEDIO.test(cuerpo.model)) return "role 'system' is not supported on this model";
      if (ms[i - 1]?.role !== "user") return "a system message must follow a user message";
      if (i < ms.length - 1 && ms[i + 1].role !== "assistant") return "a system message must be last or be followed by an assistant turn";
      if (typeof m.content !== "string" || !m.content.trim()) return "system message content must be non-empty text";
      continue;
    }
    for (const b of bloques(m)) {
      if (b.type === "text" && !String(b.text ?? "").trim()) return "text content blocks must contain non-whitespace text";
      if (b.type === "thinking" && typeof b.signature !== "string") return "thinking block sin signature";
      if (b.type === "tool_use" || b.type === "tool_result") hayHerramientas = true;
    }
    if (m.role === "assistant") {
      const usos = bloques(m).filter((b) => b.type === "tool_use").map((b) => String(b.id));
      if (!usos.length) continue;
      const siguiente = ms[i + 1];
      const primeros = siguiente?.role === "user" ? bloques(siguiente).slice(0, usos.length) : [];
      if (primeros.length !== usos.length || primeros.some((b, k) => b.type !== "tool_result" || b.tool_use_id !== usos[k])) {
        return "tool_use ids were found without tool_result blocks immediately after";
      }
    }
    if (m.role === "user") {
      const previos = new Set(ms[i - 1]?.role === "assistant" ? bloques(ms[i - 1]).filter((b) => b.type === "tool_use").map((b) => String(b.id)) : []);
      for (const b of bloques(m)) if (b.type === "tool_result" && !previos.has(String(b.tool_use_id))) return "unexpected tool_use_id found in tool_result blocks";
    }
  }
  if (hayHerramientas && !cuerpo.tools?.length) return "Requests which include tool_use or tool_result blocks must define tools";
  if (marcas > 4) return "A maximum of 4 blocks with cache_control may be provided";

  // Un bloque de razonamiento reenviado está atado a lo que había ANTES de él.
  for (let i = 0; i < ms.length; i += 1) {
    if (ms[i].role !== "assistant") continue;
    for (const b of bloques(ms[i])) {
      if (b.type !== "thinking") continue;
      const esperado = `firma:${cuerpo.model}:${huella([cuerpo.system ?? null, [...(cuerpo.tools ?? [])].sort((x, y) => x.name.localeCompare(y.name)), ms.slice(0, i)])}`;
      if (b.signature !== esperado) return "The block is bound to a different conversation.";
    }
  }
  return null;
}

/** La respuesta fija: busca, luego habla; cotiza si se lo ordenan; JSON si se pide. */
function responder(cuerpo: Cuerpo): Record<string, unknown> {
  const ms = cuerpo.messages;
  const todo = JSON.stringify(ms);
  const ultimoUsuario = [...ms].reverse().find((m) => m.role === "user")!;
  const traeResultado = bloques(ultimoUsuario).some((b) => b.type === "tool_result");
  const puedeLlamar = Boolean(cuerpo.tools?.length) && cuerpo.tool_choice?.type !== "none";
  const firma = `firma:${cuerpo.model}:${huella([cuerpo.system ?? null, [...(cuerpo.tools ?? [])].sort((x, y) => x.name.localeCompare(y.name)), ms])}`;
  const pensar = { type: "thinking", thinking: "", signature: firma };
  let content: Bloque[];
  let stop = "end_turn";
  if (cuerpo.output_config?.format?.type === "json_schema") {
    const mal = todo.includes("59.90");
    content = [pensar, { type: "text", text: JSON.stringify({ veredicto: mal ? "corregir" : "aprobar", texto_corregido: mal ? "KENDA KR203 a $78.50 c/u." : "", hallazgos: mal ? [{ categoria: "precio", severidad: "alta", detalle: "El precio no es el del catálogo." }] : [] }) }];
  } else if (puedeLlamar && /TE FALTÓ LA OBLIGACIÓN/.test(todo.slice(-900))) {
    content = [pensar, { type: "tool_use", id: `toolu_${huella(ms)}`, name: "generar_cotizacion", input: { code: "K205", cantidad: 4 } }];
    stop = "tool_use";
  } else if (puedeLlamar && !traeResultado) {
    content = [pensar, { type: "tool_use", id: `toolu_${huella(ms)}`, name: cuerpo.tools![0].name, input: { medida: "205/55R16" } }];
    stop = "tool_use";
  } else if (/SOLO JSON/.test(todo)) {
    content = [pensar, { type: "text", text: '```json\n{"stage":"medida_confirmada"}\n```' }];
  } else {
    content = [pensar, { type: "text", text: "Tenemos KENDA KR203 a $78.50 y FALKEN ZE310 a $96.00. ¿Le cotizo el juego de 4 llantas?" }];
  }
  const tamano = Math.round(JSON.stringify([cuerpo.system, cuerpo.tools, ms]).length / 4);
  const leido = ms.length > 2 || /59\.90/.test(todo) ? Math.round(tamano * 0.7) : 0;
  return {
    id: `msg_${huella([cuerpo, Date.now()])}`, type: "message", role: "assistant", model: cuerpo.model, content,
    stop_reason: stop, stop_sequence: null, stop_details: null,
    usage: { input_tokens: tamano - leido - 50, cache_read_input_tokens: leido, cache_creation_input_tokens: 50, output_tokens: 60, output_tokens_details: { thinking_tokens: 35 } },
  };
}

export interface Doble { url: string; peticiones: { cuerpo: Cuerpo; cabeceras: Record<string, string | string[] | undefined>; rechazo: string | null }[]; cerrar: () => Promise<void> }

export async function levantarDobleDeAnthropic(puerto = 0): Promise<Doble> {
  const peticiones: Doble["peticiones"] = [];
  const servidor: Server = createServer((req, res) => {
    const enviar = (estado: number, json: unknown): void => { res.writeHead(estado, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
    if (req.method === "GET" && req.url?.startsWith("/v1/models/")) {
      const id = decodeURIComponent(req.url.slice("/v1/models/".length).split("?")[0]);
      return id.startsWith("claude-") && !id.includes("no-existe")
        ? enviar(200, { id, type: "model", display_name: id, created_at: "2026-01-01T00:00:00Z" })
        : enviar(404, { type: "error", error: { type: "not_found_error", message: `model: ${id}` } });
    }
    if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) return enviar(404, { type: "error", error: { type: "not_found_error", message: "ruta" } });
    let crudo = "";
    req.on("data", (trozo) => { crudo += trozo; });
    req.on("end", () => {
      const cuerpo = JSON.parse(crudo) as Cuerpo;
      const rechazo = motivoDeRechazo(cuerpo, req.headers);
      peticiones.push({ cuerpo, cabeceras: req.headers, rechazo });
      if (rechazo) return enviar(400, { type: "error", error: { type: "invalid_request_error", message: rechazo } });
      return enviar(200, responder(cuerpo));
    });
  });
  await new Promise<void>((listo) => servidor.listen(puerto, "127.0.0.1", listo));
  const direccion = servidor.address() as { port: number };
  return { url: `http://127.0.0.1:${direccion.port}`, peticiones, cerrar: () => new Promise((fin) => servidor.close(() => fin())) };
}

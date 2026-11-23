/**
 * Lectura del payload de ecos de Meta (`message_echoes` / `smb_message_echoes`).
 *
 * Vive en `domain/` y no en `wa/` por la misma razón que `opcionesCandados.ts`:
 * es puro (sin base, sin red, sin catálogo) y así se puede probar sin levantar
 * nada. El que sí toca la base es `wa/echoes.ts`.
 *
 * Contexto de por qué existe: ticket 1286 del 6-ago-2026. El asesor le estaba
 * contestando al cliente desde WhatsApp y para el sistema esa conversación
 * estaba muda — 20 mensajes del cliente sin una sola respuesta guardada.
 * `whatsapp-api-js` solo despacha `field === "messages"` y `"calls"`; todo eco
 * se perdía en silencio.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Los dos campos con los que Meta manda un eco, según cómo se envió. */
const CAMPOS_ECO = new Set(["message_echoes", "smb_message_echoes"]);

export interface EchoMessage {
  id: string;
  to: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string; id?: string; mime_type?: string };
  video?: { caption?: string; id?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  sticker?: { id?: string; mime_type?: string };
  document?: { caption?: string; filename?: string; id?: string; mime_type?: string };
  location?: { name?: string; address?: string };
  [key: string]: unknown;
}

/**
 * ¿El cuerpo crudo es un eco? Se mira sin verificar la firma todavía: solo
 * decide a quién le toca el payload. La firma se comprueba antes de escribir.
 */
export function esPayloadDeEco(rawBody: string): boolean {
  try {
    const data = JSON.parse(rawBody) as { entry?: { changes?: { field?: string }[] }[] };
    return (data.entry ?? []).some((entry) =>
      (entry.changes ?? []).some((change) => CAMPOS_ECO.has(change.field ?? "")),
    );
  } catch {
    return false;
  }
}

/**
 * Firma de Meta sobre los bytes crudos. Mismo esquema que usa `handle_post`
 * para los mensajes normales: sin esto, cualquiera que conozca la URL del
 * webhook podría inyectar mensajes falsos en el historial de un cliente.
 */
export function firmaValida(
  rawBody: string,
  firma: string | undefined,
  appSecret: string,
): boolean {
  if (!firma || !appSecret) return false;
  const recibido = firma.startsWith("sha256=") ? firma.slice(7) : firma;
  if (!/^[0-9a-f]*$/i.test(recibido)) return false;
  const a = Buffer.from(recibido, "hex");
  const b = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"), "hex");
  // timingSafeEqual revienta si los largos difieren: se comparan antes.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Todos los ecos que trae el payload, sin importar en qué campo vengan. */
export function extraerEcos(rawBody: string): EchoMessage[] {
  let data: { entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  try {
    data = JSON.parse(rawBody);
  } catch {
    return [];
  }
  const ecos: EchoMessage[] = [];
  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (!CAMPOS_ECO.has(change.field ?? "")) continue;
      const value = change.value ?? {};
      // Meta nombra el array igual que el campo; algunas versiones lo mandan
      // como `messages`. Se aceptan los tres para no perder mensajes por una
      // diferencia de nomenclatura entre versiones de la API.
      const lista =
        (value.message_echoes as EchoMessage[] | undefined) ??
        (value.smb_message_echoes as EchoMessage[] | undefined) ??
        (value.messages as EchoMessage[] | undefined) ??
        [];
      for (const eco of lista) if (eco?.id && eco?.to) ecos.push(eco);
    }
  }
  return ecos;
}

/**
 * Texto que se guarda en el historial. El agente lee esta columna, así que un
 * eco sin texto útil tiene que decir QUÉ se mandó — en blanco le hace creer
 * que ahí no pasó nada y vuelve a preguntar lo que el asesor ya resolvió.
 */
export function contenidoDeEco(eco: EchoMessage): string {
  const directo =
    eco.text?.body ?? eco.image?.caption ?? eco.video?.caption ?? eco.document?.caption;
  if (directo?.trim()) return directo.trim();
  switch (eco.type) {
    case "image":
      return "[el asesor envió una imagen]";
    case "video":
      return "[el asesor envió un video]";
    case "audio":
      return "[el asesor envió una nota de voz]";
    case "sticker":
      return "[el asesor envió un sticker]";
    case "document":
      return `[el asesor envió un documento${eco.document?.filename ? `: ${eco.document.filename}` : ""}]`;
    case "location":
      return `📍 ${eco.location?.name ?? eco.location?.address ?? "ubicación"}`;
    default:
      return `[el asesor envió un mensaje de tipo ${eco.type ?? "desconocido"}]`;
  }
}

/** Tipo de la columna `messages.type` a partir del tipo de WhatsApp. */
export function tipoDeEco(eco: EchoMessage): "text" | "image" | "pdf" | "location" {
  if (eco.type === "image" || eco.type === "sticker") return "image";
  if (eco.type === "document") return "pdf";
  if (eco.type === "location") return "location";
  return "text";
}

/**
 * ¿El eco es una respuesta automática de la app de WhatsApp Business (mensaje
 * de ausencia o de bienvenida) y no una persona contestando?
 *
 * 17-nov-2026, Competimotor (coexistencia): a las 18:15 el celular mandó solo
 * «Gracias por tu mensaje. En este momento no podemos responder…» y el bot lo
 * tomó como un asesor escribiendo: se pausó y el cliente se quedó sin respuesta.
 * Meta no marca esos envíos en el eco, así que se reconocen por dos lados:
 *  · el texto típico de un mensaje automático, o
 *  · que salió a los pocos segundos del mensaje del cliente: nadie lee y
 *    escribe una respuesta en el celular tan rápido.
 */
const SEGUNDOS_DE_UNA_AUTOMATICA = 6;
const TEXTO_AUTOMATICO = new RegExp([
  "no (podemos|estamos disponibles para) (responder|atender)",
  "te (responderemos|contestaremos|atenderemos) (lo antes posible|pronto|en breve)",
  "le (responderemos|contestaremos|atenderemos) (lo antes posible|pronto|en breve)",
  "fuera de(l)? (nuestro )?horario",
  "nuestro horario de atenci[oó]n",
  "d[eé]janos (tu|su) (mensaje|solicitud|consulta)",
  "gracias por (comunicarte|contactarnos|escribirnos)",
].join("|"), "i");

export function esRespuestaAutomatica(texto: string, segundosDesdeElCliente: number | null): boolean {
  if (TEXTO_AUTOMATICO.test(texto)) return true;
  return segundosDesdeElCliente !== null && segundosDesdeElCliente >= 0 && segundosDesdeElCliente < SEGUNDOS_DE_UNA_AUTOMATICA;
}

/**
 * El archivo que trae un eco (foto, audio, video, sticker, documento), para
 * guardarlo y que el panel lo pueda abrir. null si el eco no trae ninguno.
 */
export function medioDeEco(eco: EchoMessage): {
  kind: "image" | "audio" | "video" | "document" | "sticker";
  id: string;
  mime: string | null;
  filename: string | null;
} | null {
  for (const kind of ["image", "audio", "video", "sticker", "document"] as const) {
    if (eco.type !== kind) continue;
    const adjunto = eco[kind];
    if (!adjunto?.id) return null;
    return {
      kind,
      id: String(adjunto.id),
      mime: adjunto.mime_type ?? null,
      filename: kind === "document" ? (eco.document?.filename ?? null) : null,
    };
  }
  return null;
}

/**
 * FOTOS, AUDIOS Y ARCHIVOS DEL CHAT (23-nov-2026).
 *
 * Guarda el archivo de cada mensaje que lo trae —del cliente, del asesor desde
 * su WhatsApp, o del asesor desde la app— para que el panel lo pueda mostrar y
 * abrir. Ver la migración 039.
 *
 * Regla de esta pieza: guardar un archivo NUNCA puede tumbar el mensaje. Todo
 * lo que escribe aquí atrapa su error y sigue; lo peor que pasa es que el
 * panel muestre el texto, como antes.
 */
import { sql } from "../db/client.js";

export type TipoDeMedio = "image" | "audio" | "video" | "document" | "sticker";

/** El mismo tope que `downloadMedia`: lo que pese más no se guarda. */
export const TOPE_MEDIO_BYTES = 8 * 1024 * 1024;

export interface MedioParaGuardar {
  waMessageId: string;
  conversationId?: number | null;
  kind: TipoDeMedio;
  mime?: string | null;
  filename?: string | null;
  /** El id del archivo en Meta: permite volver a bajarlo si hoy no llegó. */
  waMediaId?: string | null;
  bytes?: Buffer | null;
}

/** `audio/ogg; codecs=opus` → `audio/ogg`. El navegador decide con el tipo limpio. */
export function mimeLimpio(mime: string | null | undefined, kind: TipoDeMedio): string {
  const limpio = String(mime ?? "").split(";")[0].trim().toLowerCase();
  if (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(limpio)) return limpio;
  return kind === "image" ? "image/jpeg"
    : kind === "sticker" ? "image/webp"
    : kind === "audio" ? "audio/ogg"
    : kind === "video" ? "video/mp4"
    : "application/octet-stream";
}

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr",
  "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf",
};

/** Un nombre de archivo presentable para abrirlo o compartirlo. */
export function nombreDeArchivo(kind: TipoDeMedio, mime: string, filename: string | null | undefined): string {
  const dado = String(filename ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").trim().slice(0, 120);
  if (dado) return dado;
  const base = kind === "image" ? "foto" : kind === "audio" ? "audio" : kind === "video" ? "video" : kind === "sticker" ? "sticker" : "archivo";
  const ext = EXTENSION[mime];
  return ext ? `${base}.${ext}` : base;
}

/** Guarda (o completa) el archivo de un mensaje. No lanza nunca. */
export async function guardarMedio(medio: MedioParaGuardar): Promise<boolean> {
  try {
    if (!medio.waMessageId) return false;
    const bytes = medio.bytes && medio.bytes.byteLength > 0 && medio.bytes.byteLength <= TOPE_MEDIO_BYTES ? medio.bytes : null;
    const mime = mimeLimpio(medio.mime, medio.kind);
    await sql`
      insert into message_media (wa_message_id, conversation_id, kind, mime, filename, wa_media_id, bytes, size)
      values (
        ${medio.waMessageId}, ${medio.conversationId ?? null}, ${medio.kind}, ${mime},
        ${medio.filename ?? null}, ${medio.waMediaId ?? null}, ${bytes}, ${bytes?.byteLength ?? 0}
      )
      on conflict (wa_message_id) do update set
        bytes = coalesce(excluded.bytes, message_media.bytes),
        size = case when excluded.bytes is null then message_media.size else excluded.size end,
        mime = case when excluded.bytes is null then message_media.mime else excluded.mime end,
        wa_media_id = coalesce(excluded.wa_media_id, message_media.wa_media_id),
        conversation_id = coalesce(excluded.conversation_id, message_media.conversation_id),
        filename = coalesce(excluded.filename, message_media.filename)
    `;
    return Boolean(bytes);
  } catch (error) {
    console.warn("⚠️ No se pudo guardar el archivo del mensaje:", error instanceof Error ? error.message : error);
    return false;
  }
}

type Bajar = (mediaId: string) => Promise<{ bytes: Buffer; mimeType: string } | null>;

/**
 * Baja de Meta el archivo de un mensaje y lo guarda. Si Meta no lo entrega,
 * queda la fila con el id para reintentar al abrirlo. No lanza nunca.
 */
export async function bajarYGuardarMedio(
  medio: Omit<MedioParaGuardar, "bytes">,
  bajar: Bajar,
): Promise<boolean> {
  try {
    const bajado = medio.waMediaId ? await bajar(medio.waMediaId) : null;
    return await guardarMedio({ ...medio, bytes: bajado?.bytes ?? null, mime: bajado?.mimeType ?? medio.mime });
  } catch (error) {
    console.warn("⚠️ No se pudo bajar el archivo del mensaje:", error instanceof Error ? error.message : error);
    return guardarMedio({ ...medio, bytes: null });
  }
}

export interface MedioGuardado {
  kind: TipoDeMedio;
  mime: string;
  nombre: string;
  bytes: Buffer;
}

/**
 * El archivo de un mensaje del panel (por el id de la fila de `messages`).
 * Si cuando llegó no se pudo bajar, lo intenta ahora. null = no hay archivo.
 */
export async function medioDelMensaje(messageId: number, bajar: Bajar): Promise<MedioGuardado | null> {
  const [fila] = await sql<{
    wa_message_id: string; kind: TipoDeMedio; mime: string; filename: string | null;
    wa_media_id: string | null; bytes: Buffer | null;
  }[]>`
    select mm.wa_message_id, mm.kind, mm.mime, mm.filename, mm.wa_media_id, mm.bytes
    from messages m
    join message_media mm on mm.wa_message_id = m.wa_message_id
    where m.id = ${messageId}
  `;
  if (!fila) return null;
  let bytes = fila.bytes;
  let mime = fila.mime;
  if (!bytes && fila.wa_media_id) {
    const bajado = await bajar(fila.wa_media_id).catch(() => null);
    if (bajado) {
      bytes = bajado.bytes;
      mime = mimeLimpio(bajado.mimeType, fila.kind);
      await guardarMedio({ waMessageId: fila.wa_message_id, kind: fila.kind, mime, bytes });
    }
  }
  if (!bytes) return null;
  return { kind: fila.kind, mime, nombre: nombreDeArchivo(fila.kind, mime, fila.filename), bytes };
}

export interface MedioEnLaLista {
  kind: TipoDeMedio;
  mime: string;
  nombre: string;
}

/** Lo que la lista de mensajes dice de cada archivo (sin los bytes). */
export function medioParaLaLista(fila: { media_kind: string | null; media_mime: string | null; media_filename: string | null }): MedioEnLaLista | undefined {
  if (!fila.media_kind) return undefined;
  const kind = fila.media_kind as TipoDeMedio;
  const mime = mimeLimpio(fila.media_mime, kind);
  return { kind, mime, nombre: nombreDeArchivo(kind, mime, fila.media_filename) };
}

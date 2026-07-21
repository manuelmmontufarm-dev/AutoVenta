/**
 * Anti-caos de mensajes entrantes (patrón documentado, sin librería):
 *
 *  1. Idempotencia — Meta reintenta webhooks; cada message.id se procesa una vez.
 *     (Primera línea aquí en memoria; la definitiva es el unique de wa_message_id en DB.)
 *  2. Debounce — la gente escribe 3 mensajes seguidos; se agrupan y se responde una vez.
 *  3. FIFO por usuario — nunca hay dos respuestas en vuelo para el mismo chat.
 */
import { config } from "../config.js";

interface PendingBuffer {
  parts: { text: string; waMessageId: string; receivedAt: Date }[];
  timer: NodeJS.Timeout;
  name?: string;
}

export type InboundHandler = (job: {
  from: string;
  name?: string;
  text: string;
  waMessageIds: string[];
  receivedAt: Date;
}) => Promise<void>;

const SEEN_TTL_MS = 6 * 60 * 60 * 1000;

export class InboundPipeline {
  private seen = new Map<string, number>();
  private buffers = new Map<string, PendingBuffer>();
  private tails = new Map<string, Promise<void>>();

  constructor(private handler: InboundHandler) {
    setInterval(() => this.cleanupSeen(), 60 * 60 * 1000).unref();
  }

  push(from: string, waMessageId: string, text: string, name?: string, receivedAt = new Date()): void {
    if (this.seen.has(waMessageId)) return; // webhook duplicado
    this.seen.set(waMessageId, Date.now());

    const existing = this.buffers.get(from);
    if (existing) {
      clearTimeout(existing.timer);
      existing.parts.push({ text, waMessageId, receivedAt });
      existing.timer = this.startTimer(from);
      if (name) existing.name = name;
    } else {
      this.buffers.set(from, {
        parts: [{ text, waMessageId, receivedAt }],
        timer: this.startTimer(from),
        name,
      });
    }
  }

  private startTimer(from: string): NodeJS.Timeout {
    return setTimeout(() => this.flush(from), config.pipeline.debounceMs);
  }

  private flush(from: string): void {
    const buffer = this.buffers.get(from);
    if (!buffer) return;
    this.buffers.delete(from);

    const job = {
      from,
      name: buffer.name,
      text: buffer.parts.map((p) => p.text).join("\n"),
      waMessageIds: buffer.parts.map((p) => p.waMessageId),
      receivedAt: new Date(Math.max(...buffer.parts.map((p) => p.receivedAt.getTime()))),
    };

    // Cola FIFO por usuario: encadena sobre el último job de este chat.
    const tail = this.tails.get(from) ?? Promise.resolve();
    const next = tail
      .then(() => this.handler(job))
      .catch((err) => console.error(`❌ Error procesando mensaje de ${from}:`, err));
    this.tails.set(from, next);
    next.finally(() => {
      if (this.tails.get(from) === next) this.tails.delete(from);
    });
  }

  private cleanupSeen(): void {
    const cutoff = Date.now() - SEEN_TTL_MS;
    for (const [id, ts] of this.seen) {
      if (ts < cutoff) this.seen.delete(id);
    }
  }
}

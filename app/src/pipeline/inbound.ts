/**
 * Anti-caos de mensajes entrantes (patrón documentado, sin librería):
 *
 *  1. Idempotencia — Meta reintenta webhooks; cada message.id se procesa una vez.
 *     (Primera línea aquí en memoria; la definitiva es el unique de wa_message_id en DB.)
 *  2. Debounce — la gente escribe 3 mensajes seguidos; se agrupan y se responde una vez.
 *  3. FIFO por usuario — nunca hay dos respuestas en vuelo para el mismo chat.
 *  4. Tope global — como mucho config.pipeline.maxConcurrent handlers a la vez.
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
  private enVuelo = 0;
  private espera: (() => void)[] = [];

  constructor(private handler: InboundHandler) {
    setInterval(() => this.cleanupSeen(), 60 * 60 * 1000).unref();
  }

  /**
   * Semáforo global. El FIFO por usuario no limita nada cuando escriben N
   * clientes a la vez: eran N llamadas simultáneas al LLM y bajo carga el rate
   * limit de OpenAI le devolvía un error al cliente. Los excedentes esperan en
   * la cola (responden un poco más tarde) — nunca se descartan.
   *
   * TRADEOFF con la escalación de modelos (7-ago): al escalar a un modelo
   * superior cada handler pasa más tiempo en vuelo, así que con el MISMO
   * tráfico crece la cola. Si se ve espera, se puede probar
   * PIPELINE_MAX_CONCURRENT=8 en Railway — pero midiendo: el tope existe para
   * no reventar el rate limit de OpenAI, y los modelos grandes tienen límites
   * de tokens/min MÁS bajos, así que subirlo a ciegas empeora las cosas.
   */
  private async adquirir(): Promise<void> {
    if (this.enVuelo < config.pipeline.maxConcurrent) {
      this.enVuelo += 1;
      return;
    }
    // El que libera TRASPASA su cupo (ver liberar), así que al despertar ya se
    // tiene el slot: no se vuelve a contar.
    await new Promise<void>((resolve) => this.espera.push(resolve));
  }

  private liberar(): void {
    // Si hay cola, el cupo pasa directo al siguiente. Bajar el contador y
    // despertarlo por separado abría una ventana donde un flush nuevo se
    // colaba y quedaban maxConcurrent+1 en vuelo.
    const siguiente = this.espera.shift();
    if (siguiente) siguiente();
    else this.enVuelo -= 1;
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
    // Un turno de este chat sigue en vuelo: la ráfaga espera y entra JUNTA al
    // siguiente turno, en vez de un turno por mensajito. Producción, 31-ago
    // 17:32: «en rin 20» y «si» llegaron mientras el bot contestaba lo
    // anterior y generaron tres vitrinas seguidas — el cliente lo llamó
    // «se volvió loco», con razón.
    if (this.tails.has(from)) {
      buffer.timer = setTimeout(() => this.flush(from), 500);
      return;
    }
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
      .then(async () => {
        await this.adquirir();
        try {
          await this.handler(job);
        } finally {
          this.liberar();
        }
      })
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

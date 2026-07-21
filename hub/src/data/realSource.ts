import type { DataSource, SourceEvent } from "./source";
import type {
  Atiende,
  Cierre,
  Etapa,
  FeedItem,
  HubMetrics,
  Mensaje,
  Ticket,
  TemplatePlanPreview,
  FollowUpCard,
  BotAlert,
} from "./types";

const ADMIN_KEY_STORAGE = "autoventa_admin_key";

export function getStoredAdminKey(): string {
  return window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
}

export function saveStoredAdminKey(value: string): void {
  const key = value.trim();
  if (key) window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
  else window.localStorage.removeItem(ADMIN_KEY_STORAGE);
}

export class RealSource implements DataSource {
  private listeners = new Set<(event: SourceEvent) => void>();
  private controller: AbortController | null = null;

  async listTickets(): Promise<Ticket[]> {
    return (await this.request<{ tickets: Ticket[] }>("/api/hub/tickets")).tickets;
  }

  async getMensajes(ticketId: number): Promise<Mensaje[]> {
    return (
      await this.request<{ messages: Mensaje[] }>(
        `/api/hub/tickets/${ticketId}/messages`,
      )
    ).messages;
  }

  async getFeed(): Promise<FeedItem[]> {
    return (await this.request<{ feed: FeedItem[] }>("/api/hub/feed")).feed;
  }

  async getMetrics(days = 14): Promise<HubMetrics> {
    return (
      await this.request<{ metrics: HubMetrics }>(
        `/api/hub/metrics?days=${encodeURIComponent(days)}`,
      )
    ).metrics;
  }

  async listFollowUps(): Promise<FollowUpCard[]> {
    return (await this.request<{ followUps: FollowUpCard[] }>("/api/hub/follow-ups")).followUps;
  }

  async listAlerts(): Promise<BotAlert[]> {
    return (await this.request<{ alerts: BotAlert[] }>("/api/hub/alerts")).alerts;
  }

  async followUpAction(id: number, action: "send" | "cancel" | "edit", preview?: string): Promise<void> {
    if (action === "cancel") {
      await this.request(`/api/hub/follow-ups/${id}`, { method: "DELETE" });
    } else if (action === "edit") {
      await this.request(`/api/hub/follow-ups/${id}`, { method: "PATCH", body: JSON.stringify({ preview }) });
    } else {
      await this.request(`/api/hub/follow-ups/${id}/send-now`, { method: "POST", body: "{}" });
    }
  }

  async alertAction(id: number, action: "resolve" | "snooze" | "take"): Promise<void> {
    await this.request(`/api/hub/alerts/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
  }

  async moverEtapa(ticketId: number, etapa: Etapa): Promise<void> {
    await this.request(`/api/hub/tickets/${ticketId}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage: etapa }),
    });
  }

  async cerrar(ticketId: number, cierre: Cierre, nota?: string): Promise<void> {
    await this.request(`/api/hub/tickets/${ticketId}/close`, {
      method: "POST",
      body: JSON.stringify({ closure: cierre, note: nota }),
    });
  }

  async reabrir(ticketId: number): Promise<void> {
    await this.request(`/api/hub/tickets/${ticketId}/reopen`, {
      method: "POST",
      body: "{}",
    });
  }

  async setAtiende(ticketId: number, atiende: Atiende): Promise<void> {
    await this.request(`/api/hub/tickets/${ticketId}/assignee`, {
      method: "PATCH",
      body: JSON.stringify({
        assignedTo: atiende === "humano" ? "human" : "bot",
      }),
    });
  }

  async enviarMensaje(ticketId: number, texto: string): Promise<void> {
    await this.request(`/api/conversations/${ticketId}/send`, {
      method: "POST",
      body: JSON.stringify({ text: texto }),
    });
  }

  async crearDescuento(ticketId: number, prompt: string, deliveryMode: "now" | "next_message"): Promise<{ sent: boolean; message: string; warning?: string; pending?: boolean }> {
    return this.request(`/api/hub/tickets/${ticketId}/discount-offers`, {
      method: "POST", body: JSON.stringify({ prompt, deliveryMode }),
    });
  }

  async getTemplatePlan(ticketId: number): Promise<TemplatePlanPreview> {
    return (await this.request<{ plan: TemplatePlanPreview }>(`/api/hub/tickets/${ticketId}/template-plan`)).plan;
  }

  async authorizeTemplatePlan(ticketId: number): Promise<TemplatePlanPreview> {
    return (await this.request<{ plan: TemplatePlanPreview }>(`/api/hub/tickets/${ticketId}/template-plan`, { method: "POST", body: "{}" })).plan;
  }

  async agregarNota(ticketId: number, texto: string): Promise<void> {
    await this.request(`/api/hub/tickets/${ticketId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content: texto }),
    });
  }

  async marcarLeido(ticketId: number): Promise<void> {
    await this.request(`/api/hub/tickets/${ticketId}/read`, {
      method: "POST",
      body: "{}",
    });
  }

  subscribe(listener: (event: SourceEvent) => void): () => void {
    this.listeners.add(listener);
    if (!this.controller) {
      this.controller = new AbortController();
      void this.readEventStream(this.controller.signal);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.controller?.abort();
        this.controller = null;
      }
    };
  }

  private async request<T extends object = { ok: true }>(
    url: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
        ...(init.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as T & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? `Error ${response.status}`);
    }
    return payload;
  }

  private authHeaders(): Record<string, string> {
    const key = getStoredAdminKey();
    return key ? { "x-admin-key": key } : {};
  }

  private async readEventStream(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const response = await fetch("/api/hub/events", {
          headers: this.authHeaders(),
          signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`SSE ${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) this.consumeEvent(chunk);
        }
      } catch (error) {
        if (signal.aborted) return;
        this.emit({
          tipo: "toast",
          icono: "↻",
          titulo: "Reconectando datos en vivo",
          cuerpo: error instanceof Error ? error.message : undefined,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  private consumeEvent(raw: string): void {
    const type = raw.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const data = raw.match(/^data:\s*(.+)$/m)?.[1]?.trim();
    if (!type || type === "ready" || !data) return;
    const parsed = JSON.parse(data) as { conversationId?: number };
    if (type === "message" && parsed.conversationId) {
      this.emit({ tipo: "mensaje", ticketId: parsed.conversationId });
    }
    this.emit({ tipo: "sync" });
  }

  private emit(event: SourceEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

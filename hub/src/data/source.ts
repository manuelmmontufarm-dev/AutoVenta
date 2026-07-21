import type { Atiende, BotAlert, Cierre, Etapa, FeedItem, FollowUpCard, HubMetrics, Mensaje, Rol, Ticket } from "./types";

/**
 * El contrato entre la UI y los datos. Parte 1: MockSource (fixtures + simulador).
 * Parte 2: RealSource = fetch + SSE contra el Express del bot. La UI no cambia.
 */

export type SourceEvent =
  | { tipo: "sync" } // tickets o feed cambiaron → la UI refresca snapshots
  | { tipo: "mensaje"; ticketId: number }
  | { tipo: "typing"; ticketId: number; rol: Rol; activo: boolean }
  | { tipo: "toast"; icono: string; titulo: string; cuerpo?: string; ticketId?: number }
  | { tipo: "celebracion"; ticketId: number };

export interface DataSource {
  listTickets(): Promise<Ticket[]>;
  getMensajes(ticketId: number): Promise<Mensaje[]>;
  getFeed(): Promise<FeedItem[]>;
  getMetrics(days?: number): Promise<HubMetrics>;
  listFollowUps(): Promise<FollowUpCard[]>;
  listAlerts(): Promise<BotAlert[]>;
  followUpAction(id: number, action: "send" | "cancel" | "edit", preview?: string): Promise<void>;
  alertAction(id: number, action: "resolve" | "snooze" | "take"): Promise<void>;
  moverEtapa(ticketId: number, etapa: Etapa): Promise<void>;
  cerrar(ticketId: number, cierre: Cierre, nota?: string): Promise<void>;
  reabrir(ticketId: number): Promise<void>;
  setAtiende(ticketId: number, atiende: Atiende): Promise<void>;
  enviarMensaje(ticketId: number, texto: string): Promise<void>; // como vendedor
  crearDescuento(ticketId: number, input: { amount: number; reason: string; condition: string; expiresAt?: string | null }): Promise<{ sent: boolean; message: string; warning?: string }>;
  agregarNota(ticketId: number, texto: string): Promise<void>;
  marcarLeido(ticketId: number): Promise<void>;
  subscribe(listener: (ev: SourceEvent) => void): () => void;
}

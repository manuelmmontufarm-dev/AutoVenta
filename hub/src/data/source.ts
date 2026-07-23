import type { Atiende, Cierre, Etapa, FeedItem, HubMetrics, Mensaje, PhaseFlags, Rol, Ticket } from "./types";

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
  moverEtapa(ticketId: number, etapa: Etapa): Promise<void>;
  cerrar(ticketId: number, cierre: Cierre, nota?: string): Promise<void>;
  reabrir(ticketId: number): Promise<void>;
  setAtiende(ticketId: number, atiende: Atiende): Promise<void>;
  enviarMensaje(ticketId: number, texto: string): Promise<void>; // como vendedor
  agregarNota(ticketId: number, texto: string): Promise<void>;
  marcarLeido(ticketId: number): Promise<void>;
  /** Fases activas del producto (para decidir qué pantallas muestra el hub). */
  getPhases(): Promise<PhaseFlags>;
  subscribe(listener: (ev: SourceEvent) => void): () => void;
}

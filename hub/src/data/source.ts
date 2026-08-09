import type { Atiende, BotAlert, BotPower, Cierre, EchoHealth, Etapa, FeedItem, FinalStage, FollowUpCard, HubMetrics, Mensaje, PhaseFlags, Rol, TemplatePlanPreview, Ticket } from "./types";

/**
 * El contrato entre la UI y los datos. Parte 1: MockSource (fixtures + simulador).
 * Parte 2: RealSource = fetch + SSE contra el Express del bot. La UI no cambia.
 */

export type SourceEvent =
  | { tipo: "sync" } // tickets o feed cambiaron → la UI refresca snapshots
  | { tipo: "clave-invalida" } // el gate de admin rechazó la clave guardada
  | { tipo: "mensaje"; ticketId: number }
  | { tipo: "typing"; ticketId: number; rol: Rol; activo: boolean }
  | { tipo: "toast"; icono: string; titulo: string; cuerpo?: string; ticketId?: number }
  | { tipo: "celebracion"; ticketId: number };

export interface DataSource {
  listTickets(): Promise<Ticket[]>;
  /** Un ticket suelto: el listado corta en 500 y los enlaces apuntan más atrás. */
  getTicket(ticketId: number): Promise<Ticket | null>;
  getMensajes(ticketId: number): Promise<Mensaje[]>;
  /** Si las respuestas del asesor desde WhatsApp están entrando al panel. */
  getEchoHealth(): Promise<EchoHealth>;
  getFeed(): Promise<FeedItem[]>;
  getMetrics(days?: number): Promise<HubMetrics>;
  /** Quién llegó a la última columna del tablero, agrupado por día. */
  getFinalStage(): Promise<FinalStage>;
  listFollowUps(): Promise<FollowUpCard[]>;
  listAlerts(): Promise<BotAlert[]>;
  followUpAction(id: number, action: "send" | "cancel" | "edit" | "generate", preview?: string): Promise<void>;
  alertAction(id: number, action: "resolve" | "snooze" | "take"): Promise<void>;
  moverEtapa(ticketId: number, etapa: Etapa): Promise<void>;
  cerrar(ticketId: number, cierre: Cierre, nota?: string): Promise<void>;
  reabrir(ticketId: number): Promise<void>;
  setAtiende(ticketId: number, atiende: Atiende): Promise<void>;
  /** Pin "para después" del modo revisión: prioridad visible en Oportunidades. */
  marcarParaDespues(ticketId: number, enabled: boolean): Promise<void>;
  enviarMensaje(ticketId: number, texto: string): Promise<void>; // como vendedor
  crearDescuento(ticketId: number, prompt: string, deliveryMode: "now" | "next_message"): Promise<{ sent: boolean; message: string; warning?: string; pending?: boolean }>;
  getTemplatePlan(ticketId: number): Promise<TemplatePlanPreview>;
  authorizeTemplatePlan(ticketId: number): Promise<TemplatePlanPreview>;
  agregarNota(ticketId: number, texto: string): Promise<void>;
  marcarLeido(ticketId: number): Promise<void>;
  /** Fases activas del producto (para decidir qué pantallas muestra el hub). */
  getPhases(): Promise<PhaseFlags>;
  /** Interruptor global: si el bot está contestando o está apagado. */
  getBotPower(): Promise<BotPower>;
  setBotPower(activo: boolean, motivo?: string): Promise<BotPower>;
  subscribe(listener: (ev: SourceEvent) => void): () => void;
}

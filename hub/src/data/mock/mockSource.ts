import type { DataSource, SourceEvent } from "../source";
import {
  CIERRE_META,
  type Atiende,
  type Cierre,
  type Cotizacion,
  type Etapa,
  type FeedItem,
  type LocalAsignado,
  type Mensaje,
  type Rol,
  type Ticket,
  type TipoMensaje,
} from "../types";
import { FEED_SEED, MENSAJES_SEED, TICKETS_SEED } from "./fixtures";
import { money } from "../../lib/format";

/**
 * Fuente de datos en memoria. Implementa el mismo contrato que tendrá el
 * Express del bot en la Parte 2, y expone mutadores extra para el simulador.
 */
export class MockSource implements DataSource {
  private tickets = new Map<number, Ticket>();
  private mensajes = new Map<number, Mensaje[]>();
  private feed: FeedItem[] = [];
  private listeners = new Set<(ev: SourceEvent) => void>();
  private nextTicketId = 100;
  private nextMsgId = 10_000;
  private nextFeedId = 100;

  constructor() {
    for (const t of TICKETS_SEED) this.tickets.set(t.id, { ...t, notas: [...t.notas] });
    for (const m of MENSAJES_SEED) {
      const lista = this.mensajes.get(m.ticketId) ?? [];
      lista.push(m);
      this.mensajes.set(m.ticketId, lista);
    }
    this.feed = [...FEED_SEED].reverse(); // más reciente primero
  }

  /* ── DataSource ── */

  async listTickets(): Promise<Ticket[]> {
    return [...this.tickets.values()].sort(
      (a, b) => new Date(b.ultimaActividad).getTime() - new Date(a.ultimaActividad).getTime(),
    );
  }

  async getMensajes(ticketId: number): Promise<Mensaje[]> {
    return [...(this.mensajes.get(ticketId) ?? [])];
  }

  async getFeed(): Promise<FeedItem[]> {
    return [...this.feed];
  }

  async moverEtapa(ticketId: number, etapa: Etapa): Promise<void> {
    const t = this.tickets.get(ticketId);
    if (!t || t.estado === "cerrado") return;
    t.etapa = etapa;
    t.ultimaActividad = new Date().toISOString();
    if (etapa === "por_visitar") {
      this.pushFeed("🔥", `${this.nombre(t)} confirmó visita al local`, ticketId);
    }
    this.emit({ tipo: "sync" });
  }

  async cerrar(ticketId: number, cierre: Cierre, nota?: string): Promise<void> {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    t.estado = "cerrado";
    t.cierre = cierre;
    t.cerradoEn = new Date().toISOString();
    t.ultimaActividad = t.cerradoEn;
    t.sinLeer = 0;
    if (nota) t.notas.push(nota);
    const monto = t.cotizacion ? ` — ${money(t.cotizacion.total)}` : "";
    this.pushFeed(
      cierre === "ganado" ? "🏁" : CIERRE_META[cierre].emoji,
      `Ticket ${cierre === "ganado" ? "ganado" : CIERRE_META[cierre].nombre.toLowerCase()}: ${this.nombre(t)}${monto}`,
      ticketId,
    );
    this.emit({ tipo: "sync" });
    if (cierre === "ganado") {
      this.emit({ tipo: "celebracion", ticketId });
      this.emit({
        tipo: "toast",
        icono: "🏁",
        titulo: `Venta cerrada: ${this.nombre(t)}`,
        cuerpo: t.cotizacion ? `${money(t.cotizacion.total)} · ${t.medida ?? ""}` : undefined,
        ticketId,
      });
    }
  }

  async reabrir(ticketId: number): Promise<void> {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    t.estado = "abierto";
    t.cierre = undefined;
    t.cerradoEn = undefined;
    t.esRecurrente = true;
    t.ultimaActividad = new Date().toISOString();
    this.pushFeed("↺", `Ticket reabierto: ${this.nombre(t)}`, ticketId);
    this.emit({ tipo: "sync" });
  }

  async setAtiende(ticketId: number, atiende: Atiende): Promise<void> {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    t.atiende = atiende;
    this.emit({ tipo: "sync" });
  }

  async enviarMensaje(ticketId: number, texto: string): Promise<void> {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    t.atiende = "humano"; // escribir toma la conversación (patrón coexistence)
    this.pushMensaje(ticketId, "vendedor", "texto", texto);
  }

  async agregarNota(ticketId: number, texto: string): Promise<void> {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    t.notas.push(texto);
    this.emit({ tipo: "sync" });
  }

  async marcarLeido(ticketId: number): Promise<void> {
    const t = this.tickets.get(ticketId);
    if (!t || t.sinLeer === 0) return;
    t.sinLeer = 0;
    this.emit({ tipo: "sync" });
  }

  subscribe(listener: (ev: SourceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ── Mutadores para el simulador (no forman parte del contrato) ── */

  crearTicket(datos: {
    nombre: string;
    telefono: string;
    vehiculo?: string;
    esRecurrente?: boolean;
  }): Ticket {
    const ahora = new Date().toISOString();
    const t: Ticket = {
      id: this.nextTicketId++,
      telefono: datos.telefono,
      nombre: datos.nombre,
      estado: "abierto",
      etapa: "nuevo",
      atiende: "bot",
      vehiculo: datos.vehiculo,
      esRecurrente: datos.esRecurrente ?? false,
      sinLeer: 0,
      notas: [],
      creadoEn: ahora,
      ultimaActividad: ahora,
      ultimoMensaje: "",
    };
    this.tickets.set(t.id, t);
    this.mensajes.set(t.id, []);
    this.pushFeed("👋", `Nuevo cliente: ${datos.nombre}`, t.id);
    this.emit({ tipo: "sync" });
    return t;
  }

  pushMensaje(ticketId: number, rol: Rol, tipo: TipoMensaje, contenido: string): void {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    const lista = this.mensajes.get(ticketId) ?? [];
    lista.push({
      id: this.nextMsgId++,
      ticketId,
      rol,
      tipo,
      contenido,
      hora: new Date().toISOString(),
    });
    this.mensajes.set(ticketId, lista);
    t.ultimoMensaje = tipo === "pdf" ? "📄 Cotización PDF" : contenido;
    t.ultimaActividad = new Date().toISOString();
    if (rol === "cliente") t.sinLeer += 1;
    this.emit({ tipo: "mensaje", ticketId });
    this.emit({ tipo: "sync" });
  }

  setTyping(ticketId: number, rol: Rol, activo: boolean): void {
    this.emit({ tipo: "typing", ticketId, rol, activo });
  }

  patch(
    ticketId: number,
    datos: Partial<Pick<Ticket, "medida" | "vehiculo">> & {
      cotizacion?: Cotizacion;
      localAsignado?: LocalAsignado;
    },
  ): void {
    const t = this.tickets.get(ticketId);
    if (!t) return;
    Object.assign(t, datos);
    if (datos.cotizacion) {
      this.pushFeed("📄", `Cotización enviada a ${this.nombre(t)} — ${money(datos.cotizacion.total)}`, ticketId);
    }
    this.emit({ tipo: "sync" });
  }

  toast(icono: string, titulo: string, cuerpo?: string, ticketId?: number): void {
    this.emit({ tipo: "toast", icono, titulo, cuerpo, ticketId });
  }

  /* ── Internos ── */

  private nombre(t: Ticket): string {
    return t.nombre ?? t.telefono;
  }

  private pushFeed(icono: string, texto: string, ticketId?: number): void {
    this.feed.unshift({
      id: this.nextFeedId++,
      icono,
      texto,
      hora: new Date().toISOString(),
      ticketId,
    });
    this.feed = this.feed.slice(0, 40);
  }

  private emit(ev: SourceEvent): void {
    for (const fn of this.listeners) fn(ev);
  }
}

import { create } from "zustand";
import type { Atiende, BotAlert, Cierre, Etapa, FeedItem, FollowUpCard, HubMetrics, Mensaje, Rol, TemplatePlanPreview, Ticket } from "./data/types";
import { MockSource } from "./data/mock/mockSource";
import { Simulator } from "./data/mock/simulator";
import { RealSource } from "./data/realSource";
import type { DataSource } from "./data/source";
import { updateFavicon } from "./lib/favicon";
import { pingNotificacion, pingVenta, sonidoArranque, sonidoPitStop } from "./lib/sound";

const dataMode: "demo" | "real" = window.location.pathname.includes("/demo")
  ? "demo"
  : "real";
const mockSource = new MockSource();
const source: DataSource = dataMode === "demo" ? mockSource : new RealSource();
const simulator = dataMode === "demo" ? new Simulator(mockSource) : null;

export interface Toast {
  id: number;
  icono: string;
  titulo: string;
  cuerpo?: string;
  ticketId?: number;
}

interface HubState {
  cargando: boolean;
  tickets: Ticket[];
  mensajes: Record<number, Mensaje[]>;
  typing: Record<number, Rol | null>;
  feed: FeedItem[];
  metrics: HubMetrics | null;
  followUps: FollowUpCard[];
  alerts: BotAlert[];
  toasts: Toast[];
  demo: boolean;
  dataMode: "demo" | "real";
  celebrando: boolean;

  init(): Promise<void>;
  abrirTicket(id: number): Promise<void>;
  moverEtapa(id: number, etapa: Etapa): Promise<void>;
  cerrar(id: number, cierre: Cierre, nota?: string): Promise<void>;
  reabrir(id: number): Promise<void>;
  setAtiende(id: number, atiende: Atiende): Promise<void>;
  enviarMensaje(id: number, texto: string): Promise<void>;
  crearDescuento(id: number, prompt: string): Promise<{ sent: boolean; message: string; warning?: string; pending?: boolean }>;
  getTemplatePlan(id: number): Promise<TemplatePlanPreview>;
  authorizeTemplatePlan(id: number): Promise<TemplatePlanPreview>;
  agregarNota(id: number, texto: string): Promise<void>;
  followUpAction(id: number, action: "send" | "cancel" | "edit", preview?: string): Promise<void>;
  alertAction(id: number, action: "resolve" | "snooze" | "take"): Promise<void>;
  toggleDemo(): void;
  quitarToast(id: number): void;
}

let toastId = 1;
let iniciado = false;

export const useHub = create<HubState>((set, get) => {
  async function refrescar(): Promise<void> {
    const [tickets, feed, metrics, followUps, alerts] = await Promise.all([
      source.listTickets(),
      source.getFeed(),
      source.getMetrics(),
      source.listFollowUps(),
      source.listAlerts(),
    ]);
    set({ tickets, feed, metrics, followUps, alerts });
    updateFavicon(tickets.filter((t) => t.estado === "abierto").length);
  }

  async function refrescarMensajes(ticketId: number): Promise<void> {
    const msgs = await source.getMensajes(ticketId);
    set((s) => ({ mensajes: { ...s.mensajes, [ticketId]: msgs } }));
  }

  source.subscribe((ev) => {
    switch (ev.tipo) {
      case "sync":
        void refrescar();
        break;
      case "mensaje":
        void refrescarMensajes(ev.ticketId);
        break;
      case "typing":
        set((s) => ({
          typing: { ...s.typing, [ev.ticketId]: ev.activo ? ev.rol : null },
        }));
        break;
      case "toast": {
        const toast: Toast = {
          id: toastId++,
          icono: ev.icono,
          titulo: ev.titulo,
          cuerpo: ev.cuerpo,
          ticketId: ev.ticketId,
        };
        set((s) => ({ toasts: [...s.toasts.slice(-2), toast] }));
        pingNotificacion();
        break;
      }
      case "celebracion":
        set({ celebrando: true });
        pingVenta();
        setTimeout(() => set({ celebrando: false }), 3000);
        break;
    }
  });

  return {
    cargando: true,
    tickets: [],
    mensajes: {},
    typing: {},
    feed: [],
    metrics: null,
    followUps: [],
    alerts: [],
    toasts: [],
    demo: false,
    dataMode,
    celebrando: false,

    async init() {
      if (iniciado) return;
      iniciado = true;
      try {
        // Mínimo de skeleton para que la carga se sienta intencional, no rota.
        const [datos] = await Promise.all([
          Promise.all([source.listTickets(), source.getFeed(), source.getMetrics(), source.listFollowUps(), source.listAlerts()]),
          new Promise((r) => setTimeout(r, 650)),
        ]);
        set({ tickets: datos[0], feed: datos[1], metrics: datos[2], followUps: datos[3], alerts: datos[4], cargando: false });
        updateFavicon(datos[0].filter((t) => t.estado === "abierto").length);
      } catch (error) {
        set((state) => ({
          cargando: false,
          toasts: [
            ...state.toasts.slice(-2),
            {
              id: toastId++,
              icono: "🔐",
              titulo: "Configura el acceso",
              cuerpo:
                error instanceof Error
                  ? error.message
                  : "Abre DT → Conexión para ingresar la clave de staging.",
            },
          ],
        }));
      }
    },

    async abrirTicket(id) {
      await Promise.all([refrescarMensajes(id), source.marcarLeido(id)]);
    },

    moverEtapa: (id, etapa) => source.moverEtapa(id, etapa),
    cerrar: (id, cierre, nota) => source.cerrar(id, cierre, nota),
    reabrir: (id) => source.reabrir(id),
    setAtiende: (id, atiende) => source.setAtiende(id, atiende),
    enviarMensaje: (id, texto) => source.enviarMensaje(id, texto),
    async crearDescuento(id, prompt) {
      const result = await source.crearDescuento(id, prompt);
      await refrescar();
      await refrescarMensajes(id);
      return result;
    },
    getTemplatePlan: (id) => source.getTemplatePlan(id),
    async authorizeTemplatePlan(id) {
      const plan = await source.authorizeTemplatePlan(id);
      await refrescar();
      return plan;
    },
    agregarNota: (id, texto) => source.agregarNota(id, texto),
    async followUpAction(id, action, preview) {
      await source.followUpAction(id, action, preview);
      await refrescar();
    },
    async alertAction(id, action) {
      await source.alertAction(id, action);
      await refrescar();
    },

    toggleDemo() {
      const demo = !get().demo;
      if (!simulator) return;
      set({ demo });
      if (demo) {
        sonidoArranque();
        simulator.start();
        set((s) => ({
          toasts: [
            ...s.toasts,
            { id: toastId++, icono: "▶️", titulo: "Modo demo activo", cuerpo: "Clientes simulados entrando en vivo…" },
          ],
        }));
      } else {
        sonidoPitStop();
        simulator.stop();
      }
    },

    quitarToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },
  };
});

// Arranque eager: sobrevive los reload parciales de HMR en dev y no depende
// del ciclo de vida de React para tener datos.
void useHub.getState().init();

/** Hook: timestamp que "late" cada 30 s para refrescar los tiempos relativos. */
import { useEffect, useState } from "react";
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

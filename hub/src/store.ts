import { create } from "zustand";
import type { Atiende, BotAlert, BotPower, Cierre, Etapa, FeedItem, FollowUpCard, HubMetrics, Mensaje, PhaseFlags, Rol, TemplatePlanPreview, Ticket } from "./data/types";
import { MockSource } from "./data/mock/mockSource";
import { Simulator } from "./data/mock/simulator";
import { AdminKeyError, RealSource } from "./data/realSource";
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

/**
 * Estado del acceso al backend. Sin esto el hub se veía "vacío pero normal"
 * cuando la clave estaba mal: mismo aspecto que un negocio sin tickets.
 */
export type EstadoConexion =
  | "verificando"
  | "conectada"
  | "clave-invalida"
  | "sin-conexion";

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
  /** Fases activas: deciden qué pantallas del hub se muestran. */
  phases: PhaseFlags;
  /**
   * Interruptor global. Vive en el store y no dentro de Ajustes para que el
   * estado se pinte en todas las pantallas: un bot apagado del que nadie se
   * acuerda es una venta perdida en silencio, y el aviso tiene que seguirte.
   */
  power: BotPower;
  /** ¿El hub está leyendo datos de verdad, o la clave/servidor falla? */
  conexion: EstadoConexion;

  init(): Promise<void>;
  abrirTicket(id: number): Promise<void>;
  moverEtapa(id: number, etapa: Etapa): Promise<void>;
  cerrar(id: number, cierre: Cierre, nota?: string): Promise<void>;
  reabrir(id: number): Promise<void>;
  setAtiende(id: number, atiende: Atiende): Promise<void>;
  enviarMensaje(id: number, texto: string): Promise<void>;
  crearDescuento(id: number, prompt: string, deliveryMode: "now" | "next_message"): Promise<{ sent: boolean; message: string; warning?: string; pending?: boolean }>;
  getTemplatePlan(id: number): Promise<TemplatePlanPreview>;
  authorizeTemplatePlan(id: number): Promise<TemplatePlanPreview>;
  agregarNota(id: number, texto: string): Promise<void>;
  followUpAction(id: number, action: "send" | "cancel" | "edit" | "generate", preview?: string): Promise<void>;
  alertAction(id: number, action: "resolve" | "snooze" | "take"): Promise<void>;
  toggleDemo(): void;
  quitarToast(id: number): void;
  cambiarPower(activo: boolean, motivo?: string): Promise<void>;
}

let toastId = 1;
let iniciado = false;

/** Un fallo de lectura es "clave mala" o "servidor caído" — nunca silencio. */
function clasificarFallo(error: unknown): EstadoConexion {
  return error instanceof AdminKeyError ? "clave-invalida" : "sin-conexion";
}

export const useHub = create<HubState>((set, get) => {
  async function refrescar(): Promise<void> {
    try {
      const [tickets, feed, metrics, followUps, alerts, phases, power] = await Promise.all([
        source.listTickets(),
        source.getFeed(),
        source.getMetrics(),
        source.listFollowUps(),
        source.listAlerts(),
        source.getPhases(),
        source.getBotPower(),
      ]);
      set({ tickets, feed, metrics, followUps, alerts, phases, power, conexion: "conectada" });
      updateFavicon(tickets.filter((t) => t.estado === "abierto").length);
    } catch (error) {
      set({ conexion: clasificarFallo(error) });
    }
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
      case "clave-invalida":
        set({ conexion: "clave-invalida", cargando: false });
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
    // Conservador hasta cargar: no revela pantallas que deban estar ocultas.
    phases: { fase2: false, fase3: false, fase4: false },
    // Se asume encendido hasta saberlo: durante el medio segundo de carga es
    // preferible no gritar "apagado" en un bot que sí está trabajando.
    power: { activo: true, apagadoAt: null, motivo: "" },
    conexion: "verificando",

    async init() {
      if (iniciado) return;
      iniciado = true;
      try {
        // Mínimo de skeleton para que la carga se sienta intencional, no rota.
        const [datos] = await Promise.all([
          Promise.all([source.listTickets(), source.getFeed(), source.getMetrics(), source.listFollowUps(), source.listAlerts(), source.getPhases(), source.getBotPower()]),
          new Promise((r) => setTimeout(r, 650)),
        ]);
        set({ tickets: datos[0], feed: datos[1], metrics: datos[2], followUps: datos[3], alerts: datos[4], phases: datos[5], power: datos[6], cargando: false, conexion: "conectada" });
        updateFavicon(datos[0].filter((t) => t.estado === "abierto").length);
      } catch (error) {
        // Sin toast: el gate de conexión ocupa la pantalla y explica qué pasó.
        set({ cargando: false, conexion: clasificarFallo(error) });
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
    async crearDescuento(id, prompt, deliveryMode) {
      const result = await source.crearDescuento(id, prompt, deliveryMode);
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

    /**
     * El estado se pinta desde la respuesta del servidor, no desde lo que se
     * pidió: si el PUT falla, la UI no puede quedarse diciendo "apagado"
     * mientras el bot le sigue escribiendo a los clientes. El error sube a
     * quien llame para mostrarlo junto al botón.
     */
    async cambiarPower(activo, motivo = "") {
      set({ power: await source.setBotPower(activo, motivo) });
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

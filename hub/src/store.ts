import { create } from "zustand";
import type { Atiende, Cierre, Etapa, FeedItem, Mensaje, Rol, Ticket } from "./data/types";
import { MockSource } from "./data/mock/mockSource";
import { Simulator } from "./data/mock/simulator";
import { updateFavicon } from "./lib/favicon";
import { pingNotificacion, pingVenta } from "./lib/sound";

/* Parte 2: reemplazar MockSource por RealSource (fetch + SSE) — nada más cambia. */
const source = new MockSource();
const simulator = new Simulator(source);

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
  toasts: Toast[];
  demo: boolean;
  celebrando: boolean;

  init(): Promise<void>;
  abrirTicket(id: number): Promise<void>;
  moverEtapa(id: number, etapa: Etapa): Promise<void>;
  cerrar(id: number, cierre: Cierre, nota?: string): Promise<void>;
  reabrir(id: number): Promise<void>;
  setAtiende(id: number, atiende: Atiende): Promise<void>;
  enviarMensaje(id: number, texto: string): Promise<void>;
  agregarNota(id: number, texto: string): Promise<void>;
  toggleDemo(): void;
  quitarToast(id: number): void;
}

let toastId = 1;
let iniciado = false;

export const useHub = create<HubState>((set, get) => {
  async function refrescar(): Promise<void> {
    const [tickets, feed] = await Promise.all([source.listTickets(), source.getFeed()]);
    set({ tickets, feed });
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
        if (get().demo) pingNotificacion();
        break;
      }
      case "celebracion":
        set({ celebrando: true });
        if (get().demo) pingVenta();
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
    toasts: [],
    demo: false,
    celebrando: false,

    async init() {
      if (iniciado) return;
      iniciado = true;
      // Mínimo de skeleton para que la carga se sienta intencional, no rota.
      const [datos] = await Promise.all([
        Promise.all([source.listTickets(), source.getFeed()]),
        new Promise((r) => setTimeout(r, 650)),
      ]);
      set({ tickets: datos[0], feed: datos[1], cargando: false });
      updateFavicon(datos[0].filter((t) => t.estado === "abierto").length);
    },

    async abrirTicket(id) {
      await Promise.all([refrescarMensajes(id), source.marcarLeido(id)]);
    },

    moverEtapa: (id, etapa) => source.moverEtapa(id, etapa),
    cerrar: (id, cierre, nota) => source.cerrar(id, cierre, nota),
    reabrir: (id) => source.reabrir(id),
    setAtiende: (id, atiende) => source.setAtiende(id, atiende),
    enviarMensaje: (id, texto) => source.enviarMensaje(id, texto),
    agregarNota: (id, texto) => source.agregarNota(id, texto),

    toggleDemo() {
      const demo = !get().demo;
      set({ demo });
      if (demo) {
        simulator.start();
        set((s) => ({
          toasts: [
            ...s.toasts,
            { id: toastId++, icono: "▶️", titulo: "Modo demo activo", cuerpo: "Clientes simulados entrando en vivo…" },
          ],
        }));
      } else {
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

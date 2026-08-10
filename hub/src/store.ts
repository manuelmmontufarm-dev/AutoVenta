import { create } from "zustand";
import type { Atiende, BotAlert, BotPower, Cierre, EchoHealth, Etapa, FeedItem, FinalStage, FollowUpCard, HubMetrics, Mensaje, PhaseFlags, Rol, TemplatePlanPreview, Ticket } from "./data/types";
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
  /** Recarga tickets, métricas y seguimientos desde el servidor. */
  refrescar: () => Promise<void>;
  cargando: boolean;
  tickets: Ticket[];
  /**
   * Tickets traídos de a uno. El listado corta en 500 y los enlaces del feed y
   * del panel "Llegaron al final" apuntan más atrás: sin esto, abrir uno de
   * esos mostraba "Ticket no encontrado" con la conversación intacta en la base.
   * Van aparte para no ensuciar el kanban ni el inbox con tickets sueltos.
   */
  ticketsSueltos: Record<number, Ticket>;
  mensajes: Record<number, Mensaje[]>;
  typing: Record<number, Rol | null>;
  feed: FeedItem[];
  metrics: HubMetrics | null;
  /** Quién llegó al final del tablero, por día. null mientras no ha cargado. */
  finalStage: FinalStage | null;
  /** ¿Entran al panel las respuestas que un asesor escribe desde su WhatsApp? */
  echoHealth: EchoHealth | null;
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
  marcarParaDespues(id: number, enabled: boolean): Promise<void>;
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

/**
 * Las fases se recuerdan entre sesiones.
 *
 * Deciden qué pestañas existen. Si `/api/phases` tarda o se pierde —Railway
 * degradado, 9-ago— el panel arrancaba mostrando 3 pestañas y sin
 * Oportunidades: media aplicación desaparecida, sin aviso. Arrancar con lo
 * último que se supo y corregir cuando el servidor conteste evita ese hueco;
 * si el negocio de verdad cambió de fase, la respuesta manda y se ajusta solo.
 */
const PHASES_KEY = "autoventa_phases";
const PHASES_CONSERVADORAS: PhaseFlags = { fase2: false, fase3: false, fase4: false };

function phasesRecordadas(): PhaseFlags {
  try {
    const crudo = window.localStorage.getItem(PHASES_KEY);
    if (!crudo) return PHASES_CONSERVADORAS;
    const v = JSON.parse(crudo) as Partial<PhaseFlags>;
    return {
      fase2: v.fase2 === true,
      fase3: v.fase3 === true,
      fase4: v.fase4 === true,
    };
  } catch {
    return PHASES_CONSERVADORAS;
  }
}

function recordarPhases(phases: PhaseFlags): void {
  try {
    window.localStorage.setItem(PHASES_KEY, JSON.stringify(phases));
  } catch {
    // Modo privado o storage lleno: se sigue sin memoria, no es fatal.
  }
}

/** Un fallo de lectura es "clave mala" o "servidor caído" — nunca silencio. */
function clasificarFallo(error: unknown): EstadoConexion {
  return error instanceof AdminKeyError ? "clave-invalida" : "sin-conexion";
}

export const useHub = create<HubState>((set, get) => {
  /**
   * Recarga todo, pero cada cosa por su cuenta.
   *
   * Antes era un `Promise.all` de ocho: si UNA fallaba, se perdían las ocho y
   * el panel se declaraba sin conexión. Con Railway degradado (9-ago) eso
   * significaba pantallas en blanco y pestañas que desaparecían aunque el
   * servidor estuviera contestando el 70 % de las veces. Ahora lo que llega se
   * pinta, y lo que no, se queda como estaba hasta el próximo intento.
   */
  async function refrescar(): Promise<void> {
    // Las tres salen a la vez; se esperan por separado a propósito.
    const pTickets = source.listTickets();
    const pPhases = source.getPhases();
    const pPower = source.getBotPower();

    // Los tickets SON la pantalla: en cuanto llegan se pinta y se acaba el
    // skeleton, sin esperar a `phases` (que decide pestañas, no contenido).
    // Antes se esperaba a las tres y una petición perdida dejaba el panel gris
    // veinte segundos con los datos ya en memoria.
    const rTickets = await pTickets.then(
      (value) => ({ ok: true as const, value }),
      (reason: unknown) => ({ ok: false as const, reason }),
    );
    if (rTickets.ok) {
      set({ tickets: rTickets.value, cargando: false, conexion: "conectada" });
      updateFavicon(rTickets.value.filter((t) => t.estado === "abierto").length);
    }

    const [rPhases, rPower] = await Promise.allSettled([pPhases, pPower]);
    const parcial: Partial<HubState> = {};
    if (rPhases.status === "fulfilled") {
      parcial.phases = rPhases.value;
      recordarPhases(rPhases.value);
    }
    if (rPower.status === "fulfilled") parcial.power = rPower.value;

    const fallos = [
      rTickets.ok ? null : rTickets.reason,
      rPhases.status === "rejected" ? rPhases.reason : null,
      rPower.status === "rejected" ? rPower.reason : null,
    ];
    // Solo se declara caída si NADA crítico llegó: media respuesta es mejor
    // que el portón de "sin conexión" tapando un panel que sí funciona.
    const todasFallaron = fallos.every((f) => f !== null);
    const claveMala = fallos.some((f) => f !== null && clasificarFallo(f) === "clave-invalida");
    parcial.conexion = claveMala ? "clave-invalida" : todasFallaron ? "sin-conexion" : "conectada";
    parcial.cargando = false;
    set(parcial);
    if (claveMala || todasFallaron) return;

    // Lo secundario llena la pantalla cuando pueda; que falle no rompe nada.
    const extras = await Promise.allSettled([
      source.getFeed(),
      source.getMetrics(),
      source.getFinalStage(),
      source.listFollowUps(),
      source.listAlerts(),
    ]);
    const resto: Partial<HubState> = {};
    if (extras[0].status === "fulfilled") resto.feed = extras[0].value;
    if (extras[1].status === "fulfilled") resto.metrics = extras[1].value;
    if (extras[2].status === "fulfilled") resto.finalStage = extras[2].value;
    if (extras[3].status === "fulfilled") resto.followUps = extras[3].value;
    if (extras[4].status === "fulfilled") resto.alerts = extras[4].value;
    set(resto);
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
    ticketsSueltos: {},
    mensajes: {},
    typing: {},
    feed: [],
    metrics: null,
    finalStage: null,
    echoHealth: null,
    followUps: [],
    alerts: [],
    toasts: [],
    demo: false,
    dataMode,
    celebrando: false,
    // Lo último que se supo (o nada, en el primer arranque): ver [[phasesRecordadas]].
    phases: phasesRecordadas(),
    // Se asume encendido hasta saberlo: durante el medio segundo de carga es
    // preferible no gritar "apagado" en un bot que sí está trabajando.
    power: { activo: true, apagadoAt: null, motivo: "" },
    conexion: "verificando",

    /** Recarga tickets y métricas. La usa el Pipeline tras poner el tablero al día. */
    refrescar,

    /**
     * Arranque. `refrescar` ya trae lo crítico primero y tolera caídas
     * parciales, así que aquí solo se acompaña con el mínimo de skeleton para
     * que la carga se sienta intencional y no rota.
     */
    async init() {
      if (iniciado) return;
      iniciado = true;
      await Promise.all([refrescar(), new Promise((r) => setTimeout(r, 650))]);
      set({ cargando: false });
    },

    async abrirTicket(id) {
      await Promise.all([
        refrescarMensajes(id),
        source.marcarLeido(id),
        // Ticket viejo (fuera del lote de 500): se trae solo, y su ficha se
        // pinta igual que la de cualquier otro.
        get().tickets.some((t) => t.id === id) || get().ticketsSueltos[id]
          ? Promise.resolve()
          : source.getTicket(id).then((ticket) => {
              if (ticket) set((s) => ({ ticketsSueltos: { ...s.ticketsSueltos, [id]: ticket } }));
            }),
        // Se pide una vez por sesión: explica en la conversación por qué puede
        // no haber mensajes nuestros.
        get().echoHealth
          ? Promise.resolve()
          : source.getEchoHealth().then((echoHealth) => set({ echoHealth })),
      ]).catch(() => undefined);
    },

    moverEtapa: (id, etapa) => source.moverEtapa(id, etapa),
    cerrar: (id, cierre, nota) => source.cerrar(id, cierre, nota),
    reabrir: (id) => source.reabrir(id),
    setAtiende: (id, atiende) => source.setAtiende(id, atiende),
    async marcarParaDespues(id, enabled) {
      await source.marcarParaDespues(id, enabled);
      await refrescar();
    },
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

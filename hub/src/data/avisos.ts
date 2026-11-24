import { create } from "zustand";
import { authHeaders } from "./realSource";

/*
 * Avisos en la app del teléfono (22-nov-2026): el historial por día y la
 * activación de las notificaciones. El reparto (qué va por WhatsApp y qué por
 * la app) lo decide el servidor: `app/src/services/avisosEnLaApp.ts`.
 */

export interface Aviso {
  id: number;
  evento: string;
  titulo: string;
  mensaje: string;
  canal: "whatsapp" | "app";
  estado: string;
  conversationId: number | null;
  cliente: string | null;
  cuando: string;
}

export interface ConfigPush {
  publicKey: string;
  miTelefono: string | null;
  asesores: { nombre: string; telefono: string }[];
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/hub/${ruta}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const cuerpo = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || cuerpo.ok === false) throw new Error(cuerpo.error || `Error ${r.status}`);
  return cuerpo;
}

const VISTO = "autoventa.avisos.visto";
const leerVisto = (): number => {
  try { return Number(window.localStorage.getItem(VISTO) ?? 0) || 0; } catch { return 0; }
};

interface EstadoAvisos {
  avisos: Aviso[];
  soloMios: boolean;
  cargado: boolean;
  /** El id más alto que ya se vio: lo de arriba es «nuevo» y enciende el punto de la campana. */
  visto: number;
  cargar(): Promise<void>;
  marcarVistos(): void;
}

export const useAvisos = create<EstadoAvisos>((set, get) => ({
  avisos: [],
  soloMios: false,
  cargado: false,
  visto: leerVisto(),
  async cargar() {
    try {
      const r = await pedir<{ avisos: Aviso[]; soloMios: boolean }>("avisos");
      set({ avisos: r.avisos, soloMios: r.soloMios, cargado: true });
    } catch {
      set({ cargado: true });
    }
  },
  marcarVistos() {
    const tope = get().avisos.reduce((m, a) => Math.max(m, a.id), get().visto);
    try { window.localStorage.setItem(VISTO, String(tope)); } catch { /* sin almacenamiento */ }
    set({ visto: tope });
  },
}));

export const avisosNuevos = (s: Pick<EstadoAvisos, "avisos" | "visto">): number =>
  s.avisos.filter((a) => a.id > s.visto).length;

// ── Activar las notificaciones ───────────────────────────────────────────────

export type EstadoPush =
  | "no-soportado"   // el navegador no puede (iPhone sin instalar la app, navegador viejo)
  | "bloqueado"      // el usuario dijo que no; se cambia en los ajustes del teléfono
  | "apagado"        // puede, pero todavía no las activó
  | "activo";

/** ¿El panel corre instalado en la pantalla de inicio? En iPhone es requisito. */
export function instalada(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const esIos = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent);

async function registro(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("sw.js");
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  if (Notification.permission !== "granted") return "apagado";
  try {
    const sub = await (await registro()).pushManager.getSubscription();
    return sub ? "activo" : "apagado";
  } catch {
    return "apagado";
  }
}

export const configPush = (): Promise<ConfigPush> => pedir<ConfigPush>("push/config");

function claveABytes(base64: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

/**
 * Pide el permiso (tiene que venir de un toque del usuario), suscribe este
 * teléfono y le dice al servidor qué asesor es. Desde ahí, sus avisos «de
 * enterarse» dejan de salir por WhatsApp y llegan por la app.
 */
export async function activarPush(telefono: string | null): Promise<void> {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("El teléfono no dio permiso para las notificaciones.");
  const { publicKey } = await configPush();
  const reg = await registro();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(publicKey) as BufferSource }));
  await pedir("push/suscribir", { method: "POST", body: JSON.stringify({ suscripcion: sub.toJSON(), telefono }) });
}

/** Apaga las notificaciones de este teléfono: sus avisos vuelven a salir por WhatsApp. */
export async function desactivarPush(): Promise<void> {
  const sub = await (await registro()).pushManager.getSubscription();
  if (!sub) return;
  await pedir("push/desuscribir", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}

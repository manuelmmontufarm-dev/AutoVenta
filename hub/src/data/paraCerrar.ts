import { create } from "zustand";
import { authHeaders } from "./realSource";
import type { AccionParaCerrar, ParaCerrar } from "./types";

/**
 * Datos de la pestaña Para cerrar. Una sola copia para el rail (el número de
 * cuántos faltan hoy) y la pantalla; se recarga con cada «sync» del hub.
 */
interface ParaCerrarState {
  datos: ParaCerrar | null;
  error: string | null;
  cargar: () => Promise<void>;
  decidir: (ticketId: number, accion: AccionParaCerrar) => Promise<void>;
}

async function pedir<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...authHeaders() } });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error || `Error HTTP ${r.status}`);
  return body;
}

let enCurso: Promise<void> | null = null;

export const useParaCerrar = create<ParaCerrarState>((set, get) => ({
  datos: null,
  error: null,
  cargar: () => {
    // Varios «sync» seguidos no disparan varias consultas.
    enCurso ??= pedir<{ paraCerrar: ParaCerrar }>("/api/hub/para-cerrar")
      .then((r) => set({ datos: r.paraCerrar, error: null }))
      .catch((e: Error) => set({ error: e.message }))
      .finally(() => { enCurso = null; });
    return enCurso;
  },
  decidir: async (ticketId, accion) => {
    await pedir(`/api/hub/tickets/${ticketId}/para-cerrar`, { method: "POST", body: JSON.stringify(accion) });
    await get().cargar();
  },
}));

/** Cuántos le faltan hoy al equipo para llegar al tope (lo que pinta el rail). */
export function faltanHoy(d: ParaCerrar | null): number | undefined {
  if (!d) return undefined;
  return Math.min(Math.max(0, d.tope - d.contactadosHoy), d.paraCerrar.length);
}

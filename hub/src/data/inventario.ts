/**
 * EL INVENTARIO DE HOY (Competimotor, 18-nov-2026).
 *
 * Los negocios sin API de inventario (Competimotor: Fénix en un servidor local)
 * suben cada día el Excel que descargan. Este estado lo comparten la pantalla
 * «Inventario», la entrada del menú (que solo existe si `porArchivo`) y el
 * aviso de arriba cuando el inventario tiene más de un día. Depot (Contífico)
 * recibe `porArchivo: false` y no ve nada de esto.
 */
import { create } from "zustand";
import { authHeaders } from "./realSource";

export interface EstadoInventario {
  nombreArchivo: string;
  subidoEn: string;
  fechaReporte: string | null;
  hoja: string | null;
  llantas: number;
  aros: number;
  unidades: number;
  descartadas: { fila: number; motivo: string }[];
  descartadasEnPalabras: Array<{ motivo: string; filas: number[] }>;
}

export interface CatalogoVivo {
  items: number;
  source: string | null;
  error: string | null;
}

/** Lo que contesta la subida cuando no se cargó: el mensaje y si se puede confirmar. */
export class SubidaNoCargada extends Error {
  constructor(message: string, readonly necesitaConfirmacion: boolean) {
    super(message);
  }
}

export interface ResultadoSubida {
  llantas: number;
  aros: number;
  descartadas: { fila: number; motivo: string }[];
  mismoArchivo: boolean;
  hoja: string | null;
  fechaReporte: string | null;
}

interface InventarioState {
  /** null = todavía no se sabe (no se muestra nada hasta saberlo). */
  porArchivo: boolean | null;
  estado: EstadoInventario | null;
  catalogo: CatalogoVivo | null;
  cargar: () => Promise<void>;
  subir: (archivo: File, confirmar?: boolean) => Promise<ResultadoSubida>;
}

/** Un día: pasado eso, el inventario se marca viejo. */
export const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** De cuándo es el inventario: la fecha del reporte de Fénix si la trae; si no, la de subida. */
export const fechaDelInventario = (e: Pick<EstadoInventario, "fechaReporte" | "subidoEn">): string =>
  e.fechaReporte ?? e.subidoEn;

/** Horas desde la fecha del inventario. */
export const horasDelInventario = (e: Pick<EstadoInventario, "fechaReporte" | "subidoEn">, ahora = Date.now()): number =>
  Math.max(0, (ahora - new Date(fechaDelInventario(e)).getTime()) / 3_600_000);

export const inventarioViejo = (e: EstadoInventario | null, ahora = Date.now()): boolean =>
  !e || ahora - new Date(fechaDelInventario(e)).getTime() > UN_DIA_MS;

export const useInventario = create<InventarioState>((set, get) => ({
  porArchivo: null,
  estado: null,
  catalogo: null,
  async cargar() {
    try {
      const r = await fetch("/api/catalog/archivo", { headers: authHeaders() });
      if (!r.ok) return;
      const data = (await r.json()) as { porArchivo?: boolean; archivo: EstadoInventario | null; catalog: CatalogoVivo };
      set({ porArchivo: data.porArchivo === true, estado: data.archivo, catalogo: data.catalog });
    } catch {
      /* sin red: se queda lo que había */
    }
  },
  async subir(archivo, confirmar = false) {
    if (archivo.size > 5 * 1024 * 1024) throw new SubidaNoCargada("El archivo pesa más de 5 MB. ¿Es el inventario de Fénix?", false);
    const query = `nombre=${encodeURIComponent(archivo.name)}${confirmar ? "&confirmar=1" : ""}`;
    const r = await fetch(`/api/catalog/import?${query}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/octet-stream" },
      body: archivo,
    });
    const data = (await r.json().catch(() => ({}))) as {
      error?: string;
      necesitaConfirmacion?: boolean;
      importado?: ResultadoSubida;
    };
    if (!r.ok || !data.importado) {
      throw new SubidaNoCargada(data.error ?? `No se pudo subir (error ${r.status})`, data.necesitaConfirmacion === true);
    }
    await get().cargar();
    return data.importado;
  },
}));

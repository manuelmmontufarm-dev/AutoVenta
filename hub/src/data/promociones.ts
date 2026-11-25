/**
 * PROMOCIONES QUE EL NEGOCIO ARMA SOLO (24-nov-2026). Lo que la pantalla
 * «Promociones» le pide al servidor. Las cuentas y los candados viven allá
 * (`app/src/domain/promociones.ts`): acá solo se pide y se muestra.
 */
import { authHeaders } from "./realSource";

export type TipoDePromocion =
  | "precio_nuevo" | "porcentaje" | "monto" | "por_llanta" | "nxm" | "enesima" | "juego" | "escalonado" | "regalo";

export interface Parametros {
  lleva?: number;
  paga?: number;
  posicion?: number;
  porcentaje?: number;
  escalones?: Array<{ desde: number; porcentaje: number }>;
  regalo?: string;
  /** Porcentaje para TODAS las llantas, sin Excel (el «Descuento de siempre»). */
  todas?: boolean;
  temporada?: boolean;
  marcas?: string[];
}

export interface TipoParaElPanel {
  id: TipoDePromocion;
  nombre: string;
  queHace: string;
  ejemplo: string;
  columnas: string[];
  pide: Array<"lleva_paga" | "posicion_porcentaje" | "escalones" | "regalo">;
  porCantidad: boolean;
}

export type Estado = "activa" | "apagada" | "programada" | "vencida";

export interface PromocionGuardada {
  id: number;
  nombre: string;
  tipo: TipoDePromocion;
  tipoNombre: string;
  textoExtra: string | null;
  activa: boolean;
  desde: string | null;
  hasta: string | null;
  parametros: Parametros;
  origen: string;
  estado: Estado;
  llantas: number;
  entranHoy: number;
  noEntranHoy: number;
  resumen: string | null;
  actualizadaEn: string;
}

export interface LlantaDeLaVista {
  codigo: string;
  nombre: string;
  medida: string | null;
  stock: number;
  precioHoy: number;
  precioPromo: number | null;
  porcentaje: number | null;
  regla: string | null;
  porCantidad: Array<{ cantidad: number; unidad: number | null; total: number }> | null;
  advertencias: string[];
}

export interface FueraDeLaVista {
  fila: number | null;
  codigo: string;
  nombre: string | null;
  motivo: string;
}

export interface Vista {
  subida: string | null;
  entran: LlantaDeLaVista[];
  noEntran: FueraDeLaVista[];
  sinLlenar: number;
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(ruta, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!r.ok || data.ok === false) throw new Error(data.error ?? `No se pudo completar (error ${r.status})`);
  return data as T;
}

const json = (cuerpo: unknown, method: string): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cuerpo),
});

export const listar = () =>
  pedir<{ tipos: TipoParaElPanel[]; promociones: PromocionGuardada[]; llantasEnInventario: number }>("/api/promociones");

export const detalle = (id: number) =>
  pedir<{ promocion: PromocionGuardada; entran: LlantaDeLaVista[]; noEntran: FueraDeLaVista[] }>(`/api/promociones/${id}`);

export const crear = (datos: {
  nombre: string; tipo: TipoDePromocion; textoExtra: string; desde: string | null; hasta: string | null;
  parametros: Parametros; activa: boolean; subida: string;
}) => pedir<{ promocion: PromocionGuardada }>("/api/promociones", json(datos, "POST"));

export const cambiar = (id: number, cambios: Partial<{
  nombre: string; textoExtra: string | null; desde: string | null; hasta: string | null; activa: boolean; subida: string;
}>) => pedir<{ promocion: PromocionGuardada }>(`/api/promociones/${id}`, json(cambios, "PATCH"));

export const quitar = (id: number) => pedir<{ ok: true }>(`/api/promociones/${id}`, { method: "DELETE" });

/** Sube el Excel lleno y devuelve cómo queda cada llanta. No guarda nada todavía. */
export async function leerExcel(tipo: TipoDePromocion, parametros: Parametros, archivo: File): Promise<Vista> {
  if (archivo.size > 5 * 1024 * 1024) throw new Error("El archivo pesa más de 5 MB. ¿Es el Excel que bajó de aquí?");
  const query = new URLSearchParams({ tipo, nombre: archivo.name, parametros: JSON.stringify(parametros) });
  return pedir<Vista>(`/api/promociones/leer?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: archivo,
  });
}

/** Baja el Excel (en blanco para un tipo, o el de una promoción guardada con lo ya llenado). */
export async function bajarExcel(pedido: { tipo: TipoDePromocion; nombre?: string } | { id: number }): Promise<void> {
  const query = new URLSearchParams("id" in pedido ? { id: String(pedido.id) } : { tipo: pedido.tipo, nombre: pedido.nombre ?? "" });
  const r = await fetch(`/api/promociones/excel?${query.toString()}`, { headers: authHeaders() });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `No se pudo bajar el Excel (error ${r.status})`);
  }
  const nombre = /filename="?([^";]+)"?/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "Promocion.xlsx";
  const url = URL.createObjectURL(await r.blob());
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

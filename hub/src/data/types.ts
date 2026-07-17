/**
 * Modelo de datos del Hub — espejo de app/src/db/schema.sql.
 *
 * La Parte 2 expone estos mismos shapes desde el Express del bot;
 * el frontend no cambia (ver DataSource en source.ts).
 */

/** Etapas del pipeline = el guion real de venta de Depot Tire. */
export type Etapa = "nuevo" | "medidas" | "cotizado" | "ubicacion" | "por_visitar";

export type Cierre = "ganado" | "perdido" | "sin_respuesta";

export type Atiende = "bot" | "humano";

export type Rol = "cliente" | "bot" | "vendedor";

export const ETAPAS: Etapa[] = ["nuevo", "medidas", "cotizado", "ubicacion", "por_visitar"];

export const ETAPA_META: Record<
  Etapa,
  { nombre: string; corto: string; color: string; descripcion: string }
> = {
  nuevo: {
    nombre: "Nuevo",
    corto: "Nuevo",
    color: "#8da3c0",
    descripcion: "Cliente escribió — se le preguntan las medidas",
  },
  medidas: {
    nombre: "Medidas",
    corto: "Medidas",
    color: "#6cc5d4",
    descripcion: "Medida identificada — se busca la cotización",
  },
  cotizado: {
    nombre: "Cotizado",
    corto: "Cotizado",
    color: "#cdb989",
    descripcion: "PDF enviado — ¿está interesado?",
  },
  ubicacion: {
    nombre: "Ubicación",
    corto: "Ubicación",
    color: "#a78bfa",
    descripcion: "Se le envió el local más cercano",
  },
  por_visitar: {
    nombre: "Por visitar",
    corto: "Visita",
    color: "#8fa885",
    descripcion: "Confirmó que viene a comprar",
  },
};

export const CIERRE_META: Record<Cierre, { nombre: string; color: string; emoji: string }> = {
  ganado: { nombre: "Ganado", color: "#86c79a", emoji: "🏁" },
  perdido: { nombre: "Perdido", color: "#c96b62", emoji: "✕" },
  sin_respuesta: { nombre: "Sin respuesta", color: "#a5a196", emoji: "⏱" },
};

export interface ItemCotizacion {
  descripcion: string;
  cantidad: number;
  precioUnit: number;
}

export interface Cotizacion {
  numero: number;
  items: ItemCotizacion[];
  subtotal: number;
  iva: number; // 15% Ecuador
  total: number;
}

export interface LocalAsignado {
  nombre: string;
  direccion: string;
  distanciaKm: number;
}

export interface Ticket {
  id: number;
  telefono: string; // wa_id del cliente
  nombre: string | null;
  estado: "abierto" | "cerrado";
  etapa: Etapa;
  cierre?: Cierre;
  cerradoEn?: string;
  atiende: Atiende;
  medida?: string; // "205/55 R16" — EL dato del negocio
  vehiculo?: string;
  cotizacion?: Cotizacion;
  localAsignado?: LocalAsignado;
  esRecurrente: boolean;
  sinLeer: number;
  notas: string[];
  creadoEn: string;
  ultimaActividad: string;
  /** Preview del último mensaje para el inbox (denormalizado, como WhatsApp). */
  ultimoMensaje: string;
}

export type TipoMensaje = "texto" | "pdf" | "ubicacion";

export interface Mensaje {
  id: number;
  ticketId: number;
  rol: Rol;
  tipo: TipoMensaje;
  contenido: string;
  hora: string;
}

export interface FeedItem {
  id: number;
  icono: string;
  texto: string;
  hora: string;
  ticketId?: number;
}

/** Los 2 locales reales (PROYECTO.md §11 + app/src/config.ts). */
export const LOCALES = [
  {
    nombre: "Depot Tire Cumbayá",
    direccion: "C.C. La del Establo y Av. Oswaldo Guayasamín, Cumbayá",
    lat: -0.198,
    lng: -78.43,
  },
  {
    nombre: "Depot Tire Quito Sur",
    direccion: "Galo Molina y Av. Alonso de Angulo",
    lat: -0.2487128,
    lng: -78.5296804,
  },
] as const;

export const MARCAS = ["Kenda", "Sunoco", "Eurolub", "Falken"] as const;

export const IVA = 0.15;

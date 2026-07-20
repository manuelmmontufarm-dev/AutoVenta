/**
 * Modelo de datos del Hub — espejo de app/src/db/schema.sql.
 *
 * La Parte 2 expone estos mismos shapes desde el Express del bot;
 * el frontend no cambia (ver DataSource en source.ts).
 */

/** Etapas del pipeline = el guion real de venta de Depot Tire. */
export type Etapa =
  | "nuevo"
  | "medida_confirmada"
  | "seleccionando"
  | "cotizacion_enviada"
  | "handoff_visita"
  | "ganado"
  | "perdido";

export type Cierre = "ganado" | "perdido" | "sin_respuesta";

export type Atiende = "bot" | "humano";

export type Rol = "cliente" | "bot" | "vendedor";

export const ETAPAS: Etapa[] = [
  "nuevo",
  "medida_confirmada",
  "seleccionando",
  "cotizacion_enviada",
  "handoff_visita",
];

export const ETAPA_META: Record<
  Etapa,
  { nombre: string; corto: string; color: string; descripcion: string }
> = {
  nuevo: {
    nombre: "Nuevo",
    corto: "Nuevo",
    color: "var(--etapa-nuevo)",
    descripcion: "Cliente escribió — se le preguntan las medidas",
  },
  medida_confirmada: {
    nombre: "Medida confirmada",
    corto: "Medida",
    color: "var(--etapa-medidas)",
    descripcion: "El cliente confirmó la medida — se preparan opciones reales",
  },
  seleccionando: {
    nombre: "Opciones y comparación",
    corto: "Eligiendo",
    color: "var(--etapa-cotizado)",
    descripcion: "Evalúa marcas, precios y comparaciones de 2–3 modelos",
  },
  cotizacion_enviada: {
    nombre: "Cotización enviada",
    corto: "Cotización",
    color: "var(--etapa-ubicacion)",
    descripcion: "Eligió un modelo y cantidad — PDF final enviado",
  },
  handoff_visita: {
    nombre: "Visita / handoff",
    corto: "Visita",
    color: "var(--etapa-visita)",
    descripcion: "Confirmó visita, reserva o pidió atención humana",
  },
  ganado: {
    nombre: "Ganado",
    corto: "Ganado",
    color: "var(--cierre-ganado)",
    descripcion: "Venta confirmada por el equipo",
  },
  perdido: {
    nombre: "Perdido",
    corto: "Perdido",
    color: "var(--cierre-perdido)",
    descripcion: "El cliente decidió no continuar",
  },
};

export const CIERRE_META: Record<Cierre, { nombre: string; color: string; emoji: string }> = {
  ganado: { nombre: "Ganado", color: "var(--cierre-ganado)", emoji: "🏁" },
  perdido: { nombre: "Perdido", color: "var(--cierre-perdido)", emoji: "✕" },
  sin_respuesta: { nombre: "Sin respuesta", color: "var(--cierre-sinresp)", emoji: "⏱" },
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
  estado?: string;
  metadata?: Record<string, unknown>;
  hora: string;
}

export interface FeedItem {
  id: number;
  icono: string;
  texto: string;
  hora: string;
  ticketId?: number;
}

export interface HubMetrics {
  summary: {
    abiertos: number;
    cotizaciones: number;
    ganados: number;
    enJuego: number;
    vendido: number;
    primeraRespuestaSegundos: number | null;
  };
  daily: Array<{ day: string; value: number }>;
  funnel: Array<{ stage: Etapa; value: number }>;
  deliveries: Array<{ status: string; value: number }>;
  inventory: {
    total: number;
    available: number;
    check: number;
    out: number;
    withImage: number;
    imageCoverage: number;
    brands: number;
    source: string | null;
    lastSync: string | null;
  };
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

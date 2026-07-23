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
  | "seguimiento_venta"
  | "ganado"
  | "perdido";

export type Cierre = "ganado" | "perdido" | "sin_respuesta";

export type Atiende = "bot" | "humano";

/**
 * Fases activas del producto entregado. El backend siempre trae todo; estas
 * banderas deciden qué pantallas del hub aparecen. Fase 1 = núcleo (siempre).
 */
export interface PhaseFlags {
  fase2: boolean;
  fase3: boolean;
  /** Fase 4: Oportunidades (seguimientos / recuperación de clientes). */
  fase4: boolean;
}

export type Rol = "cliente" | "bot" | "vendedor";

export const ETAPAS: Etapa[] = [
  "nuevo",
  "medida_confirmada",
  "seleccionando",
  "cotizacion_enviada",
  "seguimiento_venta",
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
  seguimiento_venta: {
    nombre: "Seguimiento hasta venta",
    corto: "Seguimiento",
    color: "var(--etapa-visita)",
    descripcion: "Visita, ubicación, reserva, handoff y seguimiento comercial",
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
  originalTotal?: number;
  discountAmount?: number;
  discountReason?: string;
  discountCondition?: string;
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
  comprasAnteriores?: number;
  sinLeer: number;
  notas: string[];
  creadoEn: string;
  ultimaActividad: string;
  /** Preview del último mensaje para el inbox (denormalizado, como WhatsApp). */
  ultimoMensaje: string;
  resumen?: string;
  queBusca?: string;
  opcionesComparadas?: unknown[];
  opcionElegida?: string;
  compromisoCliente?: string;
  pickupDate?: string;
  visitDate?: string;
  offerExpiresAt?: string;
  localCercano?: string;
  followUpReason?: string;
  customerOptIn?: boolean;
  optedOutAt?: string;
  ventanaCierraEn?: string;
  proximoSeguimiento?: {
    id: number; dueAt: string; status: string; preview: string;
    templateKey: string | null; windowClosesAt: string | null;
  };
  planSeguimientos?: Array<{
    id: number; type: string; channel: string; dueAt: string; status: string;
    preview: string; templateKey: string | null; windowClosesAt: string | null;
    reason?: string | null;
  }>;
  mensajeRecomendadoHumano?: string;
  descuentoActivo?: {
    id: number; amount: number; finalTotal: number; reason: string;
    condition: string; status: string; expiresAt: string | null;
  };
  descuentoPendiente?: { id: number; kind: string; value: number; condition: string };
  historialSeguimientos?: Array<{
    id: number; type: string; status: string; createdAt: string;
    sentAt?: string; deliveredAt?: string; readAt?: string; error?: string;
  }>;
}

export type FollowUpBucket = "needs_human" | "closing" | "attention_now" | "today" | "scheduled" | "commitments" | "window_closed" | "human_review" | "cancelled_failed";

export interface FollowUpCard {
  id: number | null; conversationId: number; cycle: number; type: string | null;
  status: string | null; bucket: FollowUpBucket; customer: string; phone: string;
  stage: Etapa; tireSize: string | null; selectedProductCode: string | null;
  summary: string; lastMessage: string | null; lastAt: string | null; dueAt: string | null;
  windowClosesAt: string | null; preview: string; templateRequired: string | null;
  alertReason: string | null; assignedTo: "bot" | "human";
  unansweredDays: number; commitment: string | null; visitDate: string | null; pickupDate: string | null;
  campaignId: number | null; campaignTemplateKey: string | null;
  campaignPlan: Array<{ id: number; day: string; dueAt: string; preview: string; templateKey: string; status: string }>;
  importanceLabel: string;
  importanceReason: string;
  discountCondition: string | null;
}

export interface TemplatePlanPreview {
  allowed: boolean;
  reason: string | null;
  template: { template_key: string; template_name: string | null; language: string; preview: string; approval_status: string; configured: boolean } | null;
  days: Array<{ day: number; dueAt: string; templateKey: string; templateName: string; language: string; preview: string }>;
}

export interface BotAlert {
  id: number; conversationId: number; type: string;
  priority: "critical" | "high" | "medium" | "low";
  summary: string; exactReason: string; suggestedAction: string;
  status: string; snoozedUntil: string | null; createdAt: string; customer: string;
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
  replyHours?: Array<{ hour: number; label: string; replies: number }>;
  discounts?: {
    offered: number; wonWith: number; quotedWithout: number; wonWithout: number;
    conversionWith: number; conversionWithout: number; totalDiscount: number;
    avgDaysToWinWith: number | null; avgDaysToWinWithout: number | null;
    avgHoursToReply: number | null;
  };
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
  followUps?: {
    scheduled: number;
    sent: number;
    responded: number;
    converted: number;
    cancelled_by_reply: number;
    missed_windows: number;
    opt_outs: number;
    negative: number;
    template_delivered: number;
    template_read: number;
    avg_response_seconds: number | null;
    byStageAndType: Array<{ stage: string; type: string; total: number; sent: number }>;
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

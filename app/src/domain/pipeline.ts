export const PIPELINE_STAGES = [
  "nuevo",
  "medida_confirmada",
  "seleccionando",
  "cotizacion_enviada",
  "seguimiento_venta",
  "ganado",
  "perdido",
] as const;

export type Stage = (typeof PIPELINE_STAGES)[number];

export const OPEN_STAGES: Stage[] = [
  "nuevo",
  "medida_confirmada",
  "seleccionando",
  "cotizacion_enviada",
  "seguimiento_venta",
];

export const STAGE_ORDER: Record<Stage, number> = {
  nuevo: 0,
  medida_confirmada: 1,
  seleccionando: 2,
  cotizacion_enviada: 3,
  seguimiento_venta: 4,
  ganado: 5,
  perdido: 5,
};

export function isStage(value: string): value is Stage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

/** Traduce únicamente valores históricos; los ids, métricas y ciclos no cambian. */
export function normalizeHistoricalStage(value: string): Stage | null {
  const normalized = value === "handoff_visita" ? "seguimiento_venta" : value;
  return isStage(normalized) ? normalized : null;
}

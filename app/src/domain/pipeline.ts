export const PIPELINE_STAGES = [
  "nuevo",
  "medida_confirmada",
  "seleccionando",
  "cotizacion_enviada",
  "handoff_visita",
  "ganado",
  "perdido",
] as const;

export type Stage = (typeof PIPELINE_STAGES)[number];

export const OPEN_STAGES: Stage[] = [
  "nuevo",
  "medida_confirmada",
  "seleccionando",
  "cotizacion_enviada",
  "handoff_visita",
];

export const STAGE_ORDER: Record<Stage, number> = {
  nuevo: 0,
  medida_confirmada: 1,
  seleccionando: 2,
  cotizacion_enviada: 3,
  handoff_visita: 4,
  ganado: 5,
  perdido: 5,
};

export function isStage(value: string): value is Stage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

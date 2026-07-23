/**
 * Fases del producto (entrega por etapas).
 *
 * El backend siempre trae TODAS las capacidades. Las "fases" son un interruptor
 * que decide qué se muestra/actúa en el producto entregado:
 *   - Frontend: qué pantallas aparecen en el hub (ver App.tsx).
 *   - Bot: qué herramientas puede usar el agente (ver agent.ts).
 *
 * Fase 1 = núcleo, siempre activo (buscar por medida + cotización).
 * Fase 2 = sin datos: fitment vehículo→medida (y OCR de fotos cuando exista).
 * Fase 3 = producto completo: comparativas visuales + pantallas avanzadas del hub.
 *
 * Se guarda en la tabla settings (key = 'phase_config'). El dueño las enciende
 * una por una desde el panel de administración. Sin registro en DB, se usa
 * PHASES_DEFAULT del entorno ("1" | "2" | "3" | "all") — staging = "all".
 */
import { z } from "zod";
import { sql } from "../db/client.js";

export const PhaseFlagsSchema = z.object({
  fase2: z.boolean().default(false),
  fase3: z.boolean().default(false),
});

export type PhaseFlags = z.infer<typeof PhaseFlagsSchema>;

/** Herramientas del agente que desbloquea cada fase (acumulativo). */
export const PHASE1_TOOLS = [
  "buscar_llanta",
  "buscar_catalogo",
  "preparar_opciones",
  "generar_cotizacion",
  "local_mas_cercano",
  "notificar_vendedor",
] as const;
export const PHASE2_TOOLS = ["fitment_vehiculo"] as const;
export const PHASE3_TOOLS = ["enviar_comparacion"] as const;

function envDefaults(): PhaseFlags {
  const raw = (process.env.PHASES_DEFAULT ?? "1").trim().toLowerCase();
  if (raw === "all" || raw === "3") return { fase2: true, fase3: true };
  if (raw === "2") return { fase2: true, fase3: false };
  return { fase2: false, fase3: false };
}

const CACHE_TTL_MS = 15_000;
let cache: { value: PhaseFlags; at: number } | null = null;

export async function getPhaseFlags(): Promise<PhaseFlags> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const [row] = await sql<{ value: unknown }[]>`
    select value from settings where key = 'phase_config'
  `;
  let value: PhaseFlags;
  if (row) {
    const parsed = PhaseFlagsSchema.safeParse(row.value ?? {});
    value = parsed.success ? parsed.data : envDefaults();
  } else {
    value = envDefaults();
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function savePhaseFlags(input: unknown): Promise<PhaseFlags> {
  const current = await getPhaseFlags();
  const merged = PhaseFlagsSchema.parse({ ...current, ...(input as object) });
  await sql`
    insert into settings (key, value)
    values ('phase_config', ${sql.json(merged)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  cache = { value: merged, at: Date.now() };
  return merged;
}

/** Nivel de fase efectivo (para etiquetas y lógica de UI). */
export function activeLevel(flags: PhaseFlags): 1 | 2 | 3 {
  if (flags.fase3) return 3;
  if (flags.fase2) return 2;
  return 1;
}

/** Conjunto de herramientas habilitadas según las fases activas. */
export function enabledTools(flags: PhaseFlags): Set<string> {
  const tools: string[] = [...PHASE1_TOOLS];
  if (flags.fase2) tools.push(...PHASE2_TOOLS);
  if (flags.fase3) tools.push(...PHASE3_TOOLS);
  return new Set(tools);
}

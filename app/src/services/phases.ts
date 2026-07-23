/**
 * Fases del producto (entrega por etapas).
 *
 * El backend siempre trae TODAS las capacidades. Las "fases" son un interruptor
 * que decide qué se muestra/actúa en el producto entregado:
 *   - Frontend: qué pantallas aparecen en el hub (ver App.tsx).
 *   - Bot: qué herramientas gateadas puede usar el agente (ver agent.ts).
 *   - Seguimientos: si se agenda/procesa la recuperación de clientes (Fase 4).
 *
 * Fase 1 = núcleo, siempre activo (buscar por medida + cotización).
 * Fase 2 = sin datos: fitment vehículo→medida (y OCR de fotos cuando exista).
 * Fase 3 = producto completo: comparativas visuales + pantallas avanzadas del hub.
 * Fase 4 = Oportunidades: seguimientos / recuperación de clientes.
 *
 * Se guarda en la tabla settings (key = 'phase_config'). El dueño las enciende
 * una por una desde el panel central. Sin registro en DB, se usa
 * PHASES_DEFAULT del entorno ("1" | "2" | "3" | "4" | "all") — staging = "all".
 */
import { z } from "zod";
import { sql } from "../db/client.js";

export const PhaseFlagsSchema = z.object({
  fase2: z.boolean().default(false),
  fase3: z.boolean().default(false),
  fase4: z.boolean().default(false),
});

export type PhaseFlags = z.infer<typeof PhaseFlagsSchema>;

/**
 * Herramientas del agente que SOLO se habilitan al encender su fase. Todo lo
 * demás (el resto de tools) está siempre disponible — así el merge con nuevas
 * tools no las bloquea por accidente.
 */
export const PHASE_GATED_TOOLS: Record<string, keyof PhaseFlags> = {
  fitment_vehiculo: "fase2",
  enviar_comparacion: "fase3",
};

/** ¿Esta tool está permitida con las fases activas? (no gateada = siempre sí). */
export function toolEnabled(toolName: string, flags: PhaseFlags): boolean {
  const req = PHASE_GATED_TOOLS[toolName];
  return !req || flags[req];
}

function envDefaults(): PhaseFlags {
  const raw = (process.env.PHASES_DEFAULT ?? "1").trim().toLowerCase();
  if (raw === "all" || raw === "4") return { fase2: true, fase3: true, fase4: true };
  if (raw === "3") return { fase2: true, fase3: true, fase4: false };
  if (raw === "2") return { fase2: true, fase3: false, fase4: false };
  return { fase2: false, fase3: false, fase4: false };
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
export function activeLevel(flags: PhaseFlags): 1 | 2 | 3 | 4 {
  if (flags.fase4) return 4;
  if (flags.fase3) return 3;
  if (flags.fase2) return 2;
  return 1;
}

/** ¿Está encendida la fase de seguimientos/oportunidades? */
export function followUpsEnabled(flags: PhaseFlags): boolean {
  return flags.fase4;
}

/**
 * Ajustes persistentes del bot (tabla settings, key/value jsonb).
 * Hoy solo guarda la configuración de estilo del asistente (página
 * /configuracion/ia del hub). Cache en memoria con TTL corto para no
 * pegarle a la DB en cada mensaje entrante.
 */
import { z } from "zod";
import { sql } from "../db/client.js";

export const AiConfigSchema = z.object({
  /** Texto libre que se suma al prompt: personalidad extra del asistente. */
  personalidad: z.string().max(600).default(""),
  tono: z.enum(["calido", "neutral", "formal"]).default("calido"),
  emojis: z.enum(["ninguno", "pocos", "muchos"]).default("pocos"),
  longitud: z.enum(["corta", "media", "larga"]).default("corta"),
  /** Cierre de venta: si está activo, el bot despide con el emoji elegido. */
  stickerFinal: z.boolean().default(true),
  emojiCierre: z.string().max(8).default("🤝"),
});

export type AiConfig = z.infer<typeof AiConfigSchema>;

export const DEFAULT_AI_CONFIG: AiConfig = AiConfigSchema.parse({});

const CACHE_TTL_MS = 30_000;
let cache: { value: AiConfig; at: number } | null = null;

export async function getAiConfig(): Promise<AiConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const [row] = await sql<{ value: unknown }[]>`
    select value from settings where key = 'ai_config'
  `;
  const parsed = AiConfigSchema.safeParse(row?.value ?? {});
  const value = parsed.success ? parsed.data : DEFAULT_AI_CONFIG;
  cache = { value, at: Date.now() };
  return value;
}

export async function saveAiConfig(input: unknown): Promise<AiConfig> {
  // Merge sobre lo guardado: la página puede mandar solo los campos que cambió.
  const current = await getAiConfig();
  const merged = AiConfigSchema.parse({ ...current, ...(input as object) });
  await sql`
    insert into settings (key, value)
    values ('ai_config', ${sql.json(merged)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  cache = { value: merged, at: Date.now() };
  return merged;
}

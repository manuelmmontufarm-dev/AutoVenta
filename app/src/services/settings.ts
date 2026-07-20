/**
 * Ajustes persistentes del bot (tabla settings, key/value jsonb).
 * Hoy solo guarda la configuración de estilo del asistente (página
 * /configuracion/ia del hub). Cache en memoria con TTL corto para no
 * pegarle a la DB en cada mensaje entrante.
 */
import { z } from "zod";
import { sql } from "../db/client.js";
import { PIPELINE_STAGES, type Stage } from "../domain/pipeline.js";

export const AiConfigSchema = z.object({
  /** Texto libre que se suma al prompt: personalidad extra del asistente. */
  personalidad: z.string().max(600).default(""),
  tono: z.enum(["calido", "neutral", "formal"]).default("calido"),
  emojis: z.enum(["ninguno", "pocos", "muchos"]).default("muchos"),
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

export const StagePromptInputSchema = z.object({
  objective: z.string().max(500).default(""),
  prompt: z.string().max(6000).default(""),
  allowedTools: z.array(z.string().min(1).max(80)).max(20).default([]),
  settings: z
    .object({
      autoAction: z.enum(["none", "options", "comparison", "quote", "handoff"]).default("none"),
      requiresHumanApproval: z.boolean().default(false),
      fallback: z.string().max(600).default(""),
    })
    .default({
      autoAction: "none",
      requiresHumanApproval: false,
      fallback: "",
    }),
});

export type StagePromptInput = z.infer<typeof StagePromptInputSchema>;

export interface StagePromptVersion extends StagePromptInput {
  id: number;
  stage: Stage;
  version: number;
  status: "draft" | "published" | "archived";
  createdAt: string;
  publishedAt: string | null;
}

const DEFAULT_STAGE_PROMPTS: Record<Stage, StagePromptInput> = {
  nuevo: {
    objective: "Identificar medida o vehículo sin presionar al cliente.",
    prompt:
      "Haz una sola pregunta clara para obtener la medida. Si da vehículo, confirma la medida antes de hablar de precios.",
    allowedTools: ["buscar_llanta", "buscar_catalogo", "fitment_vehiculo", "preparar_opciones"],
    settings: { autoAction: "none", requiresHumanApproval: false, fallback: "" },
  },
  medida_confirmada: {
    objective: "Presentar opciones reales y ayudar a iniciar la selección.",
    prompt:
      "Usa el catálogo real y presenta opciones agrupadas con preparar_opciones. No decidas por el cliente ni sumes alternativas.",
    allowedTools: ["buscar_llanta", "buscar_catalogo", "preparar_opciones", "enviar_comparacion"],
    settings: { autoAction: "options", requiresHumanApproval: false, fallback: "" },
  },
  seleccionando: {
    objective: "Resolver dudas y comparar hasta que el cliente elija un modelo.",
    prompt:
      "Aclara diferencias entre 2–3 opciones. Usa enviar_comparacion si la duda está acotada. Cotiza solo después de confirmar un modelo y cantidad.",
    allowedTools: [
      "buscar_llanta",
      "buscar_catalogo",
      "preparar_opciones",
      "enviar_comparacion",
      "generar_cotizacion",
    ],
    settings: { autoAction: "comparison", requiresHumanApproval: false, fallback: "" },
  },
  cotizacion_enviada: {
    objective: "Confirmar interés, resolver logística y obtener intención de visita.",
    prompt:
      "No regeneres el PDF salvo que cambien modelo o cantidad. Pregunta si desea reservar, visitar o hablar con un asesor.",
    allowedTools: ["local_mas_cercano", "notificar_vendedor", "generar_cotizacion"],
    settings: { autoAction: "none", requiresHumanApproval: false, fallback: "" },
  },
  handoff_visita: {
    objective: "Coordinar el traspaso al vendedor sin prometer pagos ni reservas.",
    prompt:
      "Resume lo acordado, confirma local y horario, y deja el cierre comercial a un humano.",
    allowedTools: ["local_mas_cercano", "notificar_vendedor"],
    settings: { autoAction: "handoff", requiresHumanApproval: false, fallback: "" },
  },
  ganado: {
    objective: "Ticket cerrado como venta realizada.",
    prompt: "No envíes mensajes automáticos en una conversación cerrada.",
    allowedTools: [],
    settings: { autoAction: "none", requiresHumanApproval: true, fallback: "" },
  },
  perdido: {
    objective: "Ticket cerrado sin venta.",
    prompt: "No envíes mensajes automáticos en una conversación cerrada.",
    allowedTools: [],
    settings: { autoAction: "none", requiresHumanApproval: true, fallback: "" },
  },
};

export async function ensureDefaultStagePrompts(): Promise<void> {
  for (const stage of PIPELINE_STAGES) {
    const input = DEFAULT_STAGE_PROMPTS[stage];
    await sql`
      insert into stage_prompt_versions (
        stage, version, status, objective, prompt, allowed_tools, settings,
        created_by, published_at
      )
      values (
        ${stage},
        1,
        'published',
        ${input.objective},
        ${input.prompt},
        ${sql.json(input.allowedTools as never)},
        ${sql.json(input.settings as never)},
        'system',
        now()
      )
      on conflict (stage, version) do nothing
    `;
  }
}

export async function listStagePrompts(): Promise<StagePromptVersion[]> {
  await ensureDefaultStagePrompts();
  const rows = await sql<
    {
      id: number;
      stage: Stage;
      version: number;
      status: "draft" | "published" | "archived";
      objective: string;
      prompt: string;
      allowed_tools: string[];
      settings: StagePromptInput["settings"];
      created_at: Date;
      published_at: Date | null;
    }[]
  >`
    select
      id, stage, version, status, objective, prompt, allowed_tools, settings,
      created_at, published_at
    from stage_prompt_versions
    order by stage, version desc
  `;
  return rows.map(publicStagePrompt);
}

export async function getPublishedStagePrompt(stage: Stage): Promise<StagePromptVersion> {
  await ensureDefaultStagePrompts();
  const [row] = await sql<
    {
      id: number;
      stage: Stage;
      version: number;
      status: "published";
      objective: string;
      prompt: string;
      allowed_tools: string[];
      settings: StagePromptInput["settings"];
      created_at: Date;
      published_at: Date | null;
    }[]
  >`
    select
      id, stage, version, status, objective, prompt, allowed_tools, settings,
      created_at, published_at
    from stage_prompt_versions
    where stage = ${stage} and status = 'published'
    limit 1
  `;
  if (!row) throw new Error(`No existe prompt publicado para ${stage}`);
  return publicStagePrompt(row);
}

export async function saveStagePromptDraft(
  stage: Stage,
  input: unknown,
): Promise<StagePromptVersion> {
  const value = StagePromptInputSchema.parse(input);
  const [row] = await sql<
    {
      id: number;
      stage: Stage;
      version: number;
      status: "draft";
      objective: string;
      prompt: string;
      allowed_tools: string[];
      settings: StagePromptInput["settings"];
      created_at: Date;
      published_at: Date | null;
    }[]
  >`
    insert into stage_prompt_versions (
      stage, version, status, objective, prompt, allowed_tools, settings, created_by
    )
    values (
      ${stage},
      (select coalesce(max(version), 0) + 1 from stage_prompt_versions where stage = ${stage}),
      'draft',
      ${value.objective},
      ${value.prompt},
      ${sql.json(value.allowedTools as never)},
      ${sql.json(value.settings as never)},
      'owner'
    )
    returning
      id, stage, version, status, objective, prompt, allowed_tools, settings,
      created_at, published_at
  `;
  return publicStagePrompt(row);
}

export async function publishStagePrompt(id: number): Promise<StagePromptVersion> {
  return sql.begin(async (tx) => {
    const [draft] = await tx<{ id: number; stage: Stage }[]>`
      select id, stage from stage_prompt_versions where id = ${id}
    `;
    if (!draft) throw new Error("Versión no encontrada");
    await tx`
      update stage_prompt_versions
      set status = 'archived'
      where stage = ${draft.stage} and status = 'published'
    `;
    const [published] = await tx<
      {
        id: number;
        stage: Stage;
        version: number;
        status: "published";
        objective: string;
        prompt: string;
        allowed_tools: string[];
        settings: StagePromptInput["settings"];
        created_at: Date;
        published_at: Date | null;
      }[]
    >`
      update stage_prompt_versions
      set status = 'published', published_at = now()
      where id = ${id}
      returning
        id, stage, version, status, objective, prompt, allowed_tools, settings,
        created_at, published_at
    `;
    await tx`
      insert into audit_events (actor, action, entity_type, entity_id, after_value)
      values (
        'owner', 'prompt.publish', 'stage_prompt', ${String(id)},
        ${tx.json({ stage: draft.stage, version: published.version })}
      )
    `;
    return publicStagePrompt(published);
  });
}

function publicStagePrompt(row: {
  id: number;
  stage: Stage;
  version: number;
  status: "draft" | "published" | "archived";
  objective: string;
  prompt: string;
  allowed_tools: string[];
  settings: StagePromptInput["settings"];
  created_at: Date;
  published_at: Date | null;
}): StagePromptVersion {
  return {
    id: Number(row.id),
    stage: row.stage,
    version: Number(row.version),
    status: row.status,
    objective: row.objective,
    prompt: row.prompt,
    allowedTools: row.allowed_tools ?? [],
    settings: StagePromptInputSchema.shape.settings.parse(row.settings ?? {}),
    createdAt: row.created_at.toISOString(),
    publishedAt: row.published_at?.toISOString() ?? null,
  };
}

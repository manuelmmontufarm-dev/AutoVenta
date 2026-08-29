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
  // Neutral es el tono actual de Depot. A partir de aquí, cualquier cambio de
  // voz se hace desde Ajustes y no volviendo a fijarlo en el prompt base.
  tono: z.enum(["calido", "neutral", "formal"]).default("neutral"),
  emojis: z.enum(["ninguno", "pocos", "muchos"]).default("pocos"),
  longitud: z.enum(["corta", "media", "larga"]).default("corta"),
  /**
   * "imagen_primero": la pieza visual es el mensaje y el texto solo la
   * acompaña. "texto_completo": vuelve al detalle en texto de antes.
   * Existe para poder revertir desde el panel sin tocar código.
   */
  formato: z.enum(["imagen_primero", "texto_completo"]).default("imagen_primero"),
  /** Cierre de venta: si está activo, el bot despide con el emoji elegido. */
  stickerFinal: z.boolean().default(true),
  emojiCierre: z.string().max(8).default("🤝"),
});

export type AiConfig = z.infer<typeof AiConfigSchema>;

export const DEFAULT_AI_CONFIG: AiConfig = AiConfigSchema.parse({});

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const StorePeriodSchema = z.object({ open: TimeSchema, close: TimeSchema, closed: z.boolean().default(false) })
  .refine((value) => value.closed || value.open < value.close, "La hora de cierre debe ser posterior a la apertura");

/**
 * Caso especial de un local en una fecha concreta: feriados, inventario, un
 * cierre por mantenimiento. Va por local porque no siempre coinciden — Cumbayá
 * puede abrir medio día y Quito Sur cerrar completo el mismo feriado.
 */
const StoreExceptionSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  motivo: z.string().max(60).default(""),
  open: TimeSchema.default("08:30"),
  close: TimeSchema.default("17:30"),
  closed: z.boolean().default(false),
}).refine((v) => v.closed || v.open < v.close, "La hora de cierre debe ser posterior a la apertura");
export type StoreException = z.infer<typeof StoreExceptionSchema>;

const StoreSchema = z.object({
  weekday: StorePeriodSchema,
  weekend: StorePeriodSchema,
  /** Máximo 40: son fechas puntuales, no un calendario. */
  excepciones: z.array(StoreExceptionSchema).max(40).default([]),
});

export const StoreHoursSchema = z.object({
  cumbaya: StoreSchema,
  quitoSur: StoreSchema,
});
export type StoreHours = z.infer<typeof StoreHoursSchema>;
export const DEFAULT_STORE_HOURS: StoreHours = StoreHoursSchema.parse({
  cumbaya: { weekday: { open: "08:30", close: "17:30" }, weekend: { open: "08:30", close: "14:30" } },
  quitoSur: { weekday: { open: "08:30", close: "17:30" }, weekend: { open: "08:30", close: "17:30", closed: true } },
});

const CACHE_TTL_MS = 30_000;
let cache: { value: AiConfig; at: number } | null = null;
let storeHoursCache: { value: StoreHours; at: number } | null = null;

export async function getStoreHours(): Promise<StoreHours> {
  if (storeHoursCache && Date.now() - storeHoursCache.at < CACHE_TTL_MS) return storeHoursCache.value;
  const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'store_hours'`;
  const parsed = StoreHoursSchema.safeParse(row?.value ?? {});
  const value = parsed.success ? parsed.data : DEFAULT_STORE_HOURS;
  storeHoursCache = { value, at: Date.now() };
  return value;
}

export async function saveStoreHours(input: unknown): Promise<StoreHours> {
  const value = podarExcepciones(StoreHoursSchema.parse(input));
  await sql`insert into settings (key, value) values ('store_hours', ${sql.json(value)}) on conflict (key) do update set value=excluded.value, updated_at=now()`;
  storeHoursCache = { value, at: Date.now() };
  return value;
}

const NOMBRE_LOCAL = { cumbaya: "Cumbayá", quitoSur: "Quito Sur" } as const;

/** Hoy en Ecuador, como YYYY-MM-DD. */
export function hoyEnEcuador(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
}

/**
 * Borra las excepciones ya pasadas al guardar. Son fechas puntuales: si no se
 * podan, la lista crece sola y el prompt termina cargando feriados del año
 * pasado que a nadie le sirven.
 */
function podarExcepciones(hours: StoreHours, hoy = hoyEnEcuador()): StoreHours {
  const podar = (s: StoreHours["cumbaya"]) => ({
    ...s,
    excepciones: [...s.excepciones]
      .filter((e) => e.fecha >= hoy)
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  });
  return { cumbaya: podar(hours.cumbaya), quitoSur: podar(hours.quitoSur) };
}

/** La excepción vigente de un local para una fecha, si la hay. */
export function excepcionDelDia(
  hours: StoreHours,
  local: keyof StoreHours,
  fecha = hoyEnEcuador(),
): StoreException | null {
  return hours[local].excepciones.find((e) => e.fecha === fecha) ?? null;
}

/**
 * Los horarios como se los damos al bot. Además del horario normal, incluye los
 * casos especiales de hoy y de los próximos días: el cliente que pregunta un
 * 31 de diciembre necesita saber que ese día se cierra temprano, y el bot no
 * puede deducirlo del horario semanal.
 */
/**
 * ¿ALGÚN local atiende ese día? Es la pregunta que decide si un día puede ser
 * un botón: ofrecer un día cerrado agenda una visita a puerta cerrada.
 *
 * Basta con que abra uno de los dos porque el botón del día sale después del
 * botón del local — para cuando se pregunta la fecha, la sucursal ya está
 * elegida y el asesor confirma sobre esa. Lee la config real y no un supuesto:
 * el fin de semana lo decide el negocio desde Ajustes, no este archivo.
 */
export function algunLocalAbre(hours: StoreHours, fecha: Date): boolean {
  // El día se lee en la zona del negocio, no en UTC: a las 22:00 de Quito ya es
  // el día siguiente en UTC, y el botón habría ofrecido el día equivocado.
  const abreviatura = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/Guayaquil",
  }).format(fecha);
  const esFinde = abreviatura === "Sat" || abreviatura === "Sun";
  const periodo = (s: StoreHours["cumbaya"]) => (esFinde ? s.weekend : s.weekday);
  return !periodo(hours.cumbaya).closed || !periodo(hours.quitoSur).closed;
}

export function formatStoreHours(hours: StoreHours, hoy = hoyEnEcuador()): string {
  const fmt = (p: { open: string; close: string; closed: boolean }) =>
    p.closed ? "cerrado" : `${p.open}–${p.close}`;
  const base =
    `Cumbayá: lunes a viernes ${fmt(hours.cumbaya.weekday)}; sábado y domingo ${fmt(hours.cumbaya.weekend)}. ` +
    `Quito Sur: lunes a viernes ${fmt(hours.quitoSur.weekday)}; sábado y domingo ${fmt(hours.quitoSur.weekend)}.`;

  const limite = new Date(`${hoy}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 21);
  const hasta = limite.toISOString().slice(0, 10);

  const avisos: string[] = [];
  for (const local of ["cumbaya", "quitoSur"] as const) {
    for (const e of hours[local].excepciones) {
      if (e.fecha < hoy || e.fecha > hasta) continue;
      const cuando = e.fecha === hoy ? "HOY" : `el ${e.fecha}`;
      const motivo = e.motivo ? ` (${e.motivo})` : "";
      avisos.push(`${NOMBRE_LOCAL[local]} ${cuando}${motivo}: ${fmt(e)}`);
    }
  }
  if (!avisos.length) return base;
  return `${base}\n\nCASOS ESPECIALES que mandan sobre el horario normal — dilos si el cliente pregunta por esos días: ${avisos.join("; ")}.`;
}

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

/**
 * Apariencia de las piezas visuales (cotización, comparativa, opciones).
 * Son las perillas que el negocio mueve desde Ajustes y ve en la vista previa.
 */
export const PiecesConfigSchema = z.object({
  // "depot" (negro) y "depotRojo" son la paleta medida del cliente
  // (tiredepotec.com) en sus dos variantes; las otras seis son propuestas de
  // estilo. Ver PALETTES en render/depotDesign.ts.
  paleta: z.enum(["grafito", "carbon", "rojo", "verde", "espresso", "navy", "depot", "depotRojo"]).default("grafito"),
  fuente: z.enum(["exo", "barlow", "kanit", "chakra", "saira", "rajdhani", "archivo"]).default("exo"),
});

export type PiecesConfig = z.infer<typeof PiecesConfigSchema>;
export const DEFAULT_PIECES_CONFIG: PiecesConfig = PiecesConfigSchema.parse({});

let piecesCache: { value: PiecesConfig; at: number } | null = null;

export async function getPiecesConfig(): Promise<PiecesConfig> {
  if (piecesCache && Date.now() - piecesCache.at < CACHE_TTL_MS) return piecesCache.value;
  try {
    const [row] = await sql<{ value: unknown }[]>`
      select value from settings where key = 'pieces_config'
    `;
    const parsed = PiecesConfigSchema.safeParse(row?.value ?? {});
    const value = parsed.success ? parsed.data : DEFAULT_PIECES_CONFIG;
    piecesCache = { value, at: Date.now() };
    return value;
  } catch {
    // Una pieza no se deja de enviar porque no se pudo leer su color.
    return DEFAULT_PIECES_CONFIG;
  }
}

/**
 * El Ángel Guardián (revisión IA pre-envío, services/guardian.ts).
 *
 * Nace APAGADO: prenderlo es una decisión de gasto del asesor — cada turno
 * revisado es una llamada extra al modelo y los tokens los paga el negocio.
 * Cuando quiere cero errores, lo prende desde Ajustes; cuando quiere ahorrar,
 * lo apaga y el bot queda exactamente como antes.
 */
export const GuardianConfigSchema = z.object({
  activo: z.boolean().default(false),
});
export type GuardianConfig = z.infer<typeof GuardianConfigSchema>;
export const DEFAULT_GUARDIAN_CONFIG: GuardianConfig = GuardianConfigSchema.parse({});

let guardianCache: { value: GuardianConfig; at: number } | null = null;

export async function getGuardianConfig(): Promise<GuardianConfig> {
  if (guardianCache && Date.now() - guardianCache.at < CACHE_TTL_MS) return guardianCache.value;
  try {
    const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'guardian_config'`;
    const parsed = GuardianConfigSchema.safeParse(row?.value ?? {});
    const value = parsed.success ? parsed.data : DEFAULT_GUARDIAN_CONFIG;
    guardianCache = { value, at: Date.now() };
    return value;
  } catch {
    // Si no se pudo leer el ajuste, el bot responde igual — sin guardián.
    return DEFAULT_GUARDIAN_CONFIG;
  }
}

export async function saveGuardianConfig(input: unknown): Promise<GuardianConfig> {
  const merged = GuardianConfigSchema.parse({ ...(await getGuardianConfig()), ...(input as object) });
  await sql`
    insert into settings (key, value)
    values ('guardian_config', ${sql.json(merged)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  guardianCache = { value: merged, at: Date.now() };
  return merged;
}

/**
 * Cupón de confirmación (services/coupons.ts).
 *
 * Nace APAGADO, y eso no es una precaución genérica: el cupón promete plata en
 * caja. Si el bot empieza a emitir códigos antes de que Depot capacite a los
 * cajeros, el cliente llega con un papel que nadie sabe honrar — peor que no
 * haber prometido nada. Se prende el día de la capacitación (agendada en la
 * reunión del 14-ago), desde Ajustes y sin tocar código.
 *
 * El porcentaje también vive aquí: subirlo o bajarlo es una decisión comercial
 * de Depot, no un despliegue.
 */
export const CouponConfigSchema = z.object({
  activo: z.boolean().default(false),
  /** Tope de 10 % a propósito: más que eso no es un incentivo, es un error de tecleo. */
  porcentaje: z.coerce.number().min(0.5).max(10).default(2),
});
export type CouponConfig = z.infer<typeof CouponConfigSchema>;
export const DEFAULT_COUPON_CONFIG: CouponConfig = CouponConfigSchema.parse({});

let couponCache: { value: CouponConfig; at: number } | null = null;

export async function getCouponConfig(): Promise<CouponConfig> {
  if (couponCache && Date.now() - couponCache.at < CACHE_TTL_MS) return couponCache.value;
  try {
    const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'coupon_config'`;
    const parsed = CouponConfigSchema.safeParse(row?.value ?? {});
    const value = parsed.success ? parsed.data : DEFAULT_COUPON_CONFIG;
    couponCache = { value, at: Date.now() };
    return value;
  } catch {
    // Sin poder leer el ajuste se asume apagado: no se promete un descuento
    // que quizá nadie autorizó.
    return DEFAULT_COUPON_CONFIG;
  }
}

export async function saveCouponConfig(input: unknown): Promise<CouponConfig> {
  const merged = CouponConfigSchema.parse({ ...(await getCouponConfig()), ...(input as object) });
  await sql`
    insert into settings (key, value)
    values ('coupon_config', ${sql.json(merged)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  couponCache = { value: merged, at: Date.now() };
  return merged;
}

export async function savePiecesConfig(input: unknown): Promise<PiecesConfig> {
  const merged = PiecesConfigSchema.parse({ ...(await getPiecesConfig()), ...(input as object) });
  await sql`
    insert into settings (key, value)
    values ('pieces_config', ${sql.json(merged)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  piecesCache = { value: merged, at: Date.now() };
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
    objective: "Conseguir el aro o la medida y llegar a un precio lo antes posible.",
    prompt: "",
    allowedTools: [
      "buscar_llanta",
      "buscar_catalogo",
      "buscar_por_aro_y_tipo",
      "tipos_de_llanta",
      "guia_medida",
      "opciones_sin_medida",
      "fitment_vehiculo",
      "preparar_opciones",
      "generar_cotizacion",
    ],
    settings: { autoAction: "none", requiresHumanApproval: false, fallback: "" },
  },
  medida_confirmada: {
    objective: "Presentar opciones reales y avanzar hacia la cotización.",
    prompt: "",
    allowedTools: [
      "buscar_llanta",
      "buscar_catalogo",
      "buscar_por_aro_y_tipo",
      "tipos_de_llanta",
      "guia_medida",
      "opciones_sin_medida",
      "fitment_vehiculo",
      "preparar_opciones",
      "enviar_comparacion",
      "generar_cotizacion",
    ],
    settings: { autoAction: "options", requiresHumanApproval: false, fallback: "" },
  },
  seleccionando: {
    objective: "Resolver dudas y comparar hasta que el cliente elija un modelo.",
    prompt: "",
    allowedTools: [
      "buscar_llanta",
      "buscar_catalogo",
      "buscar_por_aro_y_tipo",
      "tipos_de_llanta",
      "guia_medida",
      "opciones_sin_medida",
      "fitment_vehiculo",
      "preparar_opciones",
      "enviar_comparacion",
      "generar_cotizacion",
    ],
    settings: { autoAction: "comparison", requiresHumanApproval: false, fallback: "" },
  },
  cotizacion_enviada: {
    objective: "Conseguir dos datos: qué día viene y a cuál local.",
    prompt: "",
    // Con la cotización enviada el objetivo es fecha+local, pero el cliente no
    // se entera de eso: si vuelve a pedir opciones o pregunta por otra medida,
    // el bot tiene que poder mostrárselas. Sin estas tools lo único que le
    // quedaba era repetir la pregunta (ticket 2150, 8-ago-2026).
    allowedTools: [
      "buscar_llanta",
      "buscar_catalogo",
      "buscar_por_aro_y_tipo",
      "guia_medida",
      "opciones_sin_medida",
      "preparar_opciones",
      "enviar_comparacion",
      "fitment_vehiculo",
      "local_mas_cercano",
      "notificar_vendedor",
      "generar_cotizacion",
      "reenviar_cotizacion",
    ],
    settings: { autoAction: "none", requiresHumanApproval: false, fallback: "" },
  },
  seguimiento_venta: {
    objective: "Dar seguimiento comercial hasta la venta, incluyendo visita, reserva y handoff.",
    prompt: "",
    // Esta es la etapa del ticket 2150: el cliente pidió una cotización y el bot
    // no tenía UNA sola herramienta de venta con qué contestarle, así que repitió
    // la pregunta por la foto tres turnos seguidos hasta que el dueño mandó las
    // opciones a mano. Seguimiento no significa dejar de vender.
    allowedTools: [
      "buscar_llanta",
      "buscar_catalogo",
      "buscar_por_aro_y_tipo",
      "guia_medida",
      "opciones_sin_medida",
      "preparar_opciones",
      "enviar_comparacion",
      "fitment_vehiculo",
      "local_mas_cercano",
      "notificar_vendedor",
      "generar_cotizacion",
      "reenviar_cotizacion",
    ],
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

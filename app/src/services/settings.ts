/**
 * Ajustes persistentes del bot (tabla settings, key/value jsonb).
 * Hoy solo guarda la configuración de estilo del asistente (página
 * /configuracion/ia del hub). Cache en memoria con TTL corto para no
 * pegarle a la DB en cada mensaje entrante.
 */
import { z } from "zod";
import { sql } from "../db/client.js";
import { PIPELINE_STAGES, type Stage } from "../domain/pipeline.js";
import { negocio } from "../negocio/index.js";
import { MODOS_PROMOCION } from "../domain/promocion.js";

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

export const DIAS_SEMANA = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
export type Dia = (typeof DIAS_SEMANA)[number];
const NOMBRE_DIA: Record<Dia, string> = {
  lun: "lunes", mar: "martes", mie: "miércoles", jue: "jueves", vie: "viernes", sab: "sábado", dom: "domingo",
};
/** `Intl` (en-US, weekday short) → nuestro día. */
const DIA_DE_INTL: Record<string, Dia> = { Mon: "lun", Tue: "mar", Wed: "mie", Thu: "jue", Fri: "vie", Sat: "sab", Sun: "dom" };

/**
 * Convierte lo viejo `{ weekday, weekend }` en los 7 días y deja pasar lo nuevo.
 *
 * Depot cierra los domingos pero abre el sábado, y con dos tramos fijos el
 * panel no podía expresarlo. Lo que hay guardado en `settings.store_hours` en
 * producción sigue en la forma vieja: se lee así, sin migración, y al guardar
 * ya sale en la nueva. `weekend` se copia a sábado Y domingo.
 */
export function normalizarHorarioDeLocal(crudo: unknown): unknown {
  if (!crudo || typeof crudo !== "object") return crudo;
  const c = crudo as Record<string, unknown>;
  if (c.dias || !(c.weekday || c.weekend)) return crudo;
  const { weekday, weekend, ...resto } = c;
  const dias: Record<string, unknown> = {};
  for (const d of DIAS_SEMANA) dias[d] = d === "sab" || d === "dom" ? weekend : weekday;
  return { ...resto, dias };
}

const StoreSchema = z.preprocess(normalizarHorarioDeLocal, z.object({
  dias: z.object(Object.fromEntries(DIAS_SEMANA.map((d) => [d, StorePeriodSchema])) as Record<Dia, typeof StorePeriodSchema>),
  /** Máximo 40: son fechas puntuales, no un calendario. */
  excepciones: z.array(StoreExceptionSchema).max(40).default([]),
}));

/**
 * Los horarios, UNO POR LOCAL, con la `claveHorario` del perfil como llave.
 *
 * Era un objeto de dos claves fijas (`cumbaya`, `quitoSur`), y eso hacía que un
 * negocio con un local —o con tres— no cupiera ni en el esquema ni en el panel.
 * Ahora es un mapa abierto, y las claves de Depot siguen siendo exactamente las
 * mismas: lo que está guardado en `settings.store_hours` en producción se lee
 * igual, sin migración.
 */
export const StoreHoursSchema = z.record(z.string(), StoreSchema);
export type StoreHours = z.infer<typeof StoreHoursSchema>;
/** El horario de UN local. Antes se escribía `StoreHours["cumbaya"]`. */
export type StoreHoursDeUnLocal = z.infer<typeof StoreSchema>;

/**
 * El horario por defecto de cada local del negocio: el general del perfil,
 * salvo que el propio local traiga el suyo.
 *
 * Depot lo tenía escrito acá y era distinto del general: el sábado y domingo
 * Cumbayá abre medio día y Quito Sur cierra. Eso vive ahora en su perfil.
 */
export const DEFAULT_STORE_HOURS: StoreHours = StoreHoursSchema.parse(
  Object.fromEntries(
    negocio.locales.map((local) => [
      local.claveHorario,
      local.horarioPorDefecto ?? {
        weekday: { open: "08:30", close: "17:30" },
        weekend: { open: "08:30", close: "17:30" },
      },
    ]),
  ),
);

/**
 * Completa lo que venga de la base con los valores por defecto de cada local.
 *
 * Hace falta porque un mapa abierto acepta `{}` sin fallar: sin esto, una base
 * sin la fila —o un local nuevo recién agregado al perfil— daría un horario
 * vacío en vez del por defecto, y el bot ofrecería días a puerta cerrada.
 */
function conLocalesDelNegocio(parcial: StoreHours): StoreHours {
  const completo: StoreHours = {};
  for (const local of negocio.locales) {
    completo[local.claveHorario] = parcial[local.claveHorario] ?? DEFAULT_STORE_HOURS[local.claveHorario];
  }
  return completo;
}

const CACHE_TTL_MS = 30_000;
let cache: { value: AiConfig; at: number } | null = null;
let storeHoursCache: { value: StoreHours; at: number } | null = null;

export async function getStoreHours(): Promise<StoreHours> {
  if (storeHoursCache && Date.now() - storeHoursCache.at < CACHE_TTL_MS) return storeHoursCache.value;
  const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'store_hours'`;
  const parsed = StoreHoursSchema.safeParse(row?.value ?? {});
  // Si lo guardado no valida se cae al defecto ENTERO (feriados incluidos):
  // que al menos quede en el log, porque antes pasaba en silencio.
  if (!parsed.success) console.warn("⚠️ store_hours guardado no valida; uso el horario por defecto:", parsed.error.issues[0]?.message);
  const value = conLocalesDelNegocio(parsed.success ? parsed.data : DEFAULT_STORE_HOURS);
  storeHoursCache = { value, at: Date.now() };
  return value;
}

export async function saveStoreHours(input: unknown): Promise<StoreHours> {
  const value = podarExcepciones(conLocalesDelNegocio(StoreHoursSchema.parse(input)));
  await sql`insert into settings (key, value) values ('store_hours', ${sql.json(value)}) on conflict (key) do update set value=excluded.value, updated_at=now()`;
  storeHoursCache = { value, at: Date.now() };
  return value;
}

/** `claveHorario` → cómo se le nombra al cliente ese local. Sale del perfil. */
const NOMBRE_LOCAL: Record<string, string> = Object.fromEntries(
  negocio.locales.map((local) => [local.claveHorario, local.nombreCorto]),
);

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
  const podar = (s: StoreHoursDeUnLocal) => ({
    ...s,
    excepciones: [...s.excepciones]
      .filter((e) => e.fecha >= hoy)
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  });
  return Object.fromEntries(Object.entries(hours).map(([clave, s]) => [clave, podar(s)]));
}

/** La excepción vigente de un local para una fecha, si la hay. */
export function excepcionDelDia(
  hours: StoreHours,
  local: string,
  fecha = hoyEnEcuador(),
): StoreException | null {
  return hours[local]?.excepciones.find((e) => e.fecha === fecha) ?? null;
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
 * Basta con que abra UNO porque el botón del día sale después del botón del
 * local — para cuando se pregunta la fecha, la sucursal ya está elegida y el
 * asesor confirma sobre esa. Lee la config real y no un supuesto: el fin de
 * semana lo decide el negocio desde Ajustes, no este archivo.
 */
/** El día de la semana de una fecha, leído en Quito. */
export function diaDeLaSemanaEnQuito(fecha: Date): Dia {
  const abreviatura = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Guayaquil" }).format(fecha);
  return DIA_DE_INTL[abreviatura];
}

/**
 * ¿Atiende ESE local ese día? Con `claveHorario` null vale cualquier local.
 * Es la pregunta de `agendar_visita` (Sprint Final, 26-oct): con domingo
 * cerrado el bot escribió «los domingos estamos cerrados» y, en el mismo
 * turno, registró la visita del domingo y avisó al asesor. El texto lo
 * corrigió el Guardián; el dato quedó mal. La fecha se rechaza acá.
 */
export function localAbre(hours: StoreHours, claveHorario: string | null, fecha: Date): boolean {
  const dia = diaDeLaSemanaEnQuito(fecha);
  const locales = claveHorario && hours[claveHorario] ? [hours[claveHorario]] : Object.values(hours);
  return locales.some((s) => !s.dias[dia]?.closed);
}

/** El primer día (desde mañana, hasta 7) en que ese local atiende; null si ninguno. */
export function siguienteDiaAbierto(hours: StoreHours, claveHorario: string | null, desde: Date): Date | null {
  for (let i = 1; i <= 7; i += 1) {
    const fecha = new Date(desde.getTime() + i * 86_400_000);
    if (localAbre(hours, claveHorario, fecha)) return fecha;
  }
  return null;
}

export function algunLocalAbre(hours: StoreHours, fecha: Date): boolean {
  // El día se lee en la zona del negocio, no en UTC: a las 22:00 de Quito ya es
  // el día siguiente en UTC, y el botón habría ofrecido el día equivocado.
  const abreviatura = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/Guayaquil",
  }).format(fecha);
  const dia = DIA_DE_INTL[abreviatura];
  return Object.values(hours).some((s) => !s.dias[dia].closed);
}

/**
 * El horario de UN local en palabras, agrupando días CONSECUTIVOS con el mismo
 * tramo: «lunes a viernes 08:30–17:30; sábado 08:30–14:30; domingo cerrado».
 * Nunca dice «sábado y domingo» si difieren (Depot abre el sábado y cierra el
 * domingo). Lo usan el prompt, el Guardián y la herramienta de horarios.
 */
export function horarioEnPalabras(local: StoreHoursDeUnLocal): string {
  const texto = (p: { open: string; close: string; closed: boolean }) => (p.closed ? "cerrado" : `${p.open}–${p.close}`);
  const grupos: { desde: Dia; hasta: Dia; n: number; texto: string }[] = [];
  for (const d of DIAS_SEMANA) {
    const t = texto(local.dias[d]);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === t) { ultimo.hasta = d; ultimo.n += 1; } else grupos.push({ desde: d, hasta: d, n: 1, texto: t });
  }
  return grupos
    .map((g) => {
      const dias = g.n === 1 ? NOMBRE_DIA[g.desde]
        : g.n === 2 ? `${NOMBRE_DIA[g.desde]} y ${NOMBRE_DIA[g.hasta]}`
        : `${NOMBRE_DIA[g.desde]} a ${NOMBRE_DIA[g.hasta]}`;
      return `${dias} ${g.texto}`;
    })
    .join("; ");
}

export function formatStoreHours(hours: StoreHours, hoy = hoyEnEcuador()): string {
  const fmt = (p: { open: string; close: string; closed: boolean }) =>
    p.closed ? "cerrado" : `${p.open}–${p.close}`;
  const base = negocio.locales
    .map((local) => {
      const h = hours[local.claveHorario];
      if (!h) return null;
      return `${local.nombreCorto}: ${horarioEnPalabras(h)}.`;
    })
    .filter(Boolean)
    .join(" ");

  const limite = new Date(`${hoy}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 21);
  const hasta = limite.toISOString().slice(0, 10);

  const avisos: string[] = [];
  for (const local of Object.keys(hours)) {
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
/**
 * Plantillas de las piezas. «clasica» es la de siempre, teñida con `paleta` y
 * `fuente`. «diaNoche» es la que propuso Depot Tire el 12-sep (render/diaNoche.ts):
 * la única que cambia sola entre clara y oscura, según `modo`.
 */
export const PLANTILLA_NAMES = ["clasica", "diaNoche"] as const;
/** auto = clara de 6:00 a 16:59 y oscura de 17:00 a 5:59 (Quito); dia / noche = siempre esa. */
export const MODO_NAMES = ["auto", "dia", "noche"] as const;

export const PiecesConfigSchema = z.object({
  // "depot" (negro) y "depotRojo" son la paleta medida del cliente
  // (tiredepotec.com) en sus dos variantes; las otras seis son propuestas de
  // estilo. Ver PALETTES en render/depotDesign.ts.
  paleta: z.enum(["grafito", "carbon", "rojo", "verde", "espresso", "navy", "depot", "depotRojo"]).default("grafito"),
  fuente: z.enum(["exo", "barlow", "kanit", "chakra", "saira", "rajdhani", "archivo"]).default("exo"),
  // Un ajuste guardado antes de que existieran queda en la clásica: nada
  // cambia para el negocio hasta que elija otra desde Ajustes.
  plantilla: z.enum(PLANTILLA_NAMES).default("clasica"),
  modo: z.enum(MODO_NAMES).default("auto"),
  // Cómo se nombra la rebaja en la pieza, el PDF y lo que dice el bot
  // (26-oct, feriado: «25 %» → «3x4»). La plata no cambia: sigue saliendo del
  // catálogo. Lo guardado antes de que existiera queda en porcentaje.
  promocion: z.object({ modo: z.enum(MODOS_PROMOCION).default("porcentaje") }).default({ modo: "porcentaje" }),
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
 * Lo último que se leyó de `pieces_config`, sin ir a la base. Para los
 * respaldos síncronos (el texto de la cotización y el PDF de pdfmake) que
 * tienen que nombrar la promoción igual que la pieza: en el turno que los usa,
 * `getPiecesConfig()` ya corrió para renderizarla. Sin lectura previa, el default.
 */
export function piecesConfigEnMemoria(): PiecesConfig {
  return piecesCache?.value ?? DEFAULT_PIECES_CONFIG;
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
      "notificar_vendedor",
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
      "respaldo_marcas",
      "generar_cotizacion",
      "notificar_vendedor",
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
      "respaldo_marcas",
      "generar_cotizacion",
      "notificar_vendedor",
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
      "ubicacion_locales",
      "agendar_visita",
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
      "ubicacion_locales",
      "agendar_visita",
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

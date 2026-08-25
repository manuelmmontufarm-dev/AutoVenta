import { TZDate } from "@date-fns/tz";
import type { Stage } from "./pipeline.js";

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface DayHours {
  open: string;
  close: string;
}

export interface FollowUpPolicy {
  enabled: boolean;
  timezone: string;
  businessHours: Record<number, DayHours | null>;
  enabledStages: Stage[];
  firstDelayMinutes: number;
  secondBeforeCloseMinutes: number;
  minimumGapMinutes: number;
  maxInWindowAttempts: number;
  maxPostWindowAttempts: number;
  postWindowGapMinutes: number;
  advisorAlertDays: number;
  recommendCloseDays: number;
  requireConsent: boolean;
  respectOptOut: boolean;
  neverOutsideHours: boolean;
  maxMessagesPerDay: number;
  pauseOnHumanControl: boolean;
  stagePrompts?: Partial<Record<Stage, string>>;
}

export interface InWindowSchedule {
  windowClosesAt: Date;
  firstDueAt: Date | null;
  secondDueAt: Date | null;
}

function parseTime(value: string): [number, number] {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Horario inválido: ${value}`);
  }
  return [hour, minute];
}

function zonedBoundary(
  source: Date,
  timezone: string,
  time: string,
  dayOffset = 0,
): TZDate {
  const local = new TZDate(source, timezone);
  const noon = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    12,
    0,
    0,
    timezone,
  );
  noon.setDate(noon.getDate() + dayOffset);
  const [hour, minute] = parseTime(time);
  return new TZDate(
    noon.getFullYear(),
    noon.getMonth(),
    noon.getDate(),
    hour,
    minute,
    0,
    timezone,
  );
}

export function isWithinBusinessHours(date: Date, policy: FollowUpPolicy): boolean {
  const local = new TZDate(date, policy.timezone);
  const hours = policy.businessHours[local.getDay()];
  if (!hours) return false;
  const open = zonedBoundary(date, policy.timezone, hours.open);
  const close = zonedBoundary(date, policy.timezone, hours.close);
  return date >= open && date < close;
}

/** Primer instante comercial igual o posterior al candidato. */
export function nextBusinessInstant(candidate: Date, policy: FollowUpPolicy): Date | null {
  if (!policy.neverOutsideHours || isWithinBusinessHours(candidate, policy)) return candidate;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = zonedBoundary(candidate, policy.timezone, "12:00", offset);
    const hours = policy.businessHours[day.getDay()];
    if (!hours) continue;
    const open = zonedBoundary(candidate, policy.timezone, hours.open, offset);
    const close = zonedBoundary(candidate, policy.timezone, hours.close, offset);
    if (candidate < open) return new Date(open.getTime());
    if (candidate < close) return candidate;
  }
  return null;
}

/** Último instante comercial igual o anterior al candidato. */
export function previousBusinessInstant(candidate: Date, policy: FollowUpPolicy): Date | null {
  if (!policy.neverOutsideHours || isWithinBusinessHours(candidate, policy)) return candidate;
  for (let offset = 0; offset >= -7; offset -= 1) {
    const day = zonedBoundary(candidate, policy.timezone, "12:00", offset);
    const hours = policy.businessHours[day.getDay()];
    if (!hours) continue;
    const open = zonedBoundary(candidate, policy.timezone, hours.open, offset);
    const closeExclusive = zonedBoundary(candidate, policy.timezone, hours.close, offset);
    const close = new Date(closeExclusive.getTime() - 60_000);
    if (candidate >= closeExclusive) return new Date(close.getTime());
    if (candidate >= open) return candidate;
  }
  return null;
}

export function computeInWindowSchedule(input: {
  lastCustomerMessageAt: Date;
  lastRelevantBotMessageAt: Date;
  policy: FollowUpPolicy;
  now?: Date;
}): InWindowSchedule {
  const { lastCustomerMessageAt, lastRelevantBotMessageAt, policy } = input;
  const now = input.now ?? new Date();
  const windowClosesAt = new Date(lastCustomerMessageAt.getTime() + WHATSAPP_WINDOW_MS);

  const firstTarget = new Date(
    lastRelevantBotMessageAt.getTime() + policy.firstDelayMinutes * 60_000,
  );
  const adjustedFirst = nextBusinessInstant(firstTarget > now ? firstTarget : now, policy);
  const firstDueAt =
    adjustedFirst && adjustedFirst < windowClosesAt ? adjustedFirst : null;

  const secondTarget = new Date(
    windowClosesAt.getTime() - policy.secondBeforeCloseMinutes * 60_000,
  );
  const adjustedSecond = previousBusinessInstant(secondTarget, policy);
  const minimumSecond = firstDueAt
    ? new Date(firstDueAt.getTime() + policy.minimumGapMinutes * 60_000)
    : now;
  const secondDueAt =
    policy.maxInWindowAttempts >= 2 &&
    firstDueAt &&
    adjustedSecond &&
    adjustedSecond >= minimumSecond &&
    adjustedSecond >= now &&
    adjustedSecond < windowClosesAt
      ? adjustedSecond
      : null;

  return { windowClosesAt, firstDueAt, secondDueAt };
}

const OPT_OUT_PATTERNS = [
  /\bno\s+me\s+(?:escribas|contactes|mensajes)\b/i,
  /\bdeja\s+de\s+escribirme\b/i,
  /\b(?:stop|baja|cancelar suscripci[oó]n)\b/i,
];

const NEGATIVE_PATTERNS = [
  /\b(?:molesto|molesta|fastidia|fastidiando|acosando)\b/i,
  /\bno\s+insistas\b/i,
  /\bya\s+te\s+dije\s+que\s+no\b/i,
];

/**
 * «Molestar», en Ecuador, casi nunca es enojo: es la fórmula de cortesía para
 * pedir algo o para avisar que uno va a pasar por el local. Es, de hecho, lo
 * contrario de un cliente molesto — solo escribe así quien piensa venir.
 *
 * Lo destapó el ticket 10438 (25-ago-2026): «ya que me entreguen les molesto
 * para visitarlos por favor» es un cliente CONTENTO anunciando su visita, y el
 * bot lo mandó al asesor como CLIENTE MOLESTO, pausó el hilo para siempre y
 * canceló la campaña. Ese es el precio de cada falso positivo aquí.
 *
 * La diferencia no está en la palabra sino en la gramática:
 *  · VERBO con pronombre de 2ª/3ª persona → cortesía. «les molesto», «le
 *    molesto con una cotización», «molesto con el precio», «si no le molesta».
 *  · ADJETIVO de estado → molestia de verdad. «estoy molesto», «la clienta
 *    está molesta», «me tienen molesto», «me molesta que me escriban tanto».
 *
 * El orden importa: primero se busca la molestia de estado, que gana siempre
 * («disculpe que le moleste, pero estoy molesto con el trato» sí es queja), y
 * solo si no aparece se tachan los usos corteses para juzgar lo que queda.
 */
const MOLESTIA_DE_ESTADO = [
  // «estoy molesto», «la clienta está muy molesta», «andan molestos».
  /\b(?:estoy|est[aá]|est[aá]n|estamos|estaba|estuve|sigue|siguen|anda|andan|es|son|parece)\s+(?:muy\s+|bien\s+|tan\s+|s[uú]per\s+|bastante\s+|algo\s+|medio\s+|un\s+poco\s+)?molest[oa]s?\b/i,
  // Sin verbo, solo el intensificador: «qué molesto», «bien molesta la cosa».
  /\b(?:muy|bien|tan|bastante|s[uú]per|qu[eé])\s+molest[oa]s?\b/i,
  // «me tienen molesto», «me dejaron molesta», «me pone molesto».
  /\bme\s+(?:tiene[ns]?|dej[oóaó]\w*|pone|ponen|puso|pusieron)\s+molest[oa]s?\b/i,
  // «me molesta que...». Ojo: «no me molesta» es lo contrario, y queda fuera.
  /(?<!\bno\s)\bme\s+molesta\b/i,
];

const CORTESIA_MOLESTAR = [
  // «les molesto», «le molestaré mañana», «te molesto de nuevo», «le molesta si...».
  /\b(?:le|les|te|lo|los|la|las)\s+molest(?:o|a|amos|e|en|é|ar[eé]|ar[ií]a|aba)\b/gi,
  // Ecuatoriano puro, sin pronombre: «Molesto con una cotización, por favor».
  /\bmolest(?:o|amos|ando)\s+(?:con|por|para|nuevamente|otra\s+vez|de\s+nuevo)\b/gi,
  // «disculpe la molestia», «disculpe que le moleste», «perdón por molestar».
  /\b(?:disculp\w+|perd[oó]n\w*|perdone\w*|siento|lamento)\s+(?:que\s+)?(?:por\s+)?(?:la\s+|el\s+)?(?:le|les|te|lo|los|nos)?\s*molest\w*/gi,
  // «no quiero molestar», «espero no molestarles», «vuelvo a molestarles».
  /\b(?:no\s+quiero|espero\s+no|para\s+no|vuelvo\s+a|volver\s+a|sigo)\s+molest\w*/gi,
  // «si no le molesta», «no me molesta para nada».
  /\bno\s+(?:le|les|te|me)\s+molesta\b/gi,
];

/** El texto sin los usos corteses de «molestar»: lo que de verdad hay que juzgar. */
function sinCortesiaMolestar(text: string): string {
  return CORTESIA_MOLESTAR.reduce((acc, pattern) => acc.replace(pattern, " "), text);
}

export function detectOptOut(text: string): boolean {
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectNegativeSentiment(text: string): boolean {
  if (MOLESTIA_DE_ESTADO.some((pattern) => pattern.test(text))) return true;
  const juzgable = sinCortesiaMolestar(text);
  return NEGATIVE_PATTERNS.some((pattern) => pattern.test(juzgable));
}

export function followUpTemplateForStage(stage: Stage): string {
  if (stage === "cotizacion_enviada") return "seguimiento_cotizacion_v1";
  if (stage === "seguimiento_venta") return "recordatorio_visita_v1";
  return "seguimiento_opciones_v1";
}

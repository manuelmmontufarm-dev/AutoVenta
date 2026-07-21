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

export function detectOptOut(text: string): boolean {
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectNegativeSentiment(text: string): boolean {
  return NEGATIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function followUpTemplateForStage(stage: Stage): string {
  if (stage === "cotizacion_enviada") return "seguimiento_cotizacion_v1";
  if (stage === "seguimiento_venta") return "recordatorio_visita_v1";
  return "seguimiento_opciones_v1";
}

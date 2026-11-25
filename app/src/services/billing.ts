/**
 * Cuenta de tokens y facturación mensual del servicio.
 *
 * El costo sale de `ai_runs` (tokens reales por corrida) multiplicado por la
 * tarifa de OpenAI por modelo. Todos los cortes de día/mes usan la hora de
 * Guayaquil. El mes de agosto 2026 empieza el 12 (arranque del servicio).
 *
 * Marcar un mes como pagado exige la clave de dueño (OWNER_KEY), distinta de
 * la ADMIN_KEY que tiene el cliente: solo Manuel puede marcar pagos.
 */
import { sql } from "../db/client.js";

const TZ = "America/Guayaquil";
export const IVA = Number(process.env.BILLING_IVA ?? "0.15");
export const MANTENIMIENTO_USD = Number(process.env.BILLING_MANTENIMIENTO ?? "80");
/** Primer día facturable del servicio (YYYY-MM-DD, hora Guayaquil). */
export const BILLING_START = process.env.BILLING_START ?? "2026-08-12";

/**
 * Tarifas USD por millón de tokens. OpenAI: verificadas ago-2026 contra
 * openai.com. Claude: verificadas el 22-nov-2026 contra
 * platform.claude.com/docs/en/about-claude/pricing.
 *
 * `cacheWrite` es lo que cuesta ESCRIBIR al caché (5 minutos): solo Claude lo
 * cobra, 1,25× la entrada. Sin ese renglón la cuenta de un modelo Claude sale
 * más barata de lo que llega en la factura de Anthropic.
 */
type Tarifa = { input: number; cachedInput: number; output: number; cacheWrite?: number };
const TARIFAS: Record<string, Tarifa> = {
  // Los ids más largos primero: `tarifaDe` busca por prefijo y
  // «claude-opus-5-5» también empieza con «claude-opus-5».
  "claude-fable-5-2": { input: 8, cachedInput: 0.2, output: 40, cacheWrite: 10 },
  "claude-opus-5-5": { input: 4, cachedInput: 0.2, output: 20, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, cachedInput: 0.1, output: 10, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, cachedInput: 0.01, output: 0.5, cacheWrite: 0.125 },
  "claude-opus-5": { input: 5, cachedInput: 0.5, output: 25, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, cachedInput: 0.5, output: 25, cacheWrite: 6.25 },
  "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.5-mini": { input: 1, cachedInput: 0.1, output: 6 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-transcribe": { input: 2.5, cachedInput: 2.5, output: 10 },
};
/** Modelo sin tarifa conocida: se cobra como el más caro para no regalar tokens. */
const TARIFA_DEFECTO: Tarifa = TARIFAS["gpt-5.5"];

export function tarifaDe(model: string): Tarifa {
  if (TARIFAS[model]) return TARIFAS[model];
  const base = Object.keys(TARIFAS).find((k) => model.startsWith(k));
  if (base) return TARIFAS[base];
  return model.startsWith("claude-") ? TARIFAS["claude-fable-5-2"] : TARIFA_DEFECTO;
}

/**
 * Lo que costó una corrida (o una suma de corridas del MISMO modelo), en USD.
 * `input` es el total de entrada: incluye lo leído del caché y lo escrito.
 */
export function costoEnUsd(
  model: string,
  tokens: { input: number; cached: number; cacheWrite?: number; output: number },
): number {
  const t = tarifaDe(model);
  const cached = Math.min(tokens.cached, tokens.input);
  const escritos = Math.min(tokens.cacheWrite ?? 0, tokens.input - cached);
  return (
    (tokens.input - cached - escritos) * t.input
    + cached * t.cachedInput
    + escritos * (t.cacheWrite ?? t.input)
    + tokens.output * t.output
  ) / 1_000_000;
}

export interface UsoPeriodo {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  runs: number;
  usd: number;
  usdConIva: number;
}

interface FilaUso {
  model: string;
  runs: string;
  inp: string | null;
  cached: string | null;
  escritos: string | null;
  outp: string | null;
}

/** Suma tokens y costo entre dos fechas locales (YYYY-MM-DD, fin exclusivo). */
async function usoEntre(desde: string, hastaExcl: string): Promise<UsoPeriodo> {
  const rows = await sql<FilaUso[]>`
    select model,
           count(*)                        as runs,
           sum(input_tokens)               as inp,
           sum(cached_input_tokens)        as cached,
           sum(cache_write_tokens)         as escritos,
           sum(output_tokens)              as outp
    from ai_runs
    where (created_at at time zone ${TZ})::date >= ${desde}::date
      and (created_at at time zone ${TZ})::date < ${hastaExcl}::date
    group by model
  `;
  const uso: UsoPeriodo = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, runs: 0, usd: 0, usdConIva: 0 };
  for (const row of rows) {
    const inp = Number(row.inp ?? 0);
    const cached = Math.min(Number(row.cached ?? 0), inp);
    const outp = Number(row.outp ?? 0);
    // La entrada se guarda INCLUYENDO lo cacheado (así la reporta OpenAI, y a
    // eso se normaliza Claude): se descuenta del precio pleno y se cobra a
    // tarifa de caché; lo escrito al caché, a la suya.
    uso.usd += costoEnUsd(row.model, { input: inp, cached, cacheWrite: Number(row.escritos ?? 0), output: outp });
    uso.inputTokens += inp;
    uso.cachedInputTokens += cached;
    uso.outputTokens += outp;
    uso.runs += Number(row.runs);
  }
  uso.usd = redondear(uso.usd);
  uso.usdConIva = redondear(uso.usd * (1 + IVA));
  return uso;
}

/**
 * Lo que costó un grupo de corridas de un modelo, en USD sin IVA. La misma
 * cuenta que la factura mensual, para que el saldo estimado (services/saldoDeIA.ts)
 * no se calcule con otra tarifa.
 */
export function costoDeTokens(model: string, inputTokens: number, cachedInputTokens: number, outputTokens: number): number {
  return costoEnUsd(model, { input: inputTokens, cached: Math.min(cachedInputTokens, inputTokens), output: outputTokens });
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fecha local Guayaquil YYYY-MM-DD, con desplazamiento opcional en días. */
function hoyLocal(offsetDias = 0): string {
  const ahora = new Date(Date.now() + offsetDias * 86_400_000);
  return ahora.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Primer viernes del mes (period 'YYYY-MM') en YYYY-MM-DD. */
export function primerViernes(period: string): string {
  const [y, m] = period.split("-").map(Number);
  // Date.UTC evita sorpresas de zona local del servidor: solo importa el día de semana.
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const dia = primero.getUTCDay();
  const viernes = 1 + ((5 - dia + 7) % 7);
  return `${period}-${String(viernes).padStart(2, "0")}`;
}

function mesSiguiente(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export interface MesFacturado {
  period: string;
  desde: string;
  hasta: string;
  uso: UsoPeriodo;
  ivaTokens: number;
  mantenimiento: number;
  ivaMantenimiento: number;
  total: number;
  vence: string;
  enCurso: boolean;
  pagado: boolean;
  pagadoEl: string | null;
}

/** Todos los meses desde el arranque del servicio hasta el actual. */
export async function mesesFacturados(): Promise<MesFacturado[]> {
  const pagosRows = await sql<{ period: string; paid_at: string | null; snapshot: unknown }[]>`
    select period, paid_at, snapshot from billing_months
  `;
  const pagos = new Map(pagosRows.map((r) => [r.period, r]));

  const mesActual = hoyLocal().slice(0, 7);
  const meses: MesFacturado[] = [];
  let period = BILLING_START.slice(0, 7);
  while (period <= mesActual) {
    const desde = period === BILLING_START.slice(0, 7) ? BILLING_START : `${period}-01`;
    const hastaExcl = `${mesSiguiente(period)}-01`;
    const pago = pagos.get(period);
    const snap = pago?.paid_at ? (pago.snapshot as MesFacturado | null) : null;
    if (snap && snap.total !== undefined) {
      // Mes ya pagado: se muestra lo que se cobró, congelado.
      meses.push({ ...snap, pagado: true, pagadoEl: pago!.paid_at, enCurso: false });
    } else {
      const uso = await usoEntre(desde, hastaExcl);
      const ivaTokens = redondear(uso.usd * IVA);
      const ivaMantenimiento = redondear(MANTENIMIENTO_USD * IVA);
      meses.push({
        period,
        desde,
        hasta: hoyLocal() < hastaExcl ? hoyLocal() : `${period}-${diasDelMes(period)}`,
        uso,
        ivaTokens,
        mantenimiento: MANTENIMIENTO_USD,
        ivaMantenimiento,
        total: redondear(uso.usd + ivaTokens + MANTENIMIENTO_USD + ivaMantenimiento),
        vence: primerViernes(mesSiguiente(period)),
        enCurso: period === mesActual,
        pagado: Boolean(pago?.paid_at),
        pagadoEl: pago?.paid_at ?? null,
      });
    }
    period = mesSiguiente(period);
  }
  return meses.reverse();
}

function diasDelMes(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface ResumenBilling {
  hoy: UsoPeriodo;
  semana: UsoPeriodo;
  mes: UsoPeriodo;
  ivaPorc: number;
  mantenimiento: number;
  inicioServicio: string;
  meses: MesFacturado[];
}

export async function resumenBilling(): Promise<ResumenBilling> {
  const hoy = hoyLocal();
  const maniana = hoyLocal(1);
  const mesActual = hoy.slice(0, 7);
  const inicioMes = mesActual === BILLING_START.slice(0, 7) ? BILLING_START : `${mesActual}-01`;
  const [usoHoy, usoSemana, usoMes, meses] = await Promise.all([
    usoEntre(hoy, maniana),
    usoEntre(hoyLocal(-6), maniana),
    usoEntre(inicioMes, maniana),
    mesesFacturados(),
  ]);
  return {
    hoy: usoHoy,
    semana: usoSemana,
    mes: usoMes,
    ivaPorc: IVA,
    mantenimiento: MANTENIMIENTO_USD,
    inicioServicio: BILLING_START,
    meses,
  };
}

/**
 * Marca (o desmarca) un mes como pagado. Congela el snapshot al marcar para
 * que el reporte histórico no se mueva aunque cambien tarifas después.
 */
export async function marcarPagado(period: string, pagado: boolean, por: string): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Periodo inválido: usa YYYY-MM");
  if (!pagado) {
    await sql`update billing_months set paid_at = null, paid_by = null, snapshot = null where period = ${period}`;
    return;
  }
  const meses = await mesesFacturados();
  const mes = meses.find((m) => m.period === period);
  if (!mes) throw new Error(`El periodo ${period} no existe en la cuenta`);
  await sql`
    insert into billing_months (period, paid_at, paid_by, snapshot)
    values (${period}, now(), ${por}, ${sql.json(mes as never)})
    on conflict (period) do update
      set paid_at = now(), paid_by = ${por}, snapshot = ${sql.json(mes as never)}
  `;
}

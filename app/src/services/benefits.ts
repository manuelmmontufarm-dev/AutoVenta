/**
 * Bloque *INCLUYE* — lo que los vendedores humanos mandan después de cada
 * precio, y que hoy el bot no dice nunca.
 *
 * Vive en tabla, no en el prompt: el §8 del PDF exige que una promoción se
 * pueda cambiar o dar de baja sin tocar código. Cada beneficio se filtra por sus
 * condiciones antes de mostrarse, para que el bot no prometa un descuento por
 * volumen a quien compra una sola llanta ni una promo de marca a otra marca.
 */
import { sql } from "../db/client.js";

export interface Benefit {
  id: number;
  text: string;
  position: number;
  active: boolean;
  brand: string | null;
  minQuantity: number | null;
  store: string | null;
  startsAt: string | null;
  expiresAt: string | null;
}

export interface BenefitContext {
  brands?: readonly string[];
  quantity?: number | null;
  store?: string | null;
}

interface BenefitRow {
  id: number;
  text: string;
  position: number;
  active: boolean;
  brand: string | null;
  min_quantity: number | null;
  store: string | null;
  starts_at: Date | null;
  expires_at: Date | null;
}

const CACHE_TTL_MS = 30_000;
let cache: { value: Benefit[]; at: number } | null = null;

/** Todos los beneficios, incluidos los inactivos y vencidos (vista del panel). */
export async function listBenefits(): Promise<Benefit[]> {
  const rows = await sql<BenefitRow[]>`
    select id, text, position, active, brand, min_quantity, store, starts_at, expires_at
    from benefits
    order by position, id
  `;
  return rows.map(publicBenefit);
}

/** Solo los vigentes y activos, en orden. Cacheado: se consulta en cada cotización. */
export async function getActiveBenefits(): Promise<Benefit[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const rows = await sql<BenefitRow[]>`
    select id, text, position, active, brand, min_quantity, store, starts_at, expires_at
    from benefits
    where active
      and (starts_at is null or starts_at <= now())
      and (expires_at is null or expires_at > now())
    order by position, id
  `;
  const value = rows.map(publicBenefit);
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateBenefitsCache(): void {
  cache = null;
}

/** Filtra por marca, cantidad y sucursal del caso concreto. */
export function applicableBenefits(
  benefits: readonly Benefit[],
  ctx: BenefitContext = {},
): Benefit[] {
  const brands = (ctx.brands ?? []).map((brand) => brand.toLowerCase());
  const store = ctx.store?.toLowerCase() ?? null;
  return benefits.filter((benefit) => {
    if (benefit.brand && !brands.includes(benefit.brand.toLowerCase())) return false;
    if (benefit.minQuantity != null && (ctx.quantity ?? 0) < benefit.minQuantity) return false;
    if (benefit.store && benefit.store.toLowerCase() !== store) return false;
    return true;
  });
}

/**
 * El bloque listo para WhatsApp, o "" si no aplica ninguno. Cadena vacía es
 * información: significa que no hay nada que prometer, y el bot no debe
 * inventar un beneficio para llenar el hueco.
 */
export function formatBenefitsBlock(benefits: readonly Benefit[]): string {
  if (!benefits.length) return "";
  return ["*INCLUYE*", ...benefits.map((benefit) => `- ${benefit.text}`)].join("\n");
}

/** Atajo: consulta, filtra y formatea. Es lo que usan las tools. */
export async function buildBenefitsBlock(ctx: BenefitContext = {}): Promise<string> {
  const textos = await applicableBenefitTexts(ctx);
  if (!textos.length) return "";
  return ["*INCLUYE*", ...textos.map((texto) => `- ${texto}`)].join("\n");
}

/** Los mismos beneficios, en lista — es lo que dibuja la pieza de cotización. */
export async function applicableBenefitTexts(ctx: BenefitContext = {}): Promise<string[]> {
  try {
    return applicableBenefits(await getActiveBenefits(), ctx).map((benefit) => benefit.text);
  } catch (error) {
    // Un beneficio que no se pudo leer no puede tumbar una cotización.
    console.error("⚠️ No se pudieron leer los beneficios:", error);
    return [];
  }
}

export interface BenefitInput {
  text: string;
  position?: number;
  active?: boolean;
  brand?: string | null;
  minQuantity?: number | null;
  store?: string | null;
  expiresAt?: string | null;
}

export async function createBenefit(input: BenefitInput): Promise<Benefit> {
  if (!input.text?.trim()) throw new Error("El texto del beneficio es obligatorio");
  const [row] = await sql<BenefitRow[]>`
    insert into benefits (text, position, active, brand, min_quantity, store, expires_at)
    values (
      ${input.text.trim()},
      ${input.position ?? 0},
      ${input.active ?? true},
      ${input.brand?.trim() || null},
      ${input.minQuantity ?? null},
      ${input.store?.trim() || null},
      ${input.expiresAt ? new Date(input.expiresAt) : null}
    )
    returning id, text, position, active, brand, min_quantity, store, starts_at, expires_at
  `;
  invalidateBenefitsCache();
  return publicBenefit(row);
}

export async function updateBenefit(id: number, input: BenefitInput): Promise<Benefit> {
  const [row] = await sql<BenefitRow[]>`
    update benefits set
      text = ${input.text.trim()},
      position = ${input.position ?? 0},
      active = ${input.active ?? true},
      brand = ${input.brand?.trim() || null},
      min_quantity = ${input.minQuantity ?? null},
      store = ${input.store?.trim() || null},
      expires_at = ${input.expiresAt ? new Date(input.expiresAt) : null},
      updated_at = now()
    where id = ${id}
    returning id, text, position, active, brand, min_quantity, store, starts_at, expires_at
  `;
  if (!row) throw new Error("Beneficio no encontrado");
  invalidateBenefitsCache();
  return publicBenefit(row);
}

export async function deleteBenefit(id: number): Promise<void> {
  await sql`delete from benefits where id = ${id}`;
  invalidateBenefitsCache();
}

function publicBenefit(row: BenefitRow): Benefit {
  return {
    id: Number(row.id),
    text: row.text,
    position: Number(row.position),
    active: row.active,
    brand: row.brand,
    minQuantity: row.min_quantity == null ? null : Number(row.min_quantity),
    store: row.store,
    startsAt: row.starts_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
  };
}

/**
 * Posicionamiento comercial por marca.
 *
 * Alimenta dos cosas distintas con la misma fuente: lo que las piezas dibujan
 * (etiqueta y frase) y lo que el bot puede afirmar en el chat (`notasIa`). Que
 * sea la misma tabla evita que la imagen diga una cosa y el bot otra.
 */
import { sql } from "../db/client.js";
import { DEFAULT_BRAND_PROFILES, normalizeBrand } from "../render/depotDesign.js";

export interface BrandProfileRecord {
  brand: string;
  tag: string;
  posicionamiento: string;
  /** Contexto para el agente: qué puede afirmar de esta marca. */
  notasIa: string;
  fuente: string | null;
  active: boolean;
  position: number;
}

interface Row {
  brand: string;
  tag: string;
  posicionamiento: string;
  notas_ia: string;
  fuente: string | null;
  active: boolean;
  position: number;
}

const CACHE_TTL_MS = 30_000;
let cache: { value: BrandProfileRecord[]; at: number } | null = null;

export function invalidateBrandProfilesCache(): void {
  cache = null;
}

export async function listBrandProfiles(): Promise<BrandProfileRecord[]> {
  const rows = await sql<Row[]>`
    select brand, tag, posicionamiento, notas_ia, fuente, active, position
    from brand_profiles order by position, brand
  `;
  return rows.map(publicProfile);
}

async function activeProfiles(): Promise<BrandProfileRecord[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const rows = await sql<Row[]>`
    select brand, tag, posicionamiento, notas_ia, fuente, active, position
    from brand_profiles where active order by position, brand
  `;
  const value = rows.map(publicProfile);
  cache = { value, at: Date.now() };
  return value;
}

/**
 * Perfiles listos para el render, indexados por marca en mayúsculas.
 * Si la tabla no se puede leer, caen los del diseño: una pieza sin etiqueta se
 * ve incompleta, pero una pieza que no sale es peor.
 */
export async function brandProfilesForRender(): Promise<
  Record<string, { tag: string; posicionamiento: string }>
> {
  try {
    const rows = await activeProfiles();
    if (!rows.length) return DEFAULT_BRAND_PROFILES;
    return Object.fromEntries(
      rows.map((row) => [
        normalizeBrand(row.brand),
        { tag: row.tag, posicionamiento: row.posicionamiento },
      ]),
    );
  } catch (error) {
    console.error("⚠️ No se pudieron leer los perfiles de marca:", error);
    return DEFAULT_BRAND_PROFILES;
  }
}

/** Bloque para el prompt del agente. "" si el negocio no cargó notas. */
export async function brandProfilesPromptBlock(): Promise<string> {
  try {
    const rows = (await activeProfiles()).filter((row) => row.notasIa.trim());
    if (!rows.length) return "";
    return [
      "MARCAS DEL CATÁLOGO (lo que el negocio autoriza afirmar):",
      ...rows.map((row) =>
        `- ${row.brand}${row.tag ? ` · ${row.tag}` : ""}: ${row.notasIa}${row.fuente ? ` (fuente: ${row.fuente})` : ""}`),
      "No atribuyas a una marca ninguna ventaja que no esté en esta lista ni en una ficha técnica verificada.",
    ].join("\n");
  } catch {
    return "";
  }
}

export async function saveBrandProfile(input: {
  brand: string;
  tag?: string;
  posicionamiento?: string;
  notasIa?: string;
  fuente?: string | null;
  active?: boolean;
  position?: number;
}): Promise<BrandProfileRecord> {
  const brand = normalizeBrand(input.brand);
  if (!brand) throw new Error("La marca es obligatoria");
  const [row] = await sql<Row[]>`
    insert into brand_profiles (brand, tag, posicionamiento, notas_ia, fuente, active, position)
    values (
      ${brand}, ${input.tag ?? ""}, ${input.posicionamiento ?? ""}, ${input.notasIa ?? ""},
      ${input.fuente ?? null}, ${input.active ?? true}, ${input.position ?? 0}
    )
    on conflict (brand) do update set
      tag = excluded.tag,
      posicionamiento = excluded.posicionamiento,
      notas_ia = excluded.notas_ia,
      fuente = excluded.fuente,
      active = excluded.active,
      position = excluded.position,
      updated_at = now()
    returning brand, tag, posicionamiento, notas_ia, fuente, active, position
  `;
  invalidateBrandProfilesCache();
  return publicProfile(row);
}

export async function deleteBrandProfile(brand: string): Promise<void> {
  await sql`delete from brand_profiles where brand = ${normalizeBrand(brand)}`;
  invalidateBrandProfilesCache();
}

function publicProfile(row: Row): BrandProfileRecord {
  return {
    brand: row.brand,
    tag: row.tag,
    posicionamiento: row.posicionamiento,
    notasIa: row.notas_ia,
    fuente: row.fuente,
    active: row.active,
    position: Number(row.position),
  };
}

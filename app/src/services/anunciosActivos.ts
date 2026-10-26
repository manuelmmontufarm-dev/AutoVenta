import { sql } from "../db/client.js";
import {
  AnunciosActivosSchema,
  podarVencidos,
  vigentes,
  type AnuncioActivo,
} from "../domain/anunciosActivos.js";

/**
 * Los anuncios que Depot cargó en Ajustes → Negocio → Anuncios. Viven en
 * `settings.anuncios_activos` (sin migración). Cache de 30 s como los demás
 * ajustes: el vendedor lo lee en cada turno.
 */
const CACHE_TTL_MS = 30_000;
let cache: { value: AnuncioActivo[]; at: number } | null = null;

/** YYYY-MM-DD en Guayaquil: «hasta» se cuenta con el día del negocio, no el UTC. */
export function hoyEnGuayaquil(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(ahora);
}

export async function getAnunciosActivos(): Promise<AnuncioActivo[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'anuncios_activos'`;
    const parsed = AnunciosActivosSchema.safeParse(row?.value ?? []);
    const value = parsed.success ? parsed.data : [];
    cache = { value, at: Date.now() };
    return value;
  } catch {
    // Sin poder leerlo el bot sigue como antes: sin anuncios cargados.
    return [];
  }
}

/** Lo que el vendedor y el Guardián pueden usar hoy. */
export async function getAnunciosVigentes(): Promise<AnuncioActivo[]> {
  return vigentes(await getAnunciosActivos(), hoyEnGuayaquil());
}

/** Valida la lista completa (lanza con el mensaje de zod) y la guarda. */
export async function saveAnunciosActivos(input: unknown): Promise<AnuncioActivo[]> {
  const lista = podarVencidos(AnunciosActivosSchema.parse(input), hoyEnGuayaquil());
  await sql`
    insert into settings (key, value)
    values ('anuncios_activos', ${sql.json(lista)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  cache = { value: lista, at: Date.now() };
  return lista;
}

export interface AnuncioVisto {
  sourceId: string | null;
  titulo: string | null;
  texto: string | null;
  url: string | null;
  chats: number;
  ultimo: string;
}

/** Anuncios que trajeron chats en los últimos `dias` días. Solo lee. */
export async function anunciosVistos(dias = 14): Promise<AnuncioVisto[]> {
  const filas = await sql<{
    source_id: string | null; titulo: string | null; texto: string | null; url: string | null;
    chats: string; ultimo: Date;
  }[]>`
    select metadata->'anuncio'->>'sourceId' as source_id,
           metadata->'anuncio'->>'titulo' as titulo,
           metadata->'anuncio'->>'texto' as texto,
           max(metadata->'anuncio'->>'url') as url,
           count(distinct conversation_id) as chats,
           max(created_at) as ultimo
    from messages
    where direction = 'inbound' and metadata ? 'anuncio'
      and created_at > now() - make_interval(days => ${dias})
    group by 1, 2, 3
    order by max(created_at) desc
    limit 100
  `;
  return filas.map((f) => ({
    sourceId: f.source_id,
    titulo: f.titulo,
    texto: f.texto,
    url: f.url,
    chats: Number(f.chats),
    ultimo: f.ultimo.toISOString(),
  }));
}

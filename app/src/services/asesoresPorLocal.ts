import { z } from "zod";
import { sql } from "../db/client.js";
import { negocio } from "../negocio/index.js";

/**
 * Qué asesores atienden cada local (R-34).
 *
 * En el pitch del 4-nov se prometió «avisa al asesor correcto»: Mundillantas
 * tiene 3 locales con gente distinta y un aviso de visita en el local
 * equivocado no lo atiende nadie. La asignación vive en
 * `settings.asesores_por_local` como `{ [slugDeLocal]: [advisorId, …] }` —
 * clave de `settings` y no una migración, porque es configuración que el dueño
 * toca desde Ajustes y el simulador ya copia la tabla entera.
 *
 * Depot no asigna a nadie, y por eso no cambia: sin asignación, todos los
 * asesores siguen recibiendo todo, que es lo de hoy.
 */
export type AsignacionesPorLocal = Record<string, number[]>;

const AsignacionesSchema = z.record(
  z.string().min(1).max(60),
  z.array(z.number().int().positive()).max(50),
);

const CACHE_TTL_MS = 30_000;
let cache: { value: AsignacionesPorLocal; at: number } | null = null;

/** Los locales del negocio a los que se puede asignar gente, para el panel. */
export function localesAsignables(): Array<{ slug: string; nombreCorto: string }> {
  return negocio.locales.map((l) => ({ slug: l.slug, nombreCorto: l.nombreCorto }));
}

/**
 * Quita las asignaciones de locales que ya no existen en el perfil, y dice
 * cuáles quitó. Pura: quien la llama decide si eso es un log o un error.
 */
export function podarAsignaciones(
  asignaciones: AsignacionesPorLocal,
  slugsValidos: string[],
): { asignaciones: AsignacionesPorLocal; ignoradas: string[] } {
  const validas: AsignacionesPorLocal = {};
  const ignoradas: string[] = [];
  for (const [slug, ids] of Object.entries(asignaciones)) {
    if (slugsValidos.includes(slug)) validas[slug] = ids;
    else ignoradas.push(slug);
  }
  return { asignaciones: validas, ignoradas };
}

/**
 * LA REGLA DE ENRUTAMIENTO, pura para probarla caso por caso:
 *
 *  · sin local elegido → todos (el primer aviso de cotización suele llegar
 *    antes de que el cliente elija local);
 *  · local sin asignación → todos (Depot hoy);
 *  · local con asignación → solo los asesores asignados a ese local;
 *  · un asesor sin `id` (el respaldo del entorno) pasa siempre: no se le puede
 *    asignar local y dejarlo fuera sería callar el único aviso que quedaba;
 *  · si el filtro deja la lista vacía (los asignados ya no están activos), se
 *    vuelve a todos: un aviso de más se nota y se corrige; uno que no sale, no.
 */
export function asesoresDelLocal<T extends { id?: number }>(
  asesores: T[],
  asignaciones: AsignacionesPorLocal,
  slugDeLocal: string | null,
  slugsValidos: string[] = negocio.locales.map((l) => l.slug),
): T[] {
  if (!slugDeLocal) return asesores;
  const { asignaciones: validas } = podarAsignaciones(asignaciones, slugsValidos);
  const ids = validas[slugDeLocal] ?? [];
  if (!ids.length) return asesores;
  const filtrados = asesores.filter((a) => a.id === undefined || ids.includes(a.id));
  return filtrados.length ? filtrados : asesores;
}

/** Las asignaciones guardadas; las de locales que ya no existen se avisan y se ignoran. */
export async function getAsesoresPorLocal(): Promise<AsignacionesPorLocal> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  let value: AsignacionesPorLocal = {};
  try {
    const [row] = await sql<{ value: unknown }[]>`select value from settings where key = 'asesores_por_local'`;
    const parsed = AsignacionesSchema.safeParse(row?.value ?? {});
    if (parsed.success) {
      const { asignaciones, ignoradas } = podarAsignaciones(
        parsed.data,
        negocio.locales.map((l) => l.slug),
      );
      if (ignoradas.length) {
        console.warn(`⚠️ asesores_por_local tiene locales que ya no existen en el perfil (se ignoran): ${ignoradas.join(", ")}`);
      }
      value = asignaciones;
    }
  } catch {
    // Sin poder leerlo, se avisa a todos: es lo de hoy y nadie se queda sin aviso.
  }
  cache = { value, at: Date.now() };
  return value;
}

/** Valida y guarda. Un slug que no es de un local del negocio se rechaza con su nombre. */
export async function saveAsesoresPorLocal(input: unknown): Promise<AsignacionesPorLocal> {
  const value = AsignacionesSchema.parse(input ?? {});
  const slugs = negocio.locales.map((l) => l.slug);
  const desconocidos = Object.keys(value).filter((slug) => !slugs.includes(slug));
  if (desconocidos.length) {
    throw new Error(`Estos locales no existen en el negocio: ${desconocidos.join(", ")}. Locales: ${slugs.join(", ")}.`);
  }
  await sql`
    insert into settings (key, value) values ('asesores_por_local', ${sql.json(value)})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  cache = { value, at: Date.now() };
  return value;
}

/** Solo para pruebas: fuerza a releer de la base. */
export function olvidarAsesoresPorLocal(): void {
  cache = null;
}

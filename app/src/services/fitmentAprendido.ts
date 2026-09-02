/**
 * Lo que el bot investigó una vez, anotado para no volver a investigarlo.
 *
 * Pedido de Manuel (1-sep-2026): «cada vez que el modelo busca una llanta,
 * que se la anote en la tabla». La tabla del repo (`aplicaciones-vehiculos.json`)
 * no se puede escribir desde producción —el disco de Railway se borra en cada
 * deploy—, así que lo aprendido vive en Postgres y se consulta ANTES de ir a
 * la web. El script `tools/exportar-fitment-aprendido.mjs` lo vuelca a JSON
 * para que Joaquín lo revise y lo pase a la tabla del repo con su confianza.
 *
 * Solo se guarda lo que la investigación trajo con confianza alta o media:
 * anotar una medida «baja» sería consolidar una adivinanza.
 */
import { sql } from "../db/client.js";
import { palabrasDeModelo } from "../domain/fitment.js";
import type { CandidatoFitment } from "../domain/fitmentResearch.js";

export interface FitmentAprendido {
  sizes: string[];
  candidatos: CandidatoFitment[];
  note: string | null;
  nextQuestion: string | null;
  sources: Array<{ title: string; url: string }>;
  provider: string;
  hits: number;
}

const enPruebas = () => process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

/** Clave estable: «Suzuki» + «Gran Vitara SZ 4x2» → suzuki|grand vitara sz. */
export function claveDeVehiculo(make: string, model: string): { marca: string; modelo: string } {
  const marca = palabrasDeModelo(make).join(" ") || make.trim().toLowerCase();
  const palabrasMarca = new Set(palabrasDeModelo(make));
  const modelo = palabrasDeModelo(model).filter((p) => !palabrasMarca.has(p)).join(" ")
    || model.trim().toLowerCase();
  return { marca, modelo };
}

export async function buscarFitmentAprendido(
  make: string,
  model: string,
  year: number | null,
): Promise<FitmentAprendido | null> {
  if (enPruebas()) return null;
  const { marca, modelo } = claveDeVehiculo(make, model);
  try {
    const [fila] = await sql<{
      sizes: unknown; candidatos: unknown; note: string | null; next_question: string | null;
      sources: unknown; provider: string; hits: number; id: number;
    }[]>`
      select id, sizes, candidatos, note, next_question, sources, provider, hits
      from vehicle_fitment_learned
      where make_key=${marca} and model_key=${modelo}
        and (year_key is null or ${year ?? null}::int is null or year_key=${year ?? null})
      order by (year_key = ${year ?? null}) desc nulls last, updated_at desc
      limit 1
    `;
    if (!fila) return null;
    await sql`update vehicle_fitment_learned set hits = hits + 1, updated_at = now() where id=${fila.id}`;
    return {
      sizes: Array.isArray(fila.sizes) ? (fila.sizes as string[]) : [],
      candidatos: Array.isArray(fila.candidatos) ? (fila.candidatos as CandidatoFitment[]) : [],
      note: fila.note,
      nextQuestion: fila.next_question,
      sources: Array.isArray(fila.sources) ? (fila.sources as Array<{ title: string; url: string }>) : [],
      provider: fila.provider,
      hits: fila.hits,
    };
  } catch (error) {
    console.warn("⚠️ Fitment aprendido: no se pudo leer:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function guardarFitmentAprendido(input: {
  make: string;
  model: string;
  year: number | null;
  candidatos: readonly CandidatoFitment[];
  note: string | null;
  nextQuestion: string | null;
  sources: ReadonlyArray<{ title: string; url: string }>;
  provider: string;
}): Promise<void> {
  if (enPruebas()) return;
  const confiables = input.candidatos.filter((c) => c.confianza !== "baja");
  if (!confiables.length) return;
  const { marca, modelo } = claveDeVehiculo(input.make, input.model);
  try {
    await sql`
      insert into vehicle_fitment_learned
        (make_key, model_key, year_key, vehicle_label, sizes, candidatos, note, next_question, sources, provider)
      values (
        ${marca}, ${modelo}, ${input.year ?? null},
        ${`${input.make} ${input.model}${input.year ? ` ${input.year}` : ""}`.trim()},
        ${sql.json(confiables.map((c) => c.medida) as never)},
        ${sql.json(confiables as never)},
        ${input.note}, ${input.nextQuestion},
        ${sql.json([...input.sources] as never)}, ${input.provider}
      )
      on conflict (make_key, model_key, year_key) do update set
        sizes = excluded.sizes, candidatos = excluded.candidatos, note = excluded.note,
        next_question = excluded.next_question, sources = excluded.sources,
        provider = excluded.provider, updated_at = now()
    `;
  } catch (error) {
    console.warn("⚠️ Fitment aprendido: no se pudo guardar:", error instanceof Error ? error.message : error);
  }
}

import { sql } from "../db/client.js";
import { listarPlantillasDeMeta, type PlantillaEnMeta } from "../wa/client.js";

/**
 * Trae de Meta el estado y la categoría de cada plantilla y los guarda en
 * `follow_up_templates` (19-nov-2026). El panel deja de depender de que alguien
 * teclee «aprobada»: lo que se ve es lo que Meta contestó.
 *
 * Solo LEE de Meta. Crear o editar plantillas sigue siendo a mano
 * (docs/PLANTILLAS_META.md), porque cada texto nuevo es una decisión comercial.
 */

/** El estado de Meta al vocabulario de la tabla (el que ya usa el panel). */
export function estadoDesdeMeta(status: string | undefined): "approved" | "pending" | "rejected" | "not_configured" {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED": return "approved";
    case "PENDING":
    case "IN_APPEAL": return "pending";
    case "REJECTED":
    case "PAUSED":
    case "DISABLED": return "rejected";
    default: return "not_configured";
  }
}

export async function sincronizarPlantillas(): Promise<{ actualizadas: number; enMeta: PlantillaEnMeta[] }> {
  const enMeta = await listarPlantillasDeMeta();
  const filas = await sql<{ template_key: string; template_name: string | null; language: string }[]>`
    select template_key, template_name, language from follow_up_templates
  `;
  let actualizadas = 0;
  for (const fila of filas) {
    const nombre = fila.template_name ?? fila.template_key;
    const meta = enMeta.find((p) => p.name === nombre && p.language === fila.language)
      ?? enMeta.find((p) => p.name === nombre);
    if (!meta) {
      await sql`
        update follow_up_templates
        set meta_status = null, meta_category = null, meta_template_id = null, meta_synced_at = now()
        where template_key = ${fila.template_key}
      `;
      continue;
    }
    const estado = estadoDesdeMeta(meta.status);
    await sql`
      update follow_up_templates
      set meta_status = ${meta.status}, meta_category = ${meta.category}, meta_template_id = ${meta.id},
          meta_synced_at = now(), approval_status = ${estado},
          configured = ${estado === "approved"} or configured,
          template_name = ${nombre}, preview = coalesce(${meta.texto ?? null}, preview), updated_at = now()
      where template_key = ${fila.template_key}
    `;
    actualizadas += 1;
  }
  return { actualizadas, enMeta };
}

import type { Sql } from "../client.js";

export const VENTA_PRIMERO_MIGRATION_ID = "011_venta_primero";

/**
 * Reescribe los prompts por etapa sembrados por el sistema con el criterio
 * VENTA PRIMERO, y habilita en cada etapa las herramientas que hacían falta
 * para cotizar sin fricción.
 *
 * Por qué existe: los defaults viejos le decían al bot «si da vehículo,
 * confirma la medida antes de hablar de precios» — exactamente la regla que
 * mató la venta del Chevrolet Orlando (el cliente dio 225/65R17 Y su carro, y
 * el bot en vez de cotizar pidió una foto). Cambiar el default en código no
 * alcanza: las bases de staging y Depot ya tienen sembrada la v1 publicada, y
 * `ensureDefaultStagePrompts` solo inserta si falta.
 *
 * Seguridad: solo se tocan las filas EXACTAS que sembró el sistema (v1,
 * created_by='system', texto sin editar). Si el dueño publicó su propia
 * versión desde el panel, la v1 quedó archivada y esta migración no la pisa.
 */
export async function runVentaPrimeroMigration(sql: Sql): Promise<void> {
  const ETAPAS: Array<{
    stage: string;
    promptViejo: string;
    objective: string;
    prompt: string;
    allowedTools: string[];
  }> = [
    {
      stage: "nuevo",
      promptViejo:
        "Haz una sola pregunta clara para obtener la medida. Si da vehículo, confirma la medida antes de hablar de precios.",
      objective: "Conseguir la medida y llegar a un precio lo antes posible.",
      prompt:
        "Si el cliente ya dio una medida, esa manda: busca y muestra opciones DE UNA, sin confirmar el vehículo ni pedir versión. Si además dio modelo y cantidad, cotiza de inmediato. Si no hay medida, consíguela con una sola pregunta clara, pedida siempre ESCRITA (nunca foto). Si solo da el vehículo, usa fitment_vehiculo y ofrece la medida más probable sin frenar la venta.",
      allowedTools: [
        "buscar_llanta",
        "buscar_catalogo",
        "buscar_por_aro_y_tipo",
        "tipos_de_llanta",
        "fitment_vehiculo",
        "preparar_opciones",
        "generar_cotizacion",
      ],
    },
    {
      stage: "medida_confirmada",
      promptViejo:
        "Usa el catálogo real y presenta opciones agrupadas con preparar_opciones. No decidas por el cliente ni sumes alternativas.",
      objective: "Presentar opciones reales y avanzar hacia la cotización.",
      prompt:
        "Usa el catálogo real y presenta opciones agrupadas con preparar_opciones. Si el cliente pide un tipo (A/T, todo terreno, carretera), eso es lo que busca: usa buscar_por_aro_y_tipo y ofrécele de ese tipo. Si ya eligió modelo y cantidad, cotiza de inmediato sin pedir otra confirmación. No decidas por el cliente ni sumes alternativas.",
      allowedTools: [
        "buscar_llanta",
        "buscar_catalogo",
        "buscar_por_aro_y_tipo",
        "tipos_de_llanta",
        "fitment_vehiculo",
        "preparar_opciones",
        "enviar_comparacion",
        "generar_cotizacion",
      ],
    },
    {
      stage: "seleccionando",
      promptViejo:
        "Aclara diferencias entre 2–3 opciones. Usa enviar_comparacion si la duda está acotada. Cotiza solo después de confirmar un modelo y cantidad.",
      objective: "Resolver dudas y comparar hasta que el cliente elija un modelo.",
      prompt:
        "Aclara diferencias entre 2–3 opciones. Usa enviar_comparacion si la duda está acotada. Si el cliente pide un tipo (A/T, todo terreno), usa buscar_por_aro_y_tipo o tipos_de_llanta: te está diciendo qué quiere comprar, no algo que verificar. En cuanto confirme un modelo y una cantidad, cotiza de inmediato; nunca cotices dos veces lo mismo.",
      allowedTools: [
        "buscar_llanta",
        "buscar_catalogo",
        "buscar_por_aro_y_tipo",
        "tipos_de_llanta",
        "fitment_vehiculo",
        "preparar_opciones",
        "enviar_comparacion",
        "generar_cotizacion",
      ],
    },
  ];

  await sql.begin(async (tx) => {
    for (const etapa of ETAPAS) {
      await tx`
        update stage_prompt_versions
        set objective = ${etapa.objective},
            prompt = ${etapa.prompt},
            allowed_tools = ${tx.json(etapa.allowedTools as never)}
        where stage = ${etapa.stage}
          and status = 'published'
          and version = 1
          and created_by = 'system'
          and prompt = ${etapa.promptViejo}
      `;
    }
    await tx`
      insert into schema_migrations (id)
      values (${VENTA_PRIMERO_MIGRATION_ID})
      on conflict (id) do nothing
    `;
  });
}

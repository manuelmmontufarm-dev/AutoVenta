import type { Sql } from "../client.js";

export const VENDER_EN_TODA_ETAPA_MIGRATION_ID = "014_vender_en_toda_etapa";

/**
 * El bot recupera las herramientas de venta en las etapas de cierre.
 *
 * Ticket 2150 (8-ago-2026): el cliente escribió «xfavor ya le envío y q me ayude
 * con una cotización» y el bot contestó, tres turnos seguidos, que le mandara la
 * foto de la medida. No fue terquedad del modelo: la conversación estaba en
 * `seguimiento_venta`, cuya lista de herramientas era
 * `["fitment_vehiculo", "local_mas_cercano", "notificar_vendedor"]`. Sin
 * `buscar_llanta`, sin `buscar_por_aro_y_tipo` y sin `preparar_opciones`, el bot
 * no tenía con qué mostrar una sola llanta aunque quisiera. El dueño terminó
 * mandando las opciones a mano.
 *
 * `cotizacion_enviada` tenía el mismo hueco. Las dos etapas se escribieron
 * pensando en el objetivo del vendedor (conseguir fecha y local, cerrar), pero
 * el cliente no sabe en qué etapa está: pide opciones cuando se le ocurre, y
 * cuando pide, hay que dársela.
 *
 * Se agrega también `opciones_sin_medida`, la salida del callejón sin salida
 * para cuando el cliente pide opciones sin medida, ni aro, ni vehículo.
 *
 * Mismo criterio de seguridad que 012: las herramientas se UNEN, nunca se
 * quitan, y sin condicionar al texto del prompt — darle con qué vender a un
 * negocio no le cambia lo que dice, y negárselo porque editó su prompt lo
 * dejaría exactamente en el problema que esta migración viene a arreglar.
 */
export async function runVenderEnTodaEtapaMigration(sql: Sql): Promise<void> {
  /** Lo que hace falta para poder mostrar una llanta, en cualquier etapa. */
  const HERRAMIENTAS_DE_VENTA = [
    "buscar_llanta",
    "buscar_catalogo",
    "buscar_por_aro_y_tipo",
    "guia_medida",
    "opciones_sin_medida",
    "preparar_opciones",
  ];

  const ETAPAS: Array<{ stage: string; suma: string[] }> = [
    // Las de búsqueda ya tenían todo salvo la tool nueva.
    { stage: "nuevo", suma: ["opciones_sin_medida"] },
    { stage: "medida_confirmada", suma: ["opciones_sin_medida"] },
    { stage: "seleccionando", suma: ["opciones_sin_medida"] },
    // Las de cierre son las que estaban mancas.
    { stage: "cotizacion_enviada", suma: HERRAMIENTAS_DE_VENTA },
    { stage: "seguimiento_venta", suma: [...HERRAMIENTAS_DE_VENTA, "generar_cotizacion"] },
  ];

  await sql.begin(async (tx) => {
    for (const etapa of ETAPAS) {
      const filas = await tx<{ id: number; allowed_tools: string[] }[]>`
        select id, allowed_tools from stage_prompt_versions
        where stage = ${etapa.stage} and status = 'published'
      `;
      for (const fila of filas) {
        const union = [...new Set([...(fila.allowed_tools ?? []), ...etapa.suma])];
        await tx`
          update stage_prompt_versions
          set allowed_tools = ${tx.json(union as never)}
          where id = ${fila.id}
        `;
      }
    }
    await tx`
      insert into schema_migrations (id)
      values (${VENDER_EN_TODA_ETAPA_MIGRATION_ID})
      on conflict (id) do nothing
    `;
  });
}

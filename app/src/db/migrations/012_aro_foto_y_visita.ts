import type { Sql } from "../client.js";

export const ARO_FOTO_VISITA_MIGRATION_ID = "012_aro_foto_y_visita";

/**
 * Tres cambios de criterio comercial, sembrados en las bases que ya corren.
 *
 * 1. **El aro manda.** Sin aro no hay cotización 100% segura, así que la etapa
 *    `nuevo` deja de pedir «la medida» a secas y pide el dato que decide si la
 *    llanta entra. De paso habilita `guia_medida` —la imagen que enseña dónde
 *    se lee cada número del costado— en las tres etapas de búsqueda.
 * 2. **La foto vuelve a ser una vía válida.** El prompt de `nuevo` decía
 *    «pedida siempre ESCRITA (nunca foto)», escrito cuando el bot todavía no
 *    leía imágenes. Desde vision.ts sí las lee, y prohibirla dejaba fuera la
 *    vía más fácil para el cliente que no ubica la medida.
 * 3. **Después de cotizar, el objetivo son dos datos: fecha y local.** Las
 *    etapas de cierre pedían «confirmar interés» y «resolver logística», que
 *    son cosas que nadie puede agendar. El motivo que se le da al cliente es el
 *    descuento, y es verdad: la cotización sale rebajada y su número es lo que
 *    la tienda exige para respetarla.
 *
 * Sigue el mismo criterio de seguridad que 011: se tocan SOLO las filas
 * publicadas cuyo prompt es byte-idéntico al texto del sistema —la prueba de
 * que nadie lo editó a mano— y las herramientas se UNEN, nunca se quitan.
 */
export async function runAroFotoVisitaMigration(sql: Sql): Promise<void> {
  const ETAPAS: Array<{
    stage: string;
    /** Textos del sistema que esta migración reemplaza. Uno por generación. */
    promptsViejos: string[];
    objective: string;
    prompt: string;
    allowedTools: string[];
  }> = [
    {
      stage: "nuevo",
      promptsViejos: [
        "Si el cliente ya dio una medida, esa manda: busca y muestra opciones DE UNA, sin confirmar el vehículo ni pedir versión. Si además dio modelo y cantidad, cotiza de inmediato. Si no hay medida, consíguela con una sola pregunta clara, pedida siempre ESCRITA (nunca foto). Si solo da el vehículo, usa fitment_vehiculo y ofrece la medida más probable sin frenar la venta.",
        "Haz una sola pregunta clara para obtener la medida. Si da vehículo, confirma la medida antes de hablar de precios.",
      ],
      objective: "Conseguir el aro o la medida y llegar a un precio lo antes posible.",
      prompt:
        "Si el cliente ya dio una medida, esa manda: busca y muestra opciones DE UNA, sin confirmar el vehículo ni pedir versión. Si además dio modelo y cantidad, cotiza de inmediato. Si no hay medida, lo que necesitas es el ARO: sin él ninguna cotización es segura. Pídelo mandando guia_medida, que enseña dónde se lee en el costado, y acepta las dos vías — medida escrita o foto de la llanta, que sí sabes leer. Si solo da el vehículo, usa fitment_vehiculo y ofrece la medida más probable sin frenar la venta; si ese vehículo tiene dos aros de fábrica y hay stock para los dos, díselo e invítalo al local en vez de preguntarle la versión.",
      allowedTools: ["guia_medida"],
    },
    {
      stage: "medida_confirmada",
      promptsViejos: [],
      objective: "Presentar opciones reales y avanzar hacia la cotización.",
      prompt: "",
      allowedTools: ["guia_medida"],
    },
    {
      stage: "seleccionando",
      promptsViejos: [],
      objective: "Resolver dudas y comparar hasta que el cliente elija un modelo.",
      prompt: "",
      allowedTools: ["guia_medida"],
    },
    {
      stage: "cotizacion_enviada",
      promptsViejos: [
        "No regeneres el PDF salvo que cambien modelo o cantidad. Pregunta si desea reservar, visitar o hablar con un asesor.",
      ],
      objective: "Conseguir dos datos: qué día viene y a cuál local.",
      prompt:
        "No regeneres el PDF salvo que cambien modelo o cantidad. Tu objetivo ahora es UNO: que diga qué día puede pasar y a cuál local. Van juntos y en la misma pregunta — una fecha sin local no se le puede avisar a nadie y un local sin fecha no entra en ninguna agenda. Ningún turno cierra sin esa pregunta mientras falte alguno de los dos. El motivo que le das es el descuento y es verdad: su cotización sale con precio rebajado y el número es lo que la tienda exige para respetarlo, así que avisarle al asesor es lo que hace que se lo apliquen. Nunca inventes un descuento extra que nadie autorizó.",
      allowedTools: [],
    },
    {
      stage: "seguimiento_venta",
      promptsViejos: [
        "Resume lo acordado y confirma local u horario sin inventar datos. Mantén el caso abierto hasta una venta o rechazo verificados.",
      ],
      objective: "Dar seguimiento comercial hasta la venta, incluyendo visita, reserva y handoff.",
      prompt:
        "Resume lo acordado y confirma local u horario sin inventar datos. Si todavía no sabes qué día viene o a cuál local, eso es lo que falta: pídelo en cada turno, junto, y diciéndole que así el asesor le aplica el descuento cuando llegue. Mantén el caso abierto hasta una venta o rechazo verificados.",
      allowedTools: [],
    },
  ];

  await sql.begin(async (tx) => {
    for (const etapa of ETAPAS) {
      // Las herramientas se habilitan SIEMPRE (unión, sin condición de texto):
      // `guia_medida` no cambia lo que el bot dice, solo le da con qué decirlo,
      // y negársela a un negocio porque editó su prompt sería dejarlo sin la
      // pieza. El TEXTO, en cambio, solo se pisa si nadie lo tocó.
      if (etapa.allowedTools.length) {
        const filas = await tx<{ id: number; allowed_tools: string[] }[]>`
          select id, allowed_tools from stage_prompt_versions
          where stage = ${etapa.stage} and status = 'published'
        `;
        for (const fila of filas) {
          const union = [...new Set([...(fila.allowed_tools ?? []), ...etapa.allowedTools])];
          await tx`
            update stage_prompt_versions
            set allowed_tools = ${tx.json(union as never)}
            where id = ${fila.id}
          `;
        }
      }

      for (const viejo of etapa.promptsViejos) {
        await tx`
          update stage_prompt_versions
          set objective = ${etapa.objective}, prompt = ${etapa.prompt}
          where stage = ${etapa.stage} and status = 'published' and prompt = ${viejo}
        `;
      }
    }
    await tx`
      insert into schema_migrations (id)
      values (${ARO_FOTO_VISITA_MIGRATION_ID})
      on conflict (id) do nothing
    `;
  });
}

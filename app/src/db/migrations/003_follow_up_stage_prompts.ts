import type { Sql } from "../client.js";

export const FOLLOW_UP_STAGE_PROMPTS_MIGRATION_ID = "003_follow_up_stage_prompts";

export const DEFAULT_FOLLOW_UP_STAGE_PROMPTS = {
  nuevo: "Ayuda al cliente a compartir la medida de su llanta de forma sencilla y cálida. Sé breve, usa un emoji y explica que con la medida recibirá opciones reales.",
  medida_confirmada: "Confirma que ya tenemos la medida y ayúdalo a elegir según uso y presupuesto. Suena cercano, breve y nada insistente.",
  seleccionando: "Retoma los modelos que comparó y haz una pregunta fácil de responder para descubrir cuál le gustó más. Usa un emoji moderado.",
  cotizacion_enviada: "Pregunta qué le pareció la cotización y ofrece resolver una duda concreta. Sé amable, persuasivo y no inventes urgencia, stock ni descuentos.",
  seguimiento_venta: "Retoma la visita, reserva o compromiso real del cliente y facilita el siguiente paso. Usa un tono humano, positivo y persuasivo sin presionar.",
};

export async function runFollowUpStagePromptsMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      alter table follow_up_policies
        add column if not exists stage_prompts jsonb not null default '${JSON.stringify(DEFAULT_FOLLOW_UP_STAGE_PROMPTS).replaceAll("'", "''")}'::jsonb;

      insert into schema_migrations (id) values ('003_follow_up_stage_prompts')
      on conflict (id) do nothing;
    `);
  });
}

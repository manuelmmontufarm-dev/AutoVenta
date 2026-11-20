import type { Sql } from "../client.js";

export const RECORDATORIOS_DE_VISITA_MIGRATION_ID = "034_recordatorios_de_visita";

/**
 * Los mensajes al CLIENTE alrededor de su visita (19-nov-2026): el recordatorio
 * de la víspera (`recordatorio_visita_v1`) y el «no llegó» del día siguiente
 * (`visita_no_llego_v1`). Una fila por conversación, ciclo, tipo y día de
 * visita: se inserta ANTES de mandar y la clave única es el candado — un
 * reinicio a mitad del barrido no manda dos veces.
 */
export async function runRecordatoriosDeVisitaMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists recordatorios_visita (
        id bigserial primary key,
        conversation_id bigint not null references conversations(id) on delete cascade,
        cycle integer not null,
        tipo text not null check (tipo in ('recordatorio', 'no_llego')),
        dia_visita date not null,
        plantilla text not null,
        estado text not null default 'enviando' check (estado in ('enviando', 'enviado', 'fallo')),
        provider_message_id text,
        error text,
        created_at timestamptz not null default now(),
        unique (conversation_id, cycle, tipo, dia_visita)
      );

      insert into schema_migrations (id)
      values ('034_recordatorios_de_visita')
      on conflict (id) do nothing;
    `);
  });
}

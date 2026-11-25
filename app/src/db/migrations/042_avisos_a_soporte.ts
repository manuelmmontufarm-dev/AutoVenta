import type { Sql } from "../client.js";

export const AVISOS_A_SOPORTE_MIGRATION_ID = "042_avisos_a_soporte";

/**
 * AVISOS A SOPORTE (24-nov-2026): «el bot no respondió» y «saldo de OpenAI bajo».
 *
 * Se acabó el crédito de OpenAI, 13 chats quedaron con «tengo un problema
 * técnico» y a Manuel no le llegó nada al teléfono.
 *
 *  · `incidentes_del_bot`: un incidente abierto por causa, a lo sumo. El índice
 *    único parcial es el candado contra el spam: con treinta fallos entrando a
 *    la vez, uno solo abre el incidente y los demás solo suman.
 *  · `avisos_a_soporte`: cada aviso que salió hacia soporte, con cuántos
 *    teléfonos lo recibieron por la app y qué pasó con el WhatsApp.
 *  · `saldo_de_ia`: el saldo que soporte anotó (OpenAI no deja leerlo por API)
 *    y el umbral del aviso. Una sola fila.
 *
 * Las tres son DATOS de cada servicio: el simulador no las copia (un incidente
 * abierto en producción no puede aparecer abierto en una base de pruebas).
 */
export async function runAvisosASoporteMigration(sql: Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(/* sql */ `
      create table if not exists incidentes_del_bot (
        id bigserial primary key,
        tipo text not null,
        causa text not null,
        estado text not null default 'abierto',
        detalle text,
        fallos integer not null default 1,
        conversaciones bigint[] not null default '{}',
        recordatorios integer not null default 0,
        abierto_at timestamptz not null default now(),
        ultimo_fallo_at timestamptz not null default now(),
        ultimo_aviso_at timestamptz,
        cerrado_at timestamptz
      );

      create unique index if not exists incidentes_del_bot_uno_abierto
        on incidentes_del_bot (tipo, causa) where estado = 'abierto';

      create table if not exists avisos_a_soporte (
        id bigserial primary key,
        incidente_id bigint references incidentes_del_bot(id) on delete set null,
        clase text not null,
        titulo text not null,
        cuerpo text not null,
        conversation_id bigint,
        push_enviados integer not null default 0,
        whatsapp text not null default 'sin_numero',
        whatsapp_detalle text,
        created_at timestamptz not null default now()
      );

      create index if not exists avisos_a_soporte_recientes_idx
        on avisos_a_soporte (created_at desc);

      create table if not exists saldo_de_ia (
        id integer primary key default 1 check (id = 1),
        saldo_usd numeric(10, 2) not null,
        umbral_usd numeric(10, 2) not null default 3,
        anotado_at timestamptz not null default now(),
        anotado_por text,
        costo_del_dia_al_anotar numeric(12, 4),
        updated_at timestamptz not null default now()
      );

      insert into schema_migrations (id)
      values ('042_avisos_a_soporte')
      on conflict (id) do nothing;
    `);
  });
}

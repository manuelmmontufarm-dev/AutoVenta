/**
 * R-35 — `npm run seed:negocio` deja una base vacía lista para el perfil activo.
 *
 * Integración contra Postgres local (como las demás `.integration`): se crea
 * una base desechable, se corre la semilla con NEGOCIO=ejemplo y se afirma que
 * quedaron las 4 llaves que el simulador exige, los prompts por etapa y las
 * fases — y que correrla de nuevo NO pisa lo que alguien ya cambió.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.NEGOCIO = "ejemplo";

const BASE = `autoventa_seed_negocio_${process.pid}`;
const USUARIO = process.env.PGUSER ?? process.env.USER;
process.env.DATABASE_URL = `postgresql://${USUARIO}@localhost/${BASE}`;

const admin = postgres(`postgresql://${USUARIO}@localhost/postgres`, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { sembrarNegocio } = await import("../src/db/seed-negocio.js");

// Las mismas llaves que exige el simulador (AJUSTES_QUE_IMPORTAN de sim.mjs).
const LLAVES = ["guardian_config", "ai_config", "pieces_config", "store_hours"];

describe("seed:negocio (R-35)", () => {
  let primera: { escritas: string[]; existentes: string[] };

  beforeAll(async () => {
    primera = await sembrarNegocio();
  }, 60_000);

  afterAll(async () => {
    await sql.end();
    const limpiar = postgres(`postgresql://${USUARIO}@localhost/postgres`, { prepare: false, max: 1 });
    await limpiar.unsafe(`drop database if exists ${BASE}`);
    await limpiar.end();
  });

  it("escribe las 4 llaves que el simulador exige", async () => {
    expect(primera.escritas.sort()).toEqual([...LLAVES].sort());
    const filas = await sql<{ key: string }[]>`select key from settings where key = any(${LLAVES})`;
    expect(filas.map((f) => f.key).sort()).toEqual([...LLAVES].sort());
  });

  it("publica los prompts por etapa y deja las fases guardadas", async () => {
    const [prompts] = await sql<{ n: number }[]>`select count(*)::int as n from stage_prompt_versions`;
    expect(prompts.n).toBeGreaterThan(0);
    const [fases] = await sql<{ hay: number }[]>`select 1 as hay from settings where key = 'phase_config'`;
    expect(fases).toBeTruthy();
  });

  it("los horarios sembrados son los del perfil, con sus claveHorario", async () => {
    const [fila] = await sql<{ value: Record<string, unknown> }[]>`
      select value from settings where key = 'store_hours'
    `;
    // `ejemplo` tiene un solo local con claveHorario "principal".
    expect(Object.keys(fila.value)).toEqual(["principal"]);
    // Y su horario es el de `horasPorDia`: lun–vie 9–18, fin de semana cerrado.
    // (Antes caía al 08:30–17:30 de los siete días y ofrecía un domingo cerrado.)
    const dias = (fila.value.principal as { dias: Record<string, { open: string; close: string; closed: boolean }> }).dias;
    expect(dias.lun).toEqual({ open: "09:00", close: "18:00", closed: false });
    expect(dias.vie).toEqual({ open: "09:00", close: "18:00", closed: false });
    expect(dias.sab.closed).toBe(true);
    expect(dias.dom.closed).toBe(true);
  });

  it("un local con horarioPorDefecto usa el suyo (Depot: Quito Sur cierra el fin de semana)", async () => {
    const { horariosDelPerfil } = await import("../src/db/seed-negocio.js");
    const { DEPOT } = await import("../src/negocio/negocios/depot.js");
    const horarios = horariosDelPerfil(DEPOT);
    expect(Object.keys(horarios)).toEqual(["cumbaya", "quitoSur"]);
    // El mismo horario que trae su perfil, en la forma de 7 días.
    const { StoreHoursSchema } = await import("../src/services/settings.js");
    const sur = DEPOT.locales.find((l) => l.claveHorario === "quitoSur")!;
    expect(horarios.quitoSur).toEqual(StoreHoursSchema.parse({ quitoSur: sur.horarioPorDefecto }).quitoSur);
  });

  it("es idempotente: la segunda corrida no pisa lo existente", async () => {
    // Alguien cambió un ajuste desde el panel…
    await sql`
      update settings set value = ${sql.json({ activo: false, marcado: "a-mano" })}
      where key = 'guardian_config'
    `;
    const segunda = await sembrarNegocio();
    expect(segunda.escritas).toEqual([]);
    expect(segunda.existentes.sort()).toEqual([...LLAVES].sort());
    const [fila] = await sql<{ value: { marcado?: string } }[]>`
      select value from settings where key = 'guardian_config'
    `;
    // …y la semilla lo respeta.
    expect(fila.value.marcado).toBe("a-mano");
  });
});

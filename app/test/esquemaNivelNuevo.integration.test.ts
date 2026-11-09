/**
 * El arranque no puede morir porque un asesor esté en un nivel de aviso nuevo.
 *
 * 9-nov-2026: el deploy de Depot quedó FAILED. La migración 018 corre en cada
 * arranque y volvía a crear el check `advisors_rol_valido` (solo 'admin' o
 * 'asesor') antes de que la 028 lo borrara. Manuel estaba en 'nivel-2', así que
 * el check no se podía crear, el esquema lanzaba y /health nunca contestó.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.GRAPH_BASE_URL ||= "http://127.0.0.1:9";

const BASE = `autoventa_nivel_nuevo_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("esquema · asesor en un nivel de aviso nuevo", () => {
  it("un segundo arranque no falla con un asesor en 'nivel-2'", async () => {
    await ensureSchema();
    await sql`
      insert into advisors (nombre, telefono, rol)
      values ('Manuel Montufar', '593999000222', 'nivel-2')
    `;

    await expect(ensureSchema()).resolves.toBeUndefined();

    const [fila] = await sql<{ rol: string }[]>`select rol from advisors where telefono = '593999000222'`;
    expect(fila.rol).toBe("nivel-2");
    const checks = await sql`select 1 from pg_constraint where conname = 'advisors_rol_valido'`;
    expect(checks).toHaveLength(0);
  });
});

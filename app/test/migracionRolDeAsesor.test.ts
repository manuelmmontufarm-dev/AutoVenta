import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

/**
 * 9-nov 18:06, deploy FAILED: «check constraint advisors_rol_valido … is
 * violated by some row». La 018 corre en CADA arranque y volvía a crear el
 * check que la 028 había quitado; con un asesor en un nivel de aviso nuevo
 * (no 'admin' ni 'asesor'), el bot ya no podía arrancar. Producción quedó con
 * el contenedor viejo: si se caía, Depot se quedaba sin bot.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";

const BASE = "autoventa_rol_asesor_test";
const ADMIN_URL = "postgresql://manue@localhost/postgres";
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("arranque con un asesor en un nivel de aviso nuevo", () => {
  it("el esquema se vuelve a aplicar sin romper (segundo arranque)", async () => {
    await ensureSchema();
    const [{ columna }] = await sql<{ columna: string }[]>`
      select column_name as columna from information_schema.columns
      where table_name = 'advisors' and column_name = 'rol'`;
    expect(columna).toBe("rol");
    const otrasColumnas = await sql<{ column_name: string; is_nullable: string; column_default: string | null }[]>`
      select column_name, is_nullable, column_default from information_schema.columns
      where table_name = 'advisors' and is_nullable = 'NO' and column_default is null and column_name <> 'id'`;
    const fila: Record<string, unknown> = { rol: "nivel_3" };
    for (const c of otrasColumnas) fila[c.column_name] = c.column_name.includes("phone") || c.column_name.includes("telefono") ? "593900000001" : "x";
    await sql`insert into advisors ${sql(fila)}`;
    await expect(ensureSchema()).resolves.toBeUndefined();
    const checks = await sql`select 1 from pg_constraint where conname = 'advisors_rol_valido'`;
    expect(checks).toHaveLength(0);
  });
});

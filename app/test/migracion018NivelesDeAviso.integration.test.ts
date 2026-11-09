import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * 9-nov-2026: producción tiene un asesor con rol `nivel-2` (los niveles de aviso viven en settings,
 * migración 028). La 018 volvía a crear en CADA arranque el check `advisors_rol_valido (admin, asesor)`
 * que la 028 había borrado; Postgres validaba las filas y daba 23514: el siguiente reinicio o deploy
 * no arrancaba. La 018 ya no agrega el check cuando la 028 está registrada.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_mig018_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");

afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

const hayCheck = async () =>
  (await sql`select 1 from pg_constraint where conname = 'advisors_rol_valido'`).length > 0;

describe.sequential("migración 018 + 028: el check de roles de asesor", () => {
  it("base NUEVA: arranca y el check final es el que deja la 028 (ninguno)", async () => {
    await ensureSchema();
    expect(await hayCheck()).toBe(false);
    const [m] = await sql`select 1 from schema_migrations where id = '028_niveles_de_aviso'`;
    expect(m).toBeTruthy();
  });

  it("producción: un asesor en «nivel-2» y las dos migraciones registradas → ensureSchema NO lanza", async () => {
    await sql`insert into advisors (nombre, telefono, rol) values ('Asesor Nivel 2', '593990000099', 'nivel-2')`;
    await expect(ensureSchema()).resolves.not.toThrow();
    expect(await hayCheck()).toBe(false);
    const [fila] = await sql<{ rol: string }[]>`select rol from advisors where telefono = '593990000099'`;
    expect(fila.rol).toBe("nivel-2");
  });

  it("un tercer arranque tampoco (idempotente)", async () => {
    await expect(ensureSchema()).resolves.not.toThrow();
  });
});

/**
 * 17-nov-2026: con un asesor en un nivel creado desde Ajustes («nivel-2», como
 * en producción), el SEGUNDO arranque del bot se caía. El esquema corre entero
 * en cada arranque, y la 018 volvía a poner el check «solo admin/asesor» que
 * la 028 había soltado. Lo cazó el simulador al copiar la configuración real:
 * el próximo deploy a producción se habría caído igual.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabase = `autoventa_nivel_propio_${process.pid}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });

let appSql: typeof import("../src/db/client.js").sql;
let ensureSchema: typeof import("../src/db/schema.js").ensureSchema;

describe.sequential("un asesor con nivel propio no tumba el arranque", () => {
  beforeAll(async () => {
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.unsafe(`create database ${testDatabase}`);
    process.env.DATABASE_URL = `postgresql://manue@localhost/${testDatabase}`;
    process.env.WHATSAPP_TOKEN = "test";
    process.env.WHATSAPP_APP_SECRET = "test";
    process.env.WHATSAPP_VERIFY_TOKEN = "test";
    process.env.WHATSAPP_PHONE_ID = "test";
    process.env.SELLER_PHONE = "593000000000";
    process.env.OPENAI_API_KEY = "test";
    appSql = (await import("../src/db/client.js")).sql;
    ensureSchema = (await import("../src/db/schema.js")).ensureSchema;
    await ensureSchema();
  });

  afterAll(async () => {
    await appSql?.end();
    await admin.unsafe(`drop database if exists ${testDatabase}`);
    await admin.end();
  });

  it("el segundo arranque con un asesor «nivel-2» no se cae", async () => {
    await appSql`insert into advisors (nombre, telefono, rol) values ('Prueba', '593900000001', 'nivel-2')`;
    await expect(ensureSchema()).resolves.not.toThrow();
    const [check] = await appSql`select 1 from pg_constraint where conname = 'advisors_rol_valido'`;
    expect(check).toBeUndefined();
  });
});

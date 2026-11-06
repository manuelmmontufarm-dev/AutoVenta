/**
 * PERFILES DE MARCA POR NEGOCIO (R-27).
 *
 * La migración 009 sembraba FALKEN/KENDA/WINRUN (el argumento de venta de
 * Depot) en CUALQUIER base nueva: una base de Mundillantas arrancaba hablando
 * de las marcas de Depot. Ahora solo Depot las siembra; la marca de siembra se
 * pone siempre, así que un redeploy tampoco las resucita en otro negocio.
 */
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";

const ADMIN_URL = "postgresql://manue@localhost/postgres";
const bases: string[] = [];

async function baseNuevaCon(negocio: string | null) {
  const nombre = `autoventa_brand_${negocio ?? "depot"}_${process.pid}`;
  bases.push(nombre);
  const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
  await admin.unsafe(`drop database if exists ${nombre}`);
  await admin.unsafe(`create database ${nombre}`);
  await admin.end();
  vi.resetModules();
  if (negocio) process.env.NEGOCIO = negocio;
  else delete process.env.NEGOCIO;
  process.env.DATABASE_URL = `postgresql://manue@localhost/${nombre}`;
  const { ensureSchema } = await import("../src/db/schema.js");
  const { sql } = await import("../src/db/client.js");
  await ensureSchema();
  const marcas = await sql<{ brand: string }[]>`select brand from brand_profiles order by position`;
  const [marca] = await sql<{ n: number }[]>`select count(*)::int as n from settings where key = 'brand_profiles_seeded_v1'`;
  const beneficios = await sql<{ text: string }[]>`select text from benefits order by position`;
  await sql.end({ timeout: 5 });
  return { marcas: marcas.map((m) => m.brand), sembrado: marca.n === 1, beneficios: beneficios.length };
}

afterAll(async () => {
  delete process.env.NEGOCIO;
  const admin = postgres(ADMIN_URL, { prepare: false, max: 1 });
  for (const b of bases) await admin.unsafe(`drop database if exists ${b} with (force)`);
  await admin.end();
});

describe("008_benefits y 009_brand_profiles siembran según el negocio", () => {
  it("con NEGOCIO=ejemplo, una base vacía queda sin perfiles de marca (y marcada)", async () => {
    expect(await baseNuevaCon("ejemplo")).toEqual({ marcas: [], sembrado: true, beneficios: 0 });
  });

  it("Depot (NEGOCIO sin definir) siembra las tres de siempre", async () => {
    expect(await baseNuevaCon(null)).toEqual({ marcas: ["FALKEN", "KENDA", "WINRUN"], sembrado: true, beneficios: 4 });
  });

  // 008_benefits: el «INCLUYE» de Depot (seguro contra golpes, mantenimiento
  // cada 10.000 km) salía en las piezas y el PDF de Mundillantas, que no lo ofrece.
  it("Mundillantas arranca sin las promesas de Depot en el INCLUYE", async () => {
    expect((await baseNuevaCon("mundillantas")).beneficios).toBe(0);
  });
});

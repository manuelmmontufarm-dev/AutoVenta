/**
 * SPRINT 2 · 2a — el Guardián del seguimiento ve LA MISMA lista vigente que el
 * seguimiento (auditoría del 9-nov-2026).
 *
 * Hoy `armarContexto` presenta `listaDeLaPieza(metadata)` como «dato duro»
 * (guardian.ts:605 y :882): con una lámina del 6-nov por la mañana le dice al
 * revisor que «KENDA KR601 — $194.85 c/u · 4 = $779.40» NO se corrige, y por eso
 * 21 de los 26 seguimientos con precio viejo salieron `aprobar`.
 *
 * - Revisión de un SEGUIMIENTO → la lista vigente (precio de hoy, promo de hoy).
 * - Revisión de un TURNO NORMAL → la lista que el cliente VIO (no se rompe ese uso).
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const BASE = `autoventa_s2_guardian_lista_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const cat = vi.hoisted(() => ({ items: new Map<string, unknown>(), cargado: true }));
vi.mock("../src/services/catalog.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/services/catalog.js")>();
  return {
    ...real,
    findByCode: (codigo: string) => (cat.cargado ? cat.items.get(codigo) : undefined),
    catalogCandidates: (r: string) => (cat.cargado && cat.items.has(r) ? [cat.items.get(r)] : []),
    catalogStatus: () => ({ ...real.catalogStatus(), items: cat.cargado ? cat.items.size : 0, error: null }),
  };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { armarContexto } = await import("../src/services/guardian.js");
const { fijarCompuertaDeTemporada, segundaLlantaDe } = await import("../src/domain/promocionDeTemporada.js");
const { POLITICA_DEPOT } = await import("../src/negocio/politicas/depot.js");

function llanta(codigo: string, marca: string, diseno: string, hoy: number, lista: number): CatalogItem {
  return {
    id: codigo, code: codigo, name: `265/65R18 ${marca} ${diseno}`, brand: marca, design: diseno,
    size: { width: 265, aspect: 65, rim: 18 }, sizeLabel: "265/65R18",
    price: hoy / 1.15, sourcePrice: hoy / 1.15, priceTier: "pvp1",
    prices: { pvp1: hoy / 1.15, pvp2: hoy / 1.15, pvp3: hoy / 1.15, pvp4: hoy / 1.15 },
    taxRate: 0.15, customerPriceWithTax: lista, minimumPriceWithTax: hoy, distributorPriceWithTax: hoy * 0.8,
    stock: 12, availability: "available", imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  } as CatalogItem;
}
const WINRUN = llanta("W-R380", "WINRUN", "R380", 124.76, 124.76);
const KENDA = llanta("K-KR601", "KENDA", "KR601", 194.85, 259.8);
const FALKEN = llanta("F-CT60", "FALKEN", "ZIEX CT60 A/S", 200.0, 266.67);

const AHORA = new Date();
const CUENTA_DE_HOY = "KENDA KR601 — 2 × $259.80 + 2 × $103.92 = $727.44 (−60 % en la 2.ª llanta)";
const LINEA_VIEJA = "KENDA KR601 — $194.85 c/u · 4 = $779.40";

/** Crea una conversación con la lámina guardada y devuelve su id. */
async function conversacionConLamina(escalones: object): Promise<number> {
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size)
    values (${`5939${Math.floor(Math.random() * 1e8)}`}, 'Cliente', 'open', 'seleccionando', 1, '265/65R18')
    returning id
  `;
  await sql`
    insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata)
    values
      (${conv.id}, 1, 'user', 'inbound', 'Necesito llantas 265/65R18 para camioneta', 'text', 'customer', '{}'::jsonb),
      (${conv.id}, 1, 'assistant', 'outbound', 'Opciones enviadas', 'image', 'bot',
        ${sql.json({ piece: "options", codes: ["W-R380", "K-KR601", "F-CT60"], cantidad: 4, escalones } as never)})
  `;
  return conv.id;
}

const ESCALONES_VIEJOS = {
  economica: { codigo: "W-R380", nombre: "WINRUN R380", precio_con_iva: 124.76 },
  equilibrada: { codigo: "K-KR601", nombre: "KENDA KR601", precio_con_iva: 194.85 },
  premium: { codigo: "F-CT60", nombre: "FALKEN ZIEX CT60 A/S", precio_con_iva: 200.0 },
};

function escalonesConPromo() {
  const promo = (marca: string, hoy: number, lista: number) =>
    segundaLlantaDe(POLITICA_DEPOT.promocionDeTemporada, marca, 4, { hoyConIva: hoy, listaConIva: lista }, AHORA);
  return {
    ...ESCALONES_VIEJOS,
    equilibrada: { ...ESCALONES_VIEJOS.equilibrada, segunda_llanta: promo("KENDA", 194.85, 259.8) },
    premium: { ...ESCALONES_VIEJOS.premium, segunda_llanta: promo("FALKEN", 200.0, 266.67) },
  };
}

describe.sequential("el Guardián ve la lista que corresponde a su puerta", () => {
  beforeAll(async () => {
    await ensureSchema();
  });
  afterAll(async () => {
    await sql?.end();
    await admin.unsafe(`drop database if exists ${BASE}`);
    await admin.end();
  });
  afterEach(() => {
    cat.cargado = true;
    cat.items = new Map([WINRUN, KENDA, FALKEN].map((i) => [i.code, i]));
    fijarCompuertaDeTemporada(() => true);
  });

  beforeAll(() => {
    cat.items = new Map([WINRUN, KENDA, FALKEN].map((i) => [i.code, i]));
  });

  it("seguimiento · lámina sin promo + Black Friday vigente → el hecho trae la cuenta de HOY", async () => {
    const id = await conversacionConLamina(ESCALONES_VIEJOS);
    const ctx = await armarContexto(id, 1, "borrador", [], { tipo: "seguimiento" });
    expect(ctx).toContain(CUENTA_DE_HOY);
    expect(ctx).not.toContain(LINEA_VIEJA);
  });

  it("seguimiento · lámina con `segunda_llanta` + compuerta cerrada → el hecho NO trae «−60 %»", async () => {
    const guardados = escalonesConPromo();
    fijarCompuertaDeTemporada(() => false);
    const id = await conversacionConLamina(guardados);
    const ctx = await armarContexto(id, 1, "borrador", [], { tipo: "seguimiento" });
    const hecho = ctx.split("\n").find((l) => l.startsWith("LISTA DE OPCIONES CON PRECIOS EN PANTALLA")) ?? "";
    // (el texto fijo del hecho nombra «la 2.ª llanta» en general; lo que no puede traer es una cuenta)
    expect(hecho).not.toMatch(/−60|\d × \$/);
    expect(hecho).toContain(LINEA_VIEJA);
  });

  it("seguimiento · un código sin stock → el hecho no trae precios", async () => {
    cat.items.set(KENDA.code, { ...KENDA, stock: 0, availability: "out_of_stock" });
    const id = await conversacionConLamina(ESCALONES_VIEJOS);
    const ctx = await armarContexto(id, 1, "borrador", [], { tipo: "seguimiento" });
    const hecho = ctx.split("\n").find((l) => l.startsWith("LISTA DE OPCIONES CON PRECIOS EN PANTALLA")) ?? "";
    expect(hecho).not.toContain("$779.40");
    expect(hecho).not.toContain("$194.85");
  });

  it("guarda · TURNO NORMAL: sigue viendo la lista que el cliente vio (no la de hoy)", async () => {
    const id = await conversacionConLamina(ESCALONES_VIEJOS);
    const ctx = await armarContexto(id, 1, "borrador", [], { tipo: "respuesta" });
    expect(ctx).toContain(LINEA_VIEJA);
    expect(ctx).not.toContain("2 × $259.80");
  });
});

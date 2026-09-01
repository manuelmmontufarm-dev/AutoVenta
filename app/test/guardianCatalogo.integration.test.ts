/**
 * EL GUARDIÁN RECIBE EL CATÁLOGO — precios Interbot y stock de hoy.
 *
 * Producción, 27-ago, conv 11070: el bot afirmó «KENDA KR628 a $144.44 c/u con
 * IVA» y el guardián escribió, con razón, «no hay cotización vigente ni datos
 * duros de precios para verificarlo … se reporta y se aprueba». No era vagancia
 * del revisor: NADIE le pasaba el catálogo, así que todo precio dicho fuera de
 * una cotización era invisible para él. Manuel: «no quiero ni una falla más de
 * catálogo».
 *
 * Esto prueba que `armarContexto` arma la sección CATÁLOGO DE HOY con el mismo
 * número que imprimen las piezas (`minimumPriceWithTax`, que ya lleva el
 * Interbot aplicado) y que marca las agotadas. La rúbrica que la usa se prueba
 * contra el modelo real en `scripts/guardian/probar-rubrica.mjs`.
 */
import postgres from "postgres";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const BASE = `autoventa_guardian_cat_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);
await admin.end();

const llanta = (code: string, design: string, precio: number, stock: number): Partial<CatalogItem> => ({
  code, brand: "KENDA", design, sizeLabel: "245/70R16",
  size: { width: 245, aspect: 70, rim: 16 },
  minimumPriceWithTax: precio, customerPriceWithTax: precio, stock,
  availability: stock > 0 ? "available" : "out",
});

const CATALOGO = [
  llanta("K1", "KR628", 144.44, 10),
  llanta("K2", "KR601", 194.85, 12),
  llanta("K3", "KR608", 213.5, 0),
] as CatalogItem[];

vi.mock("../src/services/catalog.js", () => ({
  ensureCatalogReady: async () => ({}),
  searchBySize: (size: { width: number; rim: number }) =>
    CATALOGO.filter((p) => p.size?.width === size.width && p.size?.rim === size.rim),
  searchByText: () => CATALOGO,
  findByCode: (code: string) => CATALOGO.find((p) => p.code === code),
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { armarContexto } = await import("../src/services/guardian.js");

beforeAll(async () => {
  await ensureSchema();
});

describe("armarContexto · el catálogo de hoy viaja como hecho duro", () => {
  it("EL CASO QUE FALLÓ: con la medida pedida, el precio y el stock están a la vista", async () => {
    const [conv] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size)
      values ('593999111333', 'Cliente', 'open', 'medida_confirmada', 1, '245/70R16')
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${conv.id}, 1, 'user', 'inbound', 'En la medida 245/70/16', 'text')
    `;

    const contexto = await armarContexto(conv.id, 1, "La más económica es KENDA KR628 a $144.44 c/u con IVA.");

    expect(contexto).toContain("== CATÁLOGO DE HOY");
    // El número exacto que imprime la pieza, verificable letra por letra. El
    // tipo viaja entre corchetes desde el 1-sep (conv 13645): sin él, el
    // revisor no podía juzgar un «no hay A/T» teniendo la llanta a la vista.
    expect(contexto).toContain("KENDA KR628 245/70R16 [A/T] — hoy $144.44 c/u con IVA · stock hoy: 10");
    // Y la agotada viene marcada con la regla comercial completa: no pasa el
    // mismo filtro que arma la vitrina para un juego de cuatro.
    expect(contexto).toContain("KENDA KR608 245/70R16 [A/T] — hoy $213.50 c/u con IVA · stock hoy: 0 (NO VENDIBLE para el juego de 4: no se ofrece)");
  });

  it("EL CASO QUE NO DEBE DISPARAR: sin medida pedida no hay sección ni ruido", async () => {
    const [conv] = await sql<{ id: number }[]>`
      insert into conversations (phone, name, status, stage, current_cycle)
      values ('593999111334', 'Cliente', 'open', 'nuevo', 1)
      returning id
    `;
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${conv.id}, 1, 'user', 'inbound', 'Hola, quiero información', 'text')
    `;

    const contexto = await armarContexto(conv.id, 1, "¡Hola! ¿Me dice la medida?");

    expect(contexto).not.toContain("CATÁLOGO DE HOY");
  });
});

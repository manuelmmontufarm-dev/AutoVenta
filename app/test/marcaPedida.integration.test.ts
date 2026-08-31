/**
 * LA MARCA PEDIDA FIRMA LA COTIZACIÓN — producción, 31-ago-2026, conv 671.
 *
 * La conversación real, con los textos exactos:
 *
 *   CLIENTE: «necesito falken r17 265 70»
 *   BOT:     [opciones: Falken, Kenda, Winrun]
 *   CLIENTE: «cuanto sale las 4?»
 *   BOT:     Cotización COT-MTHOP9S7 por $961.32   ← KENDA KR628
 *   CLIENTE: «y de las falken?»
 *   BOT:     [opciones: 3 Falken]
 *   CLIENTE: «coticeme 4 at»
 *   BOT:     «Su cotización sigue vigente por $961.32 👍»  ← la de KENDA
 *
 * Dos fallas de la misma raíz: el modelo eligió otra marca y ningún candado lo
 * frenó, y el anti-duplicado recicló una cotización que no respondía el
 * pedido. Estas pruebas atacan el turno exacto con el código exacto que mandó
 * el modelo.
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_marca_pedida_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

let catalogo: CatalogItem[] = [];

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (consulta: string, limite = 40) => searchCatalog(catalogo, consulta, limite),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: () => [],
    searchAlternatives: () => [],
    catalogCandidates: (referencia: string) => catalogo.filter((i) => i.code === referencia),
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (codigo: string) => catalogo.find((i) => i.code === codigo),
  };
});
vi.mock("../src/services/interbotPrices.js", () => ({
  refreshPriceForSize: async () => undefined,
  getInterbotPrice: () => undefined,
}));
vi.mock("../src/wa/client.js", () => ({
  sendImage: async () => "wamid-imagen",
  sendPdf: async () => "wamid-pdf",
}));
vi.mock("../src/render/quoteImage.js", () => ({
  renderQuoteImage: async () => Buffer.from("png"),
  renderCompareImage: async () => Buffer.from("png"),
  renderOptionsImage: async () => Buffer.from("png"),
  renderMedidaGuideImage: async () => Buffer.from("png"),
  toRenderLine: async (product: CatalogItem, quantity = 1) => ({
    brand: product.brand, design: product.design, sizeLabel: product.sizeLabel ?? product.name,
    quantity, unitPrice: product.minimumPriceWithTax, total: product.minimumPriceWithTax * quantity,
  }),
}));
vi.mock("../src/services/advisorNotifications.js", () => ({ notifyAdvisor: async () => undefined }));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { buildTools } = await import("../src/agent/tools.js");

function llanta(code: string, brand: string, design: string): CatalogItem {
  return {
    id: code, code,
    name: `LLANTA 265/70R17 ${brand} ${design}`,
    brand, design,
    size: { width: 265, aspect: 70, rim: 17 },
    sizeLabel: "265/70R17",
    price: 200, sourcePrice: 170, priceTier: "pvp1",
    prices: { pvp1: 200, pvp2: 200, pvp3: 200, pvp4: 200 },
    taxRate: 0.15,
    customerPriceWithTax: 296.55, minimumPriceWithTax: 240.33, distributorPriceWithTax: 190,
    stock: 8, availability: "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}
const KENDA = "K628A";
const FALKEN_AT = "F4WAT";
const FALKEN_MT = "F4WMT";

interface Fila { id: number; current_cycle: number }

/** La conversación de la conv 671, hasta el turno que se prueba. */
async function conversacion671(phone: string): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size)
    values (${phone}, 'Manuel', 'open', 'opciones_enviadas', 1, '265/70R17')
    returning id, current_cycle
  `;
  await sql`
    insert into messages (conversation_id, role, content, direction, type, cycle)
    values (${fila.id}, 'user', 'necesito falken r17 265 70', 'inbound', 'text', 1),
           (${fila.id}, 'user', 'cuanto sale las 4?', 'inbound', 'text', 1),
           (${fila.id}, 'user', 'y de las falken?', 'inbound', 'text', 1)
  `;
  // La cotización de KENDA que salió por error en el primer «cuanto sale las 4».
  await sql`
    insert into quotes (conversation_id, cycle, quote_number, total, subtotal, tax, items)
    values (${fila.id}, 1, 'COT-VIEJA', 961.32, 835.93, 125.39,
      ${sql.json([{ code: KENDA, brand: "KENDA", design: "KR628", sizeLabel: "265/70R17", quantity: 4 }])})
  `;
  // Las 3 Falken que el bot le mostró cuando pidió «y de las falken?».
  await sql`
    insert into quote_artifacts (conversation_id, cycle, kind, products)
    values (${fila.id}, 1, 'options', ${sql.json([
      { code: FALKEN_AT, brand: "FALKEN", design: "WILDPEAK A/T 4W" },
      { code: FALKEN_MT, brand: "FALKEN", design: "WILDPEAK M/T" },
    ])})
  `;
  return fila;
}

async function cotizar(fila: Fila, phone: string, code: string, texto: string) {
  const tools = buildTools({
    conversation: { id: fila.id, phone, name: "Manuel", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: fila.current_cycle },
    customerPhone: phone,
    customerName: "Manuel",
    currentUserText: texto,
    aceptoCotizacion: true,
  } as never);
  const tool = tools.find((t) => t.function.name === "generar_cotizacion");
  if (!tool) throw new Error("generar_cotizacion no está registrada");
  return JSON.parse(await tool.execute({ items: [{ code, cantidad: 4 }], nombre_cliente: null }));
}

const cotizacionesDe = (id: number) => sql<{ items: Array<{ code: string; brand: string }> }[]>`
  select items from quotes where conversation_id=${id} order by created_at desc
`;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});
beforeEach(() => {
  catalogo = [llanta(KENDA, "KENDA", "KR628"), llanta(FALKEN_AT, "FALKEN", "WILDPEAK A/T 4W"), llanta(FALKEN_MT, "FALKEN", "WILDPEAK M/T")];
});

describe.sequential("generar_cotizacion · la marca pedida firma la cotización", () => {
  it("«coticeme 4 at» con la KENDA vigente NO dice «sigue vigente»: redirige a la Falken A/T", async () => {
    const fila = await conversacion671("593911120001");
    // El modelo arrastra el código de la KENDA cotizada — el turno real.
    const r = await cotizar(fila, "593911120001", KENDA, "coticeme 4 at");
    expect(JSON.stringify(r)).not.toContain("sigue vigente");
    const filas = await cotizacionesDe(fila.id);
    // Hay una cotización NUEVA y es de la FALKEN A/T (el tipo afinó entre las dos).
    expect(filas.length).toBe(2);
    expect(filas[0].items[0].code).toBe(FALKEN_AT);
  });

  it("con varias Falken y sin tipo, no adivina: pide elegir", async () => {
    const fila = await conversacion671("593911120002");
    const r = await cotizar(fila, "593911120002", KENDA, "coticeme las 4");
    expect(r.error).toMatch(/MARCA PEDIDA/);
    expect(JSON.stringify(r.opciones ?? "")).toContain("FALKEN");
    // Y NO se firmó nada nuevo de otra marca.
    const filas = await cotizacionesDe(fila.id);
    expect(filas.length).toBe(1);
  });

  it("sin marca pedida en la visita, el candado ni corre (el flujo normal no cambia)", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size)
      values ('593911120003', 'Otro', 'open', 'opciones_enviadas', 1, '265/70R17')
      returning id, current_cycle
    `;
    await sql`
      insert into messages (conversation_id, role, content, direction, type, cycle)
      values (${fila.id}, 'user', '265/70R17', 'inbound', 'text', 1)
    `;
    const r = await cotizar(fila, "593911120003", KENDA, "cuanto sale las 4?");
    expect(r.error ?? null).toBeNull();
    const filas = await cotizacionesDe(fila.id);
    expect(filas[0].items[0].code).toBe(KENDA);
  });

  it("si el cliente cambió a otra marca después, la nueva manda", async () => {
    const fila = await conversacion671("593911120004");
    await sql`
      insert into messages (conversation_id, role, content, direction, type, cycle)
      values (${fila.id}, 'user', 'mejor quiero la kenda', 'inbound', 'text', 1)
    `;
    const r = await cotizar(fila, "593911120004", KENDA, "coticeme las 4");
    // Pide KENDA otra vez: la vigente de KENDA sí puede reusarse.
    expect(JSON.stringify(r)).toContain("sigue vigente");
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * «DEME SOLO 3» — la ruta que rehace la cotización (conv 3, 27-ago-2026).
 *
 * En producción el modelo prometió el ajuste dos turnos seguidos sin llamar una
 * sola herramienta, y el cliente nunca supo cuánto costaban 3 llantas. Acá se
 * prueba que la ruta determinística lo hace sola: genera la pieza nueva con la
 * MISMA herramienta del agente y devuelve el texto que la acompaña.
 *
 * Va de integración porque lo que se afirma vive en la base: la cotización
 * nueva con su cantidad y su total.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.DIRECT_SALES_ROUTES_ENABLED = "true";

const BASE = `autoventa_cambio_cantidad_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

let catalogo: CatalogItem[] = [];
vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (q: string, l = 40) => searchCatalog(catalogo, q, l),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: () => [], searchAlternatives: () => [],
    catalogCandidates: (r: string) => catalogo.filter((i) => i.code === r),
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (c: string) => catalogo.find((i) => i.code === c),
  };
});
vi.mock("../src/services/interbotPrices.js", () => ({
  refreshPriceForSize: async () => undefined, getInterbotPrice: () => undefined,
}));
vi.mock("../src/wa/client.js", () => ({
  sendImage: async () => "wamid-imagen", sendPdf: async () => "wamid-pdf",
}));
vi.mock("../src/render/quoteImage.js", () => ({
  renderQuoteImage: async () => Buffer.from("png"),
  renderCompareImage: async () => Buffer.from("png"),
  renderOptionsImage: async () => Buffer.from("png"),
  renderMedidaGuideImage: async () => Buffer.from("png"),
  toRenderLine: async (p: CatalogItem, quantity = 1) => ({
    brand: p.brand, design: p.design, sizeLabel: p.sizeLabel ?? p.name,
    quantity, unitPrice: p.minimumPriceWithTax, total: p.minimumPriceWithTax * quantity,
  }),
}));
vi.mock("../src/services/advisorNotifications.js", () => ({ notifyAdvisor: async () => undefined }));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { tryRecotizarPorCantidad } = await import("../src/services/recotizar.js");

/** La FALKEN ZE310R del caso: $159.49 hoy, $212.65 antes (−25 %). */
const LLANTA: CatalogItem = {
  id: "352135", code: "352135", name: "225/65R17 102V ZE310R FALKEN",
  brand: "FALKEN", design: "ZE310R",
  size: { width: 225, aspect: 65, rim: 17 }, sizeLabel: "225/65R17",
  price: 140, sourcePrice: 120, priceTier: "pvp1",
  prices: { pvp1: 140, pvp2: 140, pvp3: 140, pvp4: 140 },
  taxRate: 0.15,
  customerPriceWithTax: 212.65, minimumPriceWithTax: 159.49, distributorPriceWithTax: 130,
  stock: 8, availability: "available",
  imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
};

interface Fila { id: number; current_cycle: number }

async function conversacionConCotizacion(phone: string, cantidad: number, localElegido?: string): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_product_code, selected_quantity, nearest_store)
    values (${phone}, 'Manuel', 'open', 'cotizacion_enviada', 1, '225/65R17', '352135', ${cantidad}, ${localElegido ?? null})
    returning id, current_cycle
  `;
  await sql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
    values (${fila.id}, 1, ${sql.json([{
      code: "352135", brand: "FALKEN", design: "ZE310R", sizeLabel: "225/65R17",
      quantity: cantidad, salePriceWithTax: 159.49, listPriceWithTax: 212.65,
    }])}, 554.75, 83.21, ${159.49 * cantidad}, 'COT-VIEJA', 'AV-VIEJA')
  `;
  return fila;
}

const ctx = (fila: Fila, previousOutbound: string | null) => ({
  conversation: {
    id: fila.id, phone: "593900000101", name: "Manuel", stage: "cotizacion_enviada",
    bot_paused_until: null, status: "open", current_cycle: fila.current_cycle,
  },
  customerPhone: "593900000101",
  customerName: "Manuel",
  previousOutbound,
} as never);

/**
 * Guarda lo que el bot dijo. Hace falta de verdad: el candado de cantidad
 * grande lee la confirmación de `lastOutboundText`, o sea de la BASE, no del
 * contexto — que es exactamente como ocurre en producción.
 */
async function botDijo(id: number, texto: string) {
  await sql`
    insert into messages (conversation_id, role, content, direction, type, cycle, author_kind)
    values (${id}, 'assistant', ${texto}, 'outbound', 'text', 1, 'bot')
  `;
}

const cotizaciones = (id: number) => sql<{ items: Array<{ quantity: number }>; total: string }[]>`
  select items, total from quotes where conversation_id=${id} order by created_at
`;

const PREGUNTA_LOCAL = "¿Cuál le queda mejor, *Cumbayá* o *Quito Sur*? 📍";

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});
beforeEach(() => { catalogo = [LLANTA]; });

describe.sequential("recotizar por cantidad · la pieza sale, no la promesa", () => {
  it("EL BUG: «deme solo 3» genera la cotización nueva por 3", async () => {
    const fila = await conversacionConCotizacion("593980005001", 4);
    const reply = await tryRecotizarPorCantidad(ctx(fila, PREGUNTA_LOCAL), "deme solo 3");

    expect(reply, "la ruta tenía que atender el turno").not.toBeNull();
    const todas = await cotizaciones(fila.id);
    expect(todas).toHaveLength(2);
    expect(todas[1].items[0].quantity).toBe(3);
    expect(Number(todas[1].total)).toBeCloseTo(159.49 * 3, 2);
    // El texto NO repite lo que la foto ya muestra.
    expect(reply).toContain("se la ajusté a 3");
    expect(reply).not.toContain("159.49");
    // Y no vuelve a preguntar el local: ya está en pantalla.
    expect(reply).not.toContain("¿A cuál de los dos");
  });

  it("con el local ya elegido también recotiza, y la pregunta la pone el candado del final", async () => {
    // Esta ruta NO decide qué preguntar: su único trabajo es que salga la pieza
    // nueva. Quién pide el local o el día es `insistirConLoQueFalta`, que es el
    // único dueño de esa decisión en todo el turno (ver su suite).
    const fila = await conversacionConCotizacion("593980005002", 4, "Depot Tire Quito Sur");
    const reply = await tryRecotizarPorCantidad(ctx(fila, PREGUNTA_LOCAL), "mejor 2");

    const todas = await cotizaciones(fila.id);
    expect(todas[1].items[0].quantity).toBe(2);
    expect(Number(todas[1].total)).toBeCloseTo(159.49 * 2, 2);
    expect(reply).toContain("se la ajusté a 2");
    expect(reply).not.toMatch(/qué día/i);
  });

  it("EL CASO QUE NO DEBE DISPARAR: la misma cantidad no recotiza", async () => {
    const fila = await conversacionConCotizacion("593980005003", 4);
    expect(await tryRecotizarPorCantidad(ctx(fila, PREGUNTA_LOCAL), "quiero 4")).toBeNull();
    expect(await cotizaciones(fila.id)).toHaveLength(1);
  });

  it("el «2» del menú de preferencia NO es una cantidad nueva", async () => {
    const fila = await conversacionConCotizacion("593980005004", 4);
    const menu = "dígame una sola cosa: ¿qué prioriza usted?\n1) *Costo*\n2) *Equilibrio*\n3) *Premium*";
    expect(await tryRecotizarPorCantidad(ctx(fila, menu), "2")).toBeNull();
    expect(await cotizaciones(fila.id)).toHaveLength(1);
  });

  it("sin cotización viva no se inventa nada: cotizar por primera vez es del agente", async () => {
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size)
      values ('593980005005', 'Manuel', 'open', 'seleccionando', 1, '225/65R17')
      returning id, current_cycle
    `;
    expect(await tryRecotizarPorCantidad(ctx(fila, PREGUNTA_LOCAL), "deme 3")).toBeNull();
    expect(await cotizaciones(fila.id)).toHaveLength(0);
  });

  it("EL PEDIDO GRANDE: con más de 8 pregunta antes de firmar, no cotiza", async () => {
    const fila = await conversacionConCotizacion("593980005007", 4);
    const reply = await tryRecotizarPorCantidad(ctx(fila, PREGUNTA_LOCAL), "sabe que quiero 20 llantas en vez");

    expect(reply).toBe("Antes de cotizarle: ¿me confirma que son *20 llantas*? 👍");
    // Y NO se firmó nada todavía.
    expect(await cotizaciones(fila.id)).toHaveLength(1);
  });

  it("y con el «sí» se cotiza, sin tope", async () => {
    const fila = await conversacionConCotizacion("593980005008", 4);
    const pregunta = "Antes de cotizarle: ¿me confirma que son *20 llantas*? 👍";
    await botDijo(fila.id, pregunta);
    const reply = await tryRecotizarPorCantidad(ctx(fila, pregunta), "si");

    expect(reply).toContain("se la ajusté a 20");
    const todas = await cotizaciones(fila.id);
    expect(todas[1].items[0].quantity).toBe(20);
    expect(Number(todas[1].total)).toBeCloseTo(159.49 * 20, 2);
  });

  it("si se corrige en vez de confirmar, manda la corrección", async () => {
    const fila = await conversacionConCotizacion("593980005009", 4);
    const pregunta = "Antes de cotizarle: ¿me confirma que son *20 llantas*? 👍";
    await botDijo(fila.id, pregunta);
    const reply = await tryRecotizarPorCantidad(ctx(fila, pregunta), "no, perdon, deme 2");

    expect(reply).toContain("se la ajusté a 2");
    expect((await cotizaciones(fila.id))[1].items[0].quantity).toBe(2);
  });

  it("un «no» pelado no firma nada", async () => {
    const fila = await conversacionConCotizacion("593980005010", 4);
    const pregunta = "Antes de cotizarle: ¿me confirma que son *20 llantas*? 👍";
    expect(await tryRecotizarPorCantidad(ctx(fila, pregunta), "no")).toBeNull();
    expect(await cotizaciones(fila.id)).toHaveLength(1);
  });

  it("un mensaje sin cantidad no toca nada", async () => {
    const fila = await conversacionConCotizacion("593980005006", 4);
    expect(await tryRecotizarPorCantidad(ctx(fila, PREGUNTA_LOCAL), "al de quito")).toBeNull();
    expect(await cotizaciones(fila.id)).toHaveLength(1);
  });
});

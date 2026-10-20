import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * QUIEN COMPRA A DISTANCIA NO RECIBE «¿A CUÁL LOCAL?» DESDE LA FUENTE
 * (familia 2-E, verificación en vivo del 28-sep, R1 ×3).
 *
 * «Lo compro por este medio, me cotiza, lo cancelo y me envía, 4 llantas
 * 245/60R18» ya cotizaba en el mismo turno, pero el cierre que arma
 * `generar_cotizacion` seguía siendo «Puede pasar sin compromiso a verlas… 📍
 * Cumbayá … 📍 Quito Sur … ¿A cuál local le queda mejor ir?», y el Ángel
 * Guardián tenía que borrarlo en las tres corridas. Un candado que arregla lo
 * que la fuente rompe siempre no es un candado: es la fuente equivocada.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_compra_distancia_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const FALKEN: CatalogItem = {
  id: "FALK24560", code: "FALK24560",
  name: "LLANTA 245/60R18 FALKEN ZIEX CT60 A/S",
  brand: "FALKEN", design: "ZIEX CT60 A/S",
  size: { width: 245, aspect: 60, rim: 18 },
  sizeLabel: "245/60R18",
  price: 150, sourcePrice: 120, priceTier: "pvp1",
  prices: { pvp1: 150, pvp2: 150, pvp3: 150, pvp4: 150 },
  taxRate: 0.15,
  customerPriceWithTax: 250, minimumPriceWithTax: 192.39, distributorPriceWithTax: 170,
  stock: 12, availability: "available",
  imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
};

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (consulta: string, limite = 40) => searchCatalog([FALKEN], consulta, limite),
    searchByRim: (aro: number) => buscarPorAro([FALKEN], aro),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: () => [],
    searchAlternatives: () => [],
    catalogCandidates: (referencia: string) => [FALKEN].filter((i) => i.code === referencia),
    catalogStatus: () => ({ items: 1, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (codigo: string) => [FALKEN].find((i) => i.code === codigo),
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
const { armarContexto } = await import("../src/services/guardian.js");

const REMOTO = "Lo compro por este medio, me cotiza, lo cancelo y me envía, 4 llantas 245/60R18";

async function cotizar(phone: string, texto: string) {
  const [fila] = await sql<{ id: number; current_cycle: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Cliente', 'open', 'opciones_enviadas', 1, '245/60R18', 4)
    returning id, current_cycle
  `;
  await sql`
    insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
    values (${fila.id}, 1, 'user', 'inbound', 'customer', 'text', ${texto})
  `;
  const tools = buildTools({
    conversation: { id: fila.id, phone, name: "Cliente", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: phone,
    customerName: "Cliente",
    currentUserText: texto,
  } as never);
  const tool = tools.find((t) => t.function.name === "generar_cotizacion");
  if (!tool) throw new Error("generar_cotizacion no está registrada");
  const salida = JSON.parse(await tool.execute({ items: [{ code: "FALK24560", cantidad: 4 }], nombre_cliente: null }));
  return { ...salida, conversationId: Number(fila.id) };
}

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("el cierre de la cotización según cómo compra el cliente", () => {
  it("compra a distancia: «Un asesor le confirma pago y envío por acá», sin mapas ni pregunta de local", async () => {
    const salida = await cotizar("593997977318", REMOTO);
    expect(salida.enviada).toBe(true);
    const mensaje: string = salida.mensaje_para_enviar;
    expect(mensaje).toContain("Un asesor le confirma pago y envío por acá");
    expect(mensaje).not.toMatch(/maps\.app|goo\.gl/);
    expect(mensaje).not.toMatch(/cuál local|qué día|Puede pasar sin compromiso/i);
    expect(String(salida.regla)).not.toMatch(/a cuál local le queda mejor ir/i);
  });

  it("el guardián no recibe «DÍA DE VISITA PENDIENTE» sino COMPRA A DISTANCIA, aunque haya local elegido", async () => {
    const salida = await cotizar("593997977320", REMOTO);
    await sql`update conversations set nearest_store='Depot Tire Cumbayá' where id=${salida.conversationId}`;
    const contexto = await armarContexto(salida.conversationId, 1, "Un asesor le confirma pago y envío por acá. 🤝");
    expect(contexto).toContain("COMPRA A DISTANCIA");
    expect(contexto).not.toContain("DÍA DE VISITA PENDIENTE");
  });

  it("quien viene al local sigue recibiendo la invitación y la pregunta del local", async () => {
    const salida = await cotizar("593997977319", "sí, cotíceme esas por favor");
    expect(salida.enviada).toBe(true);
    expect(salida.mensaje_para_enviar).toMatch(/cuál local/i);
  });
});

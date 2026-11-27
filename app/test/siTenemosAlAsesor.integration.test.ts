import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * «SÍ TENEMOS» (F-01, auditoría Competimotor 26-nov): al cliente no se le
 * nombra el stock, pero el asesor NUNCA pierde el aviso de que faltan llantas.
 *
 *   (a) generar_cotizacion de 4 × KENDA KR28 235/60R16 con 2 en catálogo (chat
 *       1331): se firma el juego, el texto al cliente no trae número ni
 *       «stock», y queda la alerta `stock_insuficiente` «4 pedidas y 2».
 *   (b) el candado de salida (`asegurarAvisoDeStock`, services/stockCorto.ts)
 *       no pega el recordatorio al cliente pero sí deja la alerta al asesor.
 */
process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_si_tenemos_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

/** KENDA KR28 235/60R16 del catálogo de Competimotor del 26-nov: stock 2, B $152.95. */
const KR28: CatalogItem = {
  id: "A0264", code: "A0264", name: "KENDA 235/60R16 KR28 LB AT 104T", brand: "KENDA", design: "KR28 LB AT 104T",
  size: { width: 235, aspect: 60, rim: 16 }, sizeLabel: "235/60R16",
  price: 152.95 / 1.15, sourcePrice: 171.35, priceTier: "pvp1",
  prices: { pvp1: 171.35, pvp2: 152.95, pvp3: 139.15, pvp4: null }, taxRate: 0.15,
  customerPriceWithTax: 152.95, minimumPriceWithTax: 152.95, distributorPriceWithTax: 152.95,
  stock: 2, availability: "available", imageUrl: null, imageSource: null, loadSpeed: null, active: true,
  source: "archivo", preciosPorPago: { tarjetaConIva: 152.95, efectivoConIva: 139.15 },
} as CatalogItem;

vi.mock("../src/services/catalog.js", async () => ({
  ensureCatalogReady: async () => ({}),
  searchByText: () => [],
  searchByRim: () => [],
  searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
  searchBySize: () => [KR28],
  searchAlternatives: () => [],
  catalogCandidates: (referencia: string) => (referencia === "A0264" ? [KR28] : []),
  catalogStatus: () => ({ items: 1, error: null }),
  applyInterbotPrices: () => undefined,
  findByCode: (codigo: string) => (codigo === "A0264" ? KR28 : undefined),
  productosDelCatalogoMencionados: () => [],
}));
vi.mock("../src/services/interbotPrices.js", () => ({
  refreshPriceForSize: async () => undefined, interbotDisponible: () => false, getInterbotPrice: () => undefined,
}));
vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid-imagen", sendPdf: async () => "wamid-pdf" }));
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
vi.mock("../src/services/advisorNotifications.js", async (orig) => ({
  ...(await orig<object>()),
  notifyAdvisor: async () => ({ sent: false, skipped: true }),
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { buildTools } = await import("../src/agent/tools.js");
const { asegurarAvisoDeStock } = await import("../src/services/stockCorto.js");

async function conversacion(phone: string) {
  const [fila] = await sql<{ id: number; current_cycle: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Rodrigo', 'open', 'opciones_enviadas', 1, '235/60R16', 4)
    returning id, current_cycle
  `;
  return fila;
}

const alertas = (id: number) => sql<{ summary: string }[]>`
  select summary from bot_alerts where conversation_id=${id} and type='stock_insuficiente'
`;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("Competimotor: el asesor sabe que faltan, el cliente no oye el stock", () => {
  it("(a) 1331: cotiza 4 × KR28 con 2 en catálogo, sin número al cliente, y alerta «4 pedidas y 2»", async () => {
    const phone = "593980001331";
    const fila = await conversacion(phone);
    const tools = buildTools({
      conversation: { id: fila.id, phone, name: "Rodrigo", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: fila.current_cycle },
      customerPhone: phone, customerName: "Rodrigo", currentUserText: "sí, cotíceme la kenda por favor",
    } as never);
    const tool = tools.find((t) => t.function.name === "generar_cotizacion")!;
    const salida = JSON.parse(await tool.execute({ items: [{ code: "A0264", cantidad: 4 }], nombre_cliente: null }));

    expect(salida.enviada).toBe(true);
    expect(salida.stock_insuficiente).toBeUndefined();
    const alCliente = String(salida.mensaje_para_enviar);
    expect(alCliente).not.toMatch(/stock|disponible|\btengo \*?2\b|\bhay \*?2\b/i);

    const filas = await alertas(fila.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].summary).toMatch(/4 pedidas y 2 en catálogo/);
  });

  it("(b) el candado de salida no pega nada al cliente y deja la alerta al asesor", async () => {
    const fila = await conversacion("593980001332");
    await sql`
      insert into quotes (conversation_id, cycle, quote_number, subtotal, tax, total, items)
      values (${fila.id}, 1, 'COT-KR28X4', 532, 79.8, 611.8, ${sql.json([{
        code: "A0264", brand: "KENDA", design: "KR28", sizeLabel: "235/60R16", quantity: 4, salePriceWithTax: 152.95,
      }])})
    `;
    const texto = "Su cotización *COT-KR28X4* por *4 × KENDA KR28 235/60R16*, total *$611.80*.";

    const salida = await asegurarAvisoDeStock(fila.id, 1, texto);

    expect(salida.texto).toBe(texto);
    expect(salida.pegado).toBe(false);
    const filas = await alertas(fila.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].summary).toMatch(/4 pedidas y 2 en catálogo/);
  });
});

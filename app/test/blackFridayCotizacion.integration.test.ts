import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * BLACK FRIDAY: `generar_cotizacion` de punta a punta (sprint 1, 5-nov-2026).
 *
 * 4 × FALKEN a $75 hoy ($100 de lista) → 2 × $75 + 2 × $40 = $230 (6-nov: el 60 % es
 * sobre la lista, no encima del −25 %). Lo que se
 * afirma vive en la base y en lo que la herramienta le pasa a la pieza: el
 * total firmado, la promo guardada dentro de `items`, la pieza que la recibe,
 * y el texto que va al cliente. Y que el 1-dic se apaga sola, también al
 * recotizar.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.DIRECT_SALES_ROUTES_ENABLED = "true";

const BASE = `autoventa_black_friday_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

let catalogo: CatalogItem[] = [];
vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (q: string, l = 40) => searchCatalog(catalogo, q, l),
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
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
/** Lo que la herramienta le pasó a la pieza: la promo la dibuja el sprint de piezas. */
const piezas: Array<{ lines: Array<Record<string, unknown>>; total: number }> = [];
vi.mock("../src/render/quoteImage.js", () => ({
  renderQuoteImage: async (data: { lines: Array<Record<string, unknown>>; total: number }) => {
    piezas.push(data);
    return Buffer.from("png");
  },
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
const { buildTools } = await import("../src/agent/tools.js");
const { tryRecotizarPorCantidad } = await import("../src/services/recotizar.js");
const { ahorroVigente } = await import("../src/services/ahorroVigente.js");

function llanta(marca: string): CatalogItem {
  return {
    id: `C-${marca}`, code: `C-${marca}`, name: `205/55R16 ${marca} ZE310`,
    brand: marca, design: "ZE310",
    size: { width: 205, aspect: 55, rim: 16 }, sizeLabel: "205/55R16",
    price: 65.22, sourcePrice: 60, priceTier: "pvp1",
    prices: { pvp1: 65.22, pvp2: 65.22, pvp3: 65.22, pvp4: 65.22 },
    taxRate: 0.15,
    customerPriceWithTax: 100, minimumPriceWithTax: 75, distributorPriceWithTax: 60,
    stock: 12, availability: "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

interface Fila { id: number; current_cycle: number }
let telefono = 593980077000;

async function conversacion(localElegido: string | null = null): Promise<{ fila: Fila; phone: string }> {
  const phone = String(++telefono);
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity, nearest_store)
    values (${phone}, 'Cliente', 'open', 'opciones_enviadas', 1, '205/55R16', 4, ${localElegido})
    returning id, current_cycle
  `;
  return { fila, phone };
}

const contexto = (fila: Fila, phone: string, texto: string) => ({
  conversation: { id: fila.id, phone, name: "Cliente", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: fila.current_cycle },
  customerPhone: phone,
  customerName: "Cliente",
  currentUserText: texto,
} as never);

async function cotizar(fila: Fila, phone: string, code: string, cantidad: number) {
  const tool = buildTools(contexto(fila, phone, "sí, cotíceme esas por favor"))
    .find((t) => t.function.name === "generar_cotizacion")!;
  return JSON.parse(await tool.execute({ items: [{ code, cantidad }], nombre_cliente: null }));
}

const guardadas = (id: number) => sql<{ items: Array<Record<string, any>>; total: string; subtotal: string; tax: string }[]>`
  select items, total, subtotal, tax from quotes where conversation_id=${id} order by created_at
`;

const enNoviembre = () => vi.setSystemTime(new Date("2026-11-15T17:00:00Z"));
const enDiciembre = () => vi.setSystemTime(new Date("2026-12-01T17:00:00Z"));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await ensureSchema();
});
afterEach(() => { piezas.length = 0; });
afterAll(async () => {
  vi.useRealTimers();
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("generar_cotizacion con el Black Friday", () => {
  it("4 × FALKEN a $75 ($100 de lista): firma $230, guarda la promo y se la pasa a la pieza", async () => {
    enNoviembre();
    catalogo = [llanta("FALKEN")];
    const { fila, phone } = await conversacion();

    const salida = await cotizar(fila, phone, "C-FALKEN", 4);

    expect(salida.enviada).toBe(true);
    expect(salida.total_con_iva).toBe(230);
    const [q] = await guardadas(fila.id);
    expect(Number(q.total)).toBe(230);
    expect(Math.round((Number(q.subtotal) + Number(q.tax)) * 100)).toBe(23000);
    expect(q.items[0].segundaLlanta).toMatchObject({ porcentaje: 60, unidades: 2, precioConIva: 40, ahorroConIva: 70, totalConIva: 230 });
    // La pieza recibe la promo en la línea y el total con ella.
    expect(piezas[0].lines[0].segundaLlanta).toMatchObject({ precioConIva: 40, totalConIva: 230 });
    expect(piezas[0].total).toBe(230);
    // El ahorro que leen la ruta directa y el guardián sale de esos items.
    const ahorro = await ahorroVigente(fila.id, fila.current_cycle);
    expect(ahorro?.monto).toBe(170);
    expect(ahorro?.segundaLlanta?.ahorroConIva).toBe(70);
    // Lo que la pieza muestra, para la traba del guardián.
    const [msg] = await sql<{ metadata: { preciosMostrados: number[] } }[]>`
      select metadata from messages where conversation_id=${fila.id} and metadata->>'piece'='quote'
    `;
    expect(msg.metadata.preciosMostrados).toEqual(expect.arrayContaining([75, 40, 70, 230]));
    console.log(`\n=== TEXTO AL CLIENTE (4 × FALKEN a $75, sin local) ===\n${salida.mensaje_para_enviar}\n`);
  });

  it("con el local ya elegido, la pregunta del día dice el Black Friday con sus cifras", async () => {
    enNoviembre();
    catalogo = [llanta("FALKEN")];
    const { fila, phone } = await conversacion("Depot Tire Cumbayá");

    const salida = await cotizar(fila, phone, "C-FALKEN", 4);

    expect(salida.mensaje_para_enviar).toContain(
      "*Black Friday*: 60 % menos en su 2.ª y 4.ª llanta — 2 a *$75.00* con el *25 %* "
      + "y 2 a *$40.00* con el *60 %* — en total *$170.00* menos",
    );
    console.log(`\n=== TEXTO AL CLIENTE (4 × FALKEN a $75, local elegido) ===\n${salida.mensaje_para_enviar}\n`);
  });

  it("una marca fuera de la promo cotiza como siempre", async () => {
    enNoviembre();
    catalogo = [llanta("WINRUN")];
    const { fila, phone } = await conversacion();

    const salida = await cotizar(fila, phone, "C-WINRUN", 4);

    expect(salida.total_con_iva).toBe(300);
    const [q] = await guardadas(fila.id);
    expect(q.items[0].segundaLlanta).toBeNull();
    expect(piezas[0].lines[0].segundaLlanta).toBeNull();
  });

  it("el 1-dic ya no hay 60 %", async () => {
    enDiciembre();
    catalogo = [llanta("KENDA")];
    const { fila, phone } = await conversacion();

    const salida = await cotizar(fila, phone, "C-KENDA", 4);

    expect(salida.total_con_iva).toBe(300);
    expect((await guardadas(fila.id))[0].items[0].segundaLlanta).toBeNull();
  });

  it("recotizar de 4 a 3 en noviembre rehace la promo: 2 × $75 + 1 × $40 = $190", async () => {
    enNoviembre();
    catalogo = [llanta("KENDA")];
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-KENDA", 4);

    const reply = await tryRecotizarPorCantidad({
      conversation: { id: fila.id, phone, name: "Cliente", stage: "cotizacion_enviada", bot_paused_until: null, status: "open", current_cycle: 1 },
      customerPhone: phone, customerName: "Cliente", previousOutbound: null,
    } as never, "deme solo 3");

    expect(reply).toContain("se la ajusté a 3");
    const [, nueva] = await guardadas(fila.id);
    expect(Number(nueva.total)).toBe(190);
    expect(nueva.items[0].segundaLlanta).toMatchObject({ unidades: 1, totalConIva: 190 });
  });

  it("recotizar el 1-dic una cotización de noviembre la deja sin promo", async () => {
    enNoviembre();
    catalogo = [llanta("KENDA")];
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-KENDA", 4);
    enDiciembre();

    await tryRecotizarPorCantidad({
      conversation: { id: fila.id, phone, name: "Cliente", stage: "cotizacion_enviada", bot_paused_until: null, status: "open", current_cycle: 1 },
      customerPhone: phone, customerName: "Cliente", previousOutbound: null,
    } as never, "deme solo 2");

    const [, nueva] = await guardadas(fila.id);
    // Sin la promo vuelve el camino de siempre, que ida y vuelta por el
    // precio sin IVA da $149.99 con 2 × $75 (deriva vieja, fuera de este sprint).
    expect(Number(nueva.total)).toBeCloseTo(150, 1);
    expect(nueva.items[0].segundaLlanta).toBeNull();
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * COTIZAR MÁS UNIDADES QUE EL STOCK AVISA (P-02, reunión del 25-ago-2026).
 *
 * Joaquín: «hay una medida 195/55R15 con UNA unidad y el bot cotiza las 4
 * llantas de esa unidad». El cliente se lleva un número de cotización por un
 * juego que no existe y se entera en el local, que es el peor momento posible.
 *
 * La decisión NO es bloquear: el stock que llega de Contífico viene desfasado y
 * negarse a cotizar pierde la venta justo cuando en bodega sí están — el caso
 * más común. Se cotiza, se dice cuántas hay hoy, y se le abre una tarea al
 * asesor para que confirme el resto.
 *
 * Va de integración porque dos de las tres cosas que se afirman viven en la
 * base: la alerta que se crea y la cotización que sí se registra.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_stock_insuficiente_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

/** El catálogo del caso; cada test lo arma con el stock que quiere probar. */
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

// El precio del Interbot no es lo que se prueba aquí: sin respuesta viva, el
// precio que firma la cotización es el del catálogo, que es determinístico.
vi.mock("../src/services/interbotPrices.js", () => ({
  refreshPriceForSize: async () => undefined,
  getInterbotPrice: () => undefined,
}));

// La pieza y los envíos por WhatsApp son de otra suite (`piezas.test.ts`).
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

/** La 195/55R15 del reporte de Joaquín; el stock lo pone cada test. */
function llanta(stock: number): CatalogItem {
  return {
    id: "K425B015", code: "K425B015",
    name: "LLANTA 195/55R15 KENDA KR203",
    brand: "KENDA", design: "KR203",
    size: { width: 195, aspect: 55, rim: 15 },
    sizeLabel: "195/55R15",
    price: 60, sourcePrice: 48, priceTier: "pvp1",
    prices: { pvp1: 60, pvp2: 60, pvp3: 60, pvp4: 60 },
    taxRate: 0.15,
    customerPriceWithTax: 82, minimumPriceWithTax: 69, distributorPriceWithTax: 55,
    stock,
    availability: stock <= 0 ? "out" : stock < 4 ? "check" : "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

interface Fila { id: number; current_cycle: number }

async function conversacion(phone: string, cantidadConfirmada: number): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Cliente', 'open', 'opciones_enviadas', 1, '195/55R15', ${cantidadConfirmada})
    returning id, current_cycle
  `;
  return fila;
}

async function cotizar(fila: Fila, phone: string, cantidad: number) {
  const tools = buildTools({
    conversation: { id: fila.id, phone, name: "Cliente", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: fila.current_cycle },
    customerPhone: phone,
    customerName: "Cliente",
    currentUserText: "sí, cotíceme esas por favor",
  } as never);
  const tool = tools.find((t) => t.function.name === "generar_cotizacion");
  if (!tool) throw new Error("generar_cotizacion no está registrada");
  return JSON.parse(await tool.execute({ items: [{ code: "K425B015", cantidad }], nombre_cliente: null }));
}

async function alertasDe(conversationId: number, tipo: string) {
  return sql<{ summary: string; exact_reason: string; priority: string }[]>`
    select summary, exact_reason, priority from bot_alerts
    where conversation_id=${conversationId} and type=${tipo}
  `;
}

beforeAll(async () => {
  await ensureSchema();
});

afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

beforeEach(() => {
  catalogo = [llanta(1)];
});

describe.sequential("generar_cotizacion · cotizar más de lo que hay avisa, no bloquea", () => {
  it("con 1 en stock y 4 pedidas: cotiza igual, lo dice y abre la tarea al asesor", async () => {
    const phone = "593980002001";
    const fila = await conversacion(phone, 4);

    const salida = await cotizar(fila, phone, 4);

    // (0) La venta NO se pierde: la cotización existe y tiene su número.
    expect(salida.enviada).toBe(true);
    expect(salida.numero).toMatch(/^COT-/);
    const [guardada] = await sql<{ n: string }[]>`
      select count(*)::text as n from quotes where conversation_id=${fila.id}
    `;
    expect(guardada.n).toBe("1");

    // (a) el resultado lo declara
    expect(salida.stock_insuficiente).toEqual({ stock_hoy: 1, solicitadas: 4 });

    // (b) el mensaje al cliente dice cuántas hay hoy y quién confirma el resto
    const mensaje: string = salida.mensaje_para_enviar;
    expect(mensaje).toMatch(/hoy tengo \*1\* disponible/);
    expect(mensaje).toMatch(/usted pidió \*4\*/);
    expect(mensaje).toMatch(/asesor/i);
    // Y el objetivo del turno sigue en pie: el aviso no desplazó la visita.
    expect(mensaje).toMatch(/qué día|cuál local|Cumbayá|Quito Sur/i);

    // (c) la alerta para el asesor
    const alertas = await alertasDe(fila.id, "stock_insuficiente");
    expect(alertas).toHaveLength(1);
    expect(alertas[0].summary).toMatch(/4 pedidas y 1 en catálogo/);
    expect(alertas[0].exact_reason).toMatch(/KENDA KR203 195\/55R15/);
    expect(alertas[0].priority).toBe("high");
  });

  it("con stock de sobra no avisa nada ni molesta al asesor", async () => {
    catalogo = [llanta(8)];
    const phone = "593980002002";
    const fila = await conversacion(phone, 2);

    const salida = await cotizar(fila, phone, 2);

    expect(salida.enviada).toBe(true);
    expect(salida.stock_insuficiente).toBeUndefined();
    expect(salida.mensaje_para_enviar).not.toMatch(/disponible[s]? y usted pidió/);
    expect(await alertasDe(fila.id, "stock_insuficiente")).toHaveLength(0);
  });

  it("pedir exactamente lo que hay tampoco avisa", async () => {
    // El límite: 3 pedidas con 3 en stock es una venta normal, no una excepción.
    catalogo = [llanta(3)];
    const phone = "593980002003";
    const fila = await conversacion(phone, 3);

    const salida = await cotizar(fila, phone, 3);

    expect(salida.stock_insuficiente).toBeUndefined();
    expect(await alertasDe(fila.id, "stock_insuficiente")).toHaveLength(0);
  });

  it("el agotado sigue bloqueado: no se cotiza lo que está en cero", async () => {
    // El aviso es para el stock corto; el cero ya tenía su propio candado y no
    // se toca — cotizar cuatro de cero no es «avisar», es inventar.
    catalogo = [llanta(0)];
    const phone = "593980002004";
    const fila = await conversacion(phone, 4);

    const salida = await cotizar(fila, phone, 4);

    expect(salida.error).toMatch(/agotada/i);
    expect(salida.enviada).toBeUndefined();
    expect(await alertasDe(fila.id, "stock_insuficiente")).toHaveLength(0);
  });

  it("la regla le prohíbe al modelo prometer las que faltan", async () => {
    const phone = "593980002005";
    const fila = await conversacion(phone, 4);

    const salida = await cotizar(fila, phone, 4);

    expect(salida.regla).toMatch(/NO prometas/);
    expect(salida.regla).toMatch(/confirma el asesor/);
    // Y no perdió la orden de siempre.
    expect(salida.regla).toMatch(/mensaje_para_enviar/);
  });
});

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
 * La decisión de Joaquín NO era bloquear: el stock que llega de Contífico viene
 * desfasado y negarse a cotizar pierde la venta justo cuando en bodega sí están.
 * Se cotiza, se dice cuántas hay hoy, y se le abre una tarea al asesor.
 *
 * PERO ESO VALE MIENTRAS EL DESFASE SEA CREÍBLE (Manuel, 27-ago-2026). Se hizo
 * tal cual y el caso de Joaquín volvió a pasar, con su misma forma: conv 11720,
 * 215/50R17, UNA unidad, cotización firmada por 4 × $105.88 = $423.52 con el
 * aviso pegado detrás. Un aviso detrás de una promesa no deshace la promesa.
 * Así que la raya se puso en la mitad de lo pedido (`alcanzaParaVender`):
 *
 *   3 de 4 → se cotiza y se avisa, como quería Joaquín.
 *   1 de 4 → NO se firma; se dice cuántas hay y se ofrece pedido o las que hay.
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

async function cotizar(fila: Fila, phone: string, cantidad: number, texto = "sí, cotíceme esas por favor") {
  const tools = buildTools({
    conversation: { id: fila.id, phone, name: "Cliente", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: fila.current_cycle },
    customerPhone: phone,
    customerName: "Cliente",
    currentUserText: texto,
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
  // 3 de 4: el desfase creíble, que SÍ se cotiza con aviso. El caso de 1 de 4
  // tiene su propio bloque abajo, y ahí ya no se firma.
  catalogo = [llanta(3)];
});

describe.sequential("generar_cotizacion · faltando poco se cotiza y se avisa", () => {
  it("con 3 en stock y 4 pedidas: cotiza igual, lo dice y abre la tarea al asesor", async () => {
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
    expect(salida.stock_insuficiente).toEqual({ stock_hoy: 3, solicitadas: 4 });

    // (b) el mensaje al cliente dice cuántas hay hoy y quién confirma el resto
    const mensaje: string = salida.mensaje_para_enviar;
    expect(mensaje).toMatch(/hoy tengo \*3\* disponibles/);
    expect(mensaje).toMatch(/usted pidió \*4\*/);
    expect(mensaje).toMatch(/asesor/i);
    // Y el objetivo del turno sigue en pie: el aviso no desplazó la visita.
    expect(mensaje).toMatch(/qué día|cuál local|Cumbayá|Quito Sur/i);

    // (c) la alerta para el asesor
    const alertas = await alertasDe(fila.id, "stock_insuficiente");
    expect(alertas).toHaveLength(1);
    expect(alertas[0].summary).toMatch(/4 pedidas y 3 en catálogo/);
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

/**
 * EL ESCALÓN DE ARRIBA: cuando falta más de la mitad, no se firma.
 *
 * Producción, 27-ago, conv 11720. Es el mismo caso que Joaquín reportó el
 * 25-ago —una medida con una unidad y el bot cotizando las cuatro— y que el
 * aviso del 26-ago no evitó, porque avisar no es negarse.
 */
describe.sequential("generar_cotizacion · faltando más de la mitad NO se firma", () => {
  beforeEach(() => { catalogo = [llanta(1)]; });

  it("con 1 en stock y 4 pedidas: no hay cotización, hay una salida ofrecida", async () => {
    const phone = "593980002010";
    const fila = await conversacion(phone, 4);

    const salida = await cotizar(fila, phone, 4);

    // (0) NO se firmó nada: ni número, ni fila en quotes.
    expect(salida.error).toBe("stock_no_alcanza");
    expect(salida.enviada).toBeUndefined();
    const [guardada] = await sql<{ n: string }[]>`
      select count(*)::text as n from quotes where conversation_id=${fila.id}
    `;
    expect(guardada.n).toBe("0");

    // (a) el resultado trae los números para que el modelo los diga
    expect(salida.stock_hoy).toBe(1);
    expect(salida.solicitadas).toBe(4);
    expect(salida.llanta).toMatch(/KENDA KR203 195\/55R15/);

    // (b) la regla no lo deja terminar el turno con la mala noticia sola
    expect(salida.regla).toMatch(/hoy hay 1/);
    expect(salida.regla).toMatch(/cotizarle las que hay/);
    expect(salida.regla).toMatch(/pedido/);
    expect(salida.regla).toMatch(/PROHIBIDO cotizar la cantidad original/);

    // (c) el asesor se entera igual: es la mitad del valor del candado.
    const alertas = await alertasDe(fila.id, "stock_insuficiente");
    expect(alertas).toHaveLength(1);
    expect(alertas[0].priority).toBe("high");
    expect(alertas[0].summary).toMatch(/No se firmó el juego/);
  });

  it("EL CASO QUE NO DEBE DISPARAR: pedir 1 con 1 en stock se cotiza normal", async () => {
    // El candado mira la distancia, no el número: si pide una y hay una,
    // alcanza y no pasa nada.
    const phone = "593980002011";
    const fila = await conversacion(phone, 1);

    const salida = await cotizar(fila, phone, 1);

    expect(salida.error).toBeUndefined();
    expect(salida.enviada).toBe(true);
    expect(await alertasDe(fila.id, "stock_insuficiente")).toHaveLength(0);
  });

  it("EL BORDE: 2 de 4 todavía se firma con aviso", async () => {
    catalogo = [llanta(2)];
    const phone = "593980002012";
    const fila = await conversacion(phone, 4);

    const salida = await cotizar(fila, phone, 4);

    expect(salida.enviada).toBe(true);
    expect(salida.stock_insuficiente).toEqual({ stock_hoy: 2, solicitadas: 4 });
  });
});

describe.sequential("generar_cotizacion · el número del menú no es una cantidad", () => {
  /*
   * Visto en vivo el 26-ago (conv 3): el cliente contestó «2» al menú
   * 1 Costo / 2 Equilibrio / 3 Premium; el modelo eligió bien la llanta
   * equilibrada… y cotizó DOS unidades. Con el menú como último saliente y el
   * mensaje siendo el puro número, la cantidad no fue dicha: juego de 4.
   */
  it("«2» tras el menú de preferencia cotiza el juego de 4 y lo aclara", async () => {
    const fila = await conversacion("593977100301", 4);
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${fila.id}, ${fila.current_cycle}, 'assistant', 'outbound',
        'Para afinarle la recomendación sobre las opciones que le envié, dígame una sola cosa: ¿qué prioriza usted?', 'text')
    `;

    const salida = await cotizar(fila, "593977100301", 2, "2");

    expect(salida.cotizacion_generada).not.toBe(false);
    const [quote] = await sql<{ items: { quantity: number }[] }[]>`
      select items from quotes where conversation_id=${fila.id} order by created_at desc limit 1
    `;
    expect(quote.items[0].quantity).toBe(4);
    expect(salida.mensaje_para_enviar).toMatch(/juego de 4/i);
  });

  it("sin el menú de por medio, un «2» con cantidad 2 se respeta", async () => {
    const fila = await conversacion("593977100302", 2);

    const salida = await cotizar(fila, "593977100302", 2, "2");

    expect(salida.cotizacion_generada).not.toBe(false);
    const [quote] = await sql<{ items: { quantity: number }[] }[]>`
      select items from quotes where conversation_id=${fila.id} order by created_at desc limit 1
    `;
    expect(quote.items[0].quantity).toBe(2);
    expect(salida.mensaje_para_enviar ?? "").not.toMatch(/juego de 4/i);
  });

  it("«quiero 2 llantas» explícito jamás se pisa, aunque el menú esté arriba", async () => {
    const fila = await conversacion("593977100303", 2);
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type)
      values (${fila.id}, ${fila.current_cycle}, 'assistant', 'outbound',
        '…dígame una sola cosa: ¿qué prioriza usted?', 'text')
    `;

    const salida = await cotizar(fila, "593977100303", 2, "quiero 2 llantas");

    const [quote] = await sql<{ items: { quantity: number }[] }[]>`
      select items from quotes where conversation_id=${fila.id} order by created_at desc limit 1
    `;
    expect(quote.items[0].quantity).toBe(2);
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * SPRINT 3 · CANTIDADES — LO QUE SOLO SE VE CON LA BASE.
 *
 * 3.1 (39535): «Las 1-2-3 por favor» a un menú de 3, con 4 llantas ya pedidas:
 *     la ficha sigue en 4. Antes se guardaba «1 llanta» y la cotización de la 3
 *     salía por 1.
 * 3.4 (39519): menú armado para 1 llanta («Una 235/75…») + «La 1»: la cotización
 *     es de 1 llanta Y el cliente lo lee («con *1 llanta*»); nunca 4 en silencio.
 *     Lo sano: menú de 4 + «La 1» = 4 llantas, y el candado que evita leer el
 *     «1» del menú como «1 llanta» sigue puesto cuando el modelo lo confunde.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";
process.env.DIRECT_SALES_ROUTES_ENABLED = "true";

const BASE = `autoventa_cantidades_9nov_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

function llanta(code: string, marca: string, diseno: string, precio: number): CatalogItem {
  return {
    id: code, code, name: `235/75R15 ${marca} ${diseno}`, brand: marca, design: diseno,
    size: { width: 235, aspect: 75, rim: 15 }, sizeLabel: "235/75R15",
    price: precio / 1.15, sourcePrice: precio / 1.3, priceTier: "pvp1",
    prices: { pvp1: precio / 1.15, pvp2: precio / 1.15, pvp3: precio / 1.15, pvp4: precio / 1.15 },
    taxRate: 0.15, customerPriceWithTax: precio, minimumPriceWithTax: precio, distributorPriceWithTax: precio * 0.8,
    stock: 24, availability: "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}
const CATALOGO = [
  llanta("35222009", "KENDA", "KR601", 181.69),
  llanta("3808B509", "KENDA", "KR29", 194.3),
  llanta("356388", "FALKEN", "WILDPEAK A/T 4W", 209.15),
];

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (q: string, l = 40) => searchCatalog(CATALOGO, q, l),
    searchByRim: (aro: number) => buscarPorAro(CATALOGO, aro),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: () => [], searchAlternatives: () => [],
    catalogCandidates: (r: string) => CATALOGO.filter((i) => i.code === r),
    catalogStatus: () => ({ items: CATALOGO.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (c: string) => CATALOGO.find((i) => i.code === c),
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
const { buildTools } = await import("../src/agent/tools.js");
const { tryCotizarLoElegido } = await import("../src/services/cotizarLoElegido.js");
const { cantidadPedidaPorElCliente, cantidadDelTexto } = await import("../src/domain/salesIntent.js");

const MENU_TEXTO = "1 · KENDA KR601 — $181.69 c/u\n2 · KENDA KR29 — $194.30 c/u\n3 · FALKEN WILDPEAK A/T 4W — $209.15 c/u";
const PREGUNTA_MENU = "¿Le cotizo la 1, la 2 o la 3?";
const ESCALONES = {
  economica: { codigo: "35222009", nombre: "KENDA KR601", precio_con_iva: 181.69 },
  equilibrada: { codigo: "3808B509", nombre: "KENDA KR29", precio_con_iva: 194.3 },
  premium: { codigo: "356388", nombre: "FALKEN WILDPEAK A/T 4W", precio_con_iva: 209.15 },
};

interface Fila { id: number; current_cycle: number }
let telefono = 593980099000;

/** Un hilo como el de 39519/39535: pedido → lámina → texto del menú, y la ficha con `guardada`. */
async function hilo(opts: { guardada: number | null; cantidadDelMenu: number; pedido: string }) {
  const phone = String(++telefono);
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Cliente', 'open', 'opciones_enviadas', 1, '235/75R15', ${opts.guardada})
    returning id, current_cycle
  `;
  const msg = (role: string, direction: string, kind: string, content: string, metadata: object) => sql`
    insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, metadata)
    values (${fila.id}, 1, ${role}, ${direction}, ${kind}, ${kind === "customer" ? "text" : "text"}, ${content}, ${sql.json(metadata as never)})
  `;
  await msg("user", "inbound", "customer", opts.pedido, {});
  await msg("assistant", "outbound", "bot", "Opciones enviadas: KENDA KR601 · KENDA KR29 · FALKEN WILDPEAK A/T 4W", {
    piece: "options", codes: ["35222009", "3808B509", "356388"], cantidad: opts.cantidadDelMenu, escalones: ESCALONES,
  });
  await msg("assistant", "outbound", "bot", MENU_TEXTO, {});
  await msg("assistant", "outbound", "bot", PREGUNTA_MENU, {
    oferta: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3, cantidad: opts.cantidadDelMenu },
  });
  const conversation = { id: fila.id, phone, name: "Cliente", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: 1 };
  return { fila, phone, conversation };
}

async function responder(h: Awaited<ReturnType<typeof hilo>>, texto: string) {
  await sql`
    insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
    values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', ${texto})
  `;
  return tryCotizarLoElegido({
    conversation: h.conversation as never, customerPhone: h.phone, customerName: "Cliente",
    previousOutbound: PREGUNTA_MENU,
  }, texto);
}

const fichaCantidad = async (id: number) =>
  (await sql<{ selected_quantity: number | null }[]>`select selected_quantity from conversations where id=${id}`)[0].selected_quantity;
const cotizaciones = (id: number) =>
  sql<{ items: Array<Record<string, any>> }[]>`select items from quotes where conversation_id=${id} order by created_at`;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("3.1 · «Las 1-2-3 por favor» (39535)", () => {
  it("pregunta cuál y la ficha sigue en 4: no se guarda «1 llanta»", async () => {
    const h = await hilo({ guardada: 4, cantidadDelMenu: 4, pedido: "Necesito 4 llantas 225/70R16 para un Gran Vitara. SZ precio por favor" });
    const respuesta = await responder(h, "Las 1-2-3 por favor");
    expect(respuesta).toMatch(/¿Cuál le cotizo, la 1, la 2 o la 3\?/);
    expect(respuesta).not.toMatch(/1 llanta/i);
    expect(await fichaCantidad(h.fila.id)).toBe(4);
  });

  it("después, «3 Falken» cotiza las 4 que pidió, no 1", async () => {
    const h = await hilo({ guardada: 4, cantidadDelMenu: 4, pedido: "Necesito 4 llantas 235/75R15 para una Hilux" });
    const r1 = await responder(h, "Las 1-2-3 por favor");
    // Como en producción: la pregunta del bot queda guardada con su oferta de menú.
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, metadata)
              values (${h.fila.id}, 1, 'assistant', 'outbound', 'bot', 'text', ${r1 ?? ""},
                      ${sql.json({ oferta: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3, sinElegir: true } } as never)})`;
    await responder(h, "3 Falken");
    const [q] = await cotizaciones(h.fila.id);
    expect(q.items[0].quantity).toBe(4);
  });

  it("lo sano: «4 llantas» a un menú abierto sí se guarda", async () => {
    const h = await hilo({ guardada: null, cantidadDelMenu: 4, pedido: "precio 235/75R15" });
    const respuesta = await responder(h, "4 llantas\nQuiero");
    expect(respuesta).toMatch(/¿Cuál le cotizo/);
    expect(await fichaCantidad(h.fila.id)).toBe(4);
  });
});

describe.sequential("3.4 · el menú de 1 llanta no se cotiza por 4 en silencio (39519)", () => {
  it("menú cantidad:1 + «La 1» (ruta directa): cotiza 1 llanta y lo dice", async () => {
    const h = await hilo({ guardada: 1, cantidadDelMenu: 1, pedido: "Una 235 /75 Rin 15 Para una Toyota Hilux" });
    const respuesta = await responder(h, "La 1");
    const [q] = await cotizaciones(h.fila.id);
    expect(q.items[0].quantity).toBe(1);
    expect(respuesta).toMatch(/Le dejo la cotización por \*1 llanta\* 👍/);
  });

  it("lo sano: menú de 4 + «La 1» cotiza 4 y no agrega aviso de cantidad (39991)", async () => {
    const h = await hilo({ guardada: null, cantidadDelMenu: 4, pedido: "Necesito 245/70/16" });
    const respuesta = await responder(h, "La 1");
    const [q] = await cotizaciones(h.fila.id);
    expect(q.items[0].quantity).toBe(4);
    expect(respuesta).not.toMatch(/llantas?\*/);
  });

  it("turno normal: el modelo pasa cantidad:1 = «la 1» y la ficha dice 4 → se cotiza 4 con su aviso (candado de 26-ago intacto)", async () => {
    const h = await hilo({ guardada: 4, cantidadDelMenu: 4, pedido: "Necesito 4 llantas 235/75R15" });
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', 'La 1')`;
    const tool = buildTools({
      conversation: h.conversation, customerPhone: h.phone, customerName: "Cliente", currentUserText: "La 1",
    } as never).find((t) => t.function.name === "generar_cotizacion")!;
    const salida = JSON.parse(await tool.execute({ items: [{ code: "35222009", cantidad: 1 }], nombre_cliente: null }));
    expect(salida.enviada).toBe(true);
    const [q] = await cotizaciones(h.fila.id);
    expect(q.items[0].quantity).toBe(4);
  });

  it("turno normal: el cliente pidió UNA y la ficha dice 1 → «La 1» cotiza 1, no 4", async () => {
    const h = await hilo({ guardada: 1, cantidadDelMenu: 1, pedido: "Una 235 /75 Rin 15" });
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', 'La 1')`;
    const tool = buildTools({
      conversation: h.conversation, customerPhone: h.phone, customerName: "Cliente", currentUserText: "La 1",
    } as never).find((t) => t.function.name === "generar_cotizacion")!;
    const salida = JSON.parse(await tool.execute({ items: [{ code: "35222009", cantidad: 1 }], nombre_cliente: null }));
    expect(salida.enviada).toBe(true);
    const [q] = await cotizaciones(h.fila.id);
    expect(q.items[0].quantity).toBe(1);
  });
});

describe.sequential("3.5 · la cantidad que el cliente dijo junto a la medida llega a la ficha y al menú (40137)", () => {
  async function menuSinCantidadDeclarada(textoDelTurno: string, ficha: number | null, dichoAntes: string) {
    const phone = String(++telefono);
    const [fila] = await sql<Fila[]>`
      insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
      values (${phone}, 'Cliente', 'open', 'medida_confirmada', 1, '235/75R15', ${ficha})
      returning id, current_cycle
    `;
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${fila.id}, 1, 'user', 'inbound', 'customer', 'text', ${dichoAntes})`;
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${fila.id}, 1, 'user', 'inbound', 'customer', 'text', ${textoDelTurno})`;
    const tool = buildTools({
      conversation: { id: fila.id, phone, name: "Cliente", stage: "medida_confirmada", bot_paused_until: null, status: "open", current_cycle: 1 },
      customerPhone: phone, customerName: "Cliente", currentUserText: textoDelTurno,
    } as never).find((t) => t.function.name === "preparar_opciones")!;
    // El modelo NO declara cantidad (como en 40137).
    const salida = JSON.parse(await tool.execute({ codes: ["35222009", "3808B509", "356388"], nombre_cliente: "Cliente", recomendado: "3808B509", motivo: "equilibrio entre precio y duración", cantidad: null }));
    return { fila, salida };
  }

  // Con Black Friday, 3 llantas llevan UNA con el 60 % y 4 llevan DOS: el menú dice para cuántas se armó.
  const llantasConPromo = (salida: any) => salida.escalones.premium.segunda_llanta.unidades;

  it("«tres llantas» dicho con la medida y ficha vacía: el menú sale por 3 y la ficha queda en 3", async () => {
    const { fila, salida } = await menuSinCantidadDeclarada("mándeme las opciones", null, "235 75 rin 15 tres llantas por favor me cotizas");
    expect(await fichaCantidad(fila.id)).toBe(3);
    expect(llantasConPromo(salida)).toBe(1);
  });

  it("lo sano: sin ninguna cantidad dicha el menú sale por 4 y la ficha no se inventa", async () => {
    const { fila, salida } = await menuSinCantidadDeclarada("mándeme las opciones", null, "235 75 rin 15 por favor");
    expect(await fichaCantidad(fila.id)).toBeNull();
    expect(llantasConPromo(salida)).toBe(2);
  });

  it("una ficha sucia (235) no viaja: se lee como sin cantidad y el menú sale por 4", async () => {
    const { salida } = await menuSinCantidadDeclarada("mándeme las opciones", 235, "235 75 rin 15 por favor");
    expect(llantasConPromo(salida)).toBe(2);
  });
});

describe.sequential("el lector de Sprint 1 (`cantidadDelCliente`) hereda los arreglos de este sprint", () => {
  it("«Las 1-2-3 por favor» al menú no es cantidad (turno ni historial)", async () => {
    const { cantidadDelCliente } = await import("../src/services/lineasConPromo.js");
    const h = await hilo({ guardada: null, cantidadDelMenu: 4, pedido: "Necesito 235/75R15 para una Hilux" });
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', 'Las 1-2-3 por favor')`;
    const q = await cantidadDelCliente(h.fila.id, "Las 1-2-3 por favor");
    expect(q.turno).toBeNull();
    expect(q.historial).toBeNull();
    expect(q.cantidad).toBeNull();
  });

  it("una ficha sucia (235) se lee como sin cantidad; el ancho de la medida no es historial", async () => {
    const { cantidadDelCliente } = await import("../src/services/lineasConPromo.js");
    const h = await hilo({ guardada: 235, cantidadDelMenu: 4, pedido: "Buenas tardes necesito\n235:75+15 r" });
    const q = await cantidadDelCliente(h.fila.id);
    expect(q.ficha).toBeNull();
    expect(q.cantidad).toBeNull();
  });

  it("lo sano: ficha 4 sigue siendo 4, y «tres llantas» sigue siendo 3", async () => {
    const { cantidadDelCliente } = await import("../src/services/lineasConPromo.js");
    const sana = await hilo({ guardada: 4, cantidadDelMenu: 4, pedido: "Necesito 4 llantas 225/70R16" });
    expect((await cantidadDelCliente(sana.fila.id)).ficha).toBe(4);
    const tres = await hilo({ guardada: null, cantidadDelMenu: 4, pedido: "225 70 rin 16 tres llantas por favor me cotizas" });
    expect((await cantidadDelCliente(tres.fila.id, "225 70 rin 16 tres llantas por favor me cotizas")).cantidad).toBe(3);
  });
});

describe.sequential("el candado de la ficha: ningún número que no sea cantidad entra", () => {
  it("updateConversationFacts descarta 235, 0, 101 y 2.5; acepta 1 y 100", async () => {
    const { updateConversationFacts } = await import("../src/services/conversations.js");
    const h = await hilo({ guardada: null, cantidadDelMenu: 4, pedido: "x" });
    for (const malo of [235, 0, 101, 2.5, 500]) {
      await updateConversationFacts(h.fila.id, { selectedQuantity: malo });
      expect(await fichaCantidad(h.fila.id)).toBeNull();
    }
    await updateConversationFacts(h.fila.id, { selectedQuantity: 1 });
    expect(await fichaCantidad(h.fila.id)).toBe(1);
    await updateConversationFacts(h.fila.id, { selectedQuantity: 235 });
    expect(await fichaCantidad(h.fila.id)).toBe(1);
    await updateConversationFacts(h.fila.id, { selectedQuantity: 100 });
    expect(await fichaCantidad(h.fila.id)).toBe(100);
  });
});

describe.sequential("3.5b · 40137 en el orden REAL: menú → «tres llantas» con la medida → «La 2»", () => {
  it("la ficha está vacía y el agente no llamó a preparar_opciones: «La 2» cotiza 3, no 4", async () => {
    const h = await hilo({ guardada: null, cantidadDelMenu: 4, pedido: "Hola, 235/75R15" });
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', '235 75 rin 15 tres llantas por favor me cotizas')`;
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, metadata)
              values (${h.fila.id}, 1, 'assistant', 'outbound', 'bot', 'text', 'Sí, le cotizo 3 llantas. ¿Cuál prefiere?', ${sql.json({} as never)})`;
    expect(await fichaCantidad(h.fila.id)).toBeNull();
    const respuesta = await responder(h, "La 2");
    const [q] = await cotizaciones(h.fila.id);
    expect(q.items[0].quantity).toBe(3);
    expect(respuesta).toMatch(/por \*3 llantas\*/);
  });
});

describe.sequential("3.5c · 40137 con la ficha en el 4 que el modelo declaró por defecto", () => {
  it("medida sola (ficha 4) → menú → «tres llantas» → «La 2»: manda lo que dijo el cliente, cotiza 3 y la ficha pasa a 3", async () => {
    const h = await hilo({ guardada: 4, cantidadDelMenu: 4, pedido: "235/75R15" });
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', '235 75 rin 15 tres llantas por favor me cotizas')`;
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, metadata)
              values (${h.fila.id}, 1, 'assistant', 'outbound', 'bot', 'text', 'Perfecto, para *3 llantas* queda así', ${sql.json({} as never)})`;
    await responder(h, "La 2");
    const [q] = await cotizaciones(h.fila.id);
    expect(q.items[0].quantity).toBe(3);
    expect(await fichaCantidad(h.fila.id)).toBe(3);
  });
});

describe.sequential("3.1b · «Las 1-2-3 por favor quiero ver» no recotiza por 1 (puertas de la recotización)", () => {
  it("cantidadPedidaPorElCliente y cantidadDelTexto: enumeración con más palabras = null", () => {
    for (const t of ["Las 1-2-3 por favor quiero ver", "las 1 y 3 cuanto cuestan"]) {
      expect(cantidadPedidaPorElCliente(t, MENU_TEXTO + "\n" + PREGUNTA_MENU)).toBeNull();
      expect(cantidadDelTexto(t, MENU_TEXTO + "\n" + PREGUNTA_MENU)).toBeNull();
    }
  });
});

describe.sequential("3.1c · cotización vigente + lámina + menú + enumeración: no se recotiza por 1 (puerta de recotizar.ts)", () => {
  it.each(["Las 1-2-3 por favor quiero ver", "las 1 y 3 cuanto cuestan"])("«%s»", async (texto) => {
    const { tryRecotizarPorCantidad } = await import("../src/services/recotizar.js");
    const h = await hilo({ guardada: 4, cantidadDelMenu: 4, pedido: "Necesito 4 llantas 235/75R15" });
    await responder(h, "La 1"); // cotización vigente de 4
    // …y después, como en 39601, una lámina nueva y un menú.
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, metadata)
              values (${h.fila.id}, 1, 'assistant', 'outbound', 'bot', 'text', ${MENU_TEXTO + "\n" + PREGUNTA_MENU},
                      ${sql.json({ oferta: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3 } } as never)})`;
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', ${texto})`;
    const antes = (await cotizaciones(h.fila.id)).length;
    const r = await tryRecotizarPorCantidad({
      conversation: h.conversation as never, customerPhone: h.phone, customerName: "Cliente",
      previousOutbound: MENU_TEXTO + "\n" + PREGUNTA_MENU,
    } as never, texto);
    expect(r).toBeNull();
    expect((await cotizaciones(h.fila.id)).length).toBe(antes);
  });
});

describe.sequential("ronda 2 · lo dicho antes solo le gana a la ficha si es POSTERIOR a la pieza que la fijó", () => {
  async function conLa1(opts: { guardada: number | null; cantidadDelMenu: number; pedido: string }, despuesDelMenu: string[] = []) {
    const h = await hilo(opts);
    for (const t of despuesDelMenu) {
      await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
                values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', ${t})`;
    }
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
              values (${h.fila.id}, 1, 'user', 'inbound', 'customer', 'text', 'La 1')`;
    const { cantidadDelCliente } = await import("../src/services/lineasConPromo.js");
    return { h, q: await cantidadDelCliente(h.fila.id, "La 1") };
  }

  it("ficha 20 (la fijó la lámina de 20) y un «4 llantas» ANTERIOR a la lámina: manda la ficha, 20", async () => {
    const { q } = await conLa1({ guardada: 20, cantidadDelMenu: 20, pedido: "Necesito 4 llantas 235/75R15" });
    expect(q.cantidad).toBe(20);
  });

  it("ficha 2 (las de adelante) y un «4» dicho antes de la lámina: manda la ficha, 2", async () => {
    const { q } = await conLa1({ guardada: 2, cantidadDelMenu: 2, pedido: "Necesito 4 llantas 235/75R15, las de adelante" });
    expect(q.cantidad).toBe(2);
  });

  it("«las de adelante» DESPUÉS del menú (sin número) no cambia nada: ficha 2", async () => {
    const { q } = await conLa1({ guardada: 2, cantidadDelMenu: 2, pedido: "Necesito 4 llantas 235/75R15" }, ["son las de adelante"]);
    expect(q.cantidad).toBe(2);
  });

  it("40137 con el 4 por defecto del menú y «tres llantas» DESPUÉS de la lámina: gana lo que dijo, 3", async () => {
    const { q } = await conLa1({ guardada: 4, cantidadDelMenu: 4, pedido: "235/75R15" }, ["235 75 rin 15 tres llantas por favor me cotizas"]);
    expect(q.cantidad).toBe(3);
  });

  it("ficha vacía: lo dicho antes sigue contando (original de 40137)", async () => {
    const { q } = await conLa1({ guardada: null, cantidadDelMenu: 4, pedido: "225 70 rin 16 tres llantas por favor me cotizas" });
    expect(q.cantidad).toBe(3);
  });

  it("la ruta directa no pisa la ficha 20 con el «4 llantas» viejo", async () => {
    const h = await hilo({ guardada: 20, cantidadDelMenu: 20, pedido: "Necesito 4 llantas 235/75R15" });
    await responder(h, "La 1");
    expect(await fichaCantidad(h.fila.id)).toBe(20);
    const [q] = await cotizaciones(h.fila.id);
    expect(q.items[0].quantity).toBe(20);
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";
import { extractLoadSpeed } from "../src/domain/tireSpecs.js";

/**
 * GENERAR_COTIZACION NO FIRMA UNA «EQUIVALENTE» QUE NO LE SIRVE AL CLIENTE
 * (auditoría 19-oct-2026, familia 7-B).
 *
 *  · chat 26218, 13-oct 17:59 UTC: etiqueta «265/45R20 Extra Load»; el bot
 *    preguntó «¿Le cotizo la FALKEN ZIEX CT60 A/S en 245/50R20?», el cliente
 *    dijo «Okey» y salió COT-MV6ZKE43 por 4 × 245/50R20 102V, $980,44. La
 *    lámina la había declarado equivalente y nadie miró la carga.
 *  · chat 22492: pidió banda más ancha que 205; la lámina declaró 185/70R14.
 *
 * Lo que se juzga acá es lo que la lámina de entonces no sabía o no miró: la
 * carga que pide el cliente y hacia dónde pidió moverse. La equivalencia por
 * medida de lo ya declarado NO se vuelve a juzgar (caso sano 4732, ver
 * `medidaDeOtraVisita.integration.test.ts`).
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_s5_equiv_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

let catalogo: CatalogItem[] = [];

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (consulta: string, limite = 40) => searchCatalog(catalogo, consulta, limite),
    // La MISMA función del dominio que usa producción: un mock que devolviera
    // el catálogo entero probaría otra cosa.
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
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

function llanta(code: string, name: string, brand: string, design: string, sizeLabel: string, precio: number): CatalogItem {
  const [w, a, r] = sizeLabel.match(/\d+/g)!.map(Number);
  return {
    id: code, code, name, brand, design,
    size: { width: w, aspect: a, rim: r }, sizeLabel,
    price: precio, sourcePrice: precio, priceTier: "pvp1",
    prices: { pvp1: precio, pvp2: precio, pvp3: precio, pvp4: precio },
    taxRate: 0.15,
    customerPriceWithTax: precio * 1.15, minimumPriceWithTax: precio, distributorPriceWithTax: precio,
    stock: 4, availability: "available",
    imageUrl: null, imageSource: null, loadSpeed: extractLoadSpeed(name), active: true, source: "contifico",
  };
}

const CT60 = llanta("329047", "245/50R20 102V CT60AS FALKEN", "FALKEN", "ZIEX CT60 A/S", "245/50R20", 245.11);
const R380 = llanta("1857014WNR380", "185/70R14 88T R380 WINRUN", "WINRUN", "R380", "185/70R14", 54.59);
catalogo = [CT60, R380];

const FOTO_1 =
  "[El cliente mandó una foto. Se lee: Etiqueta puerta: medida recomendada 265/45 R20 (delanteras y traseras), rin 9Jx20, presión 310/330 kPa (45/48 PSI).]";
const FOTO_2 =
  "[El cliente mandó una foto. Se lee: Etiqueta puerta: recomendada 265/45R20 Extra Load (del/tras), repuesto T155/90R18 113M]";

interface Fila { id: number; current_cycle: number }

async function chat(phone: string, o: {
  tireSize: string; entrantes: string[]; producto: CatalogItem; pregunta: string;
}): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size)
    values (${phone}, 'Fernando', 'open', 'seleccionando', 1, ${o.tireSize})
    returning id, current_cycle
  `;
  for (const [i, texto] of o.entrantes.entries()) {
    await sql`
      insert into messages (conversation_id, role, content, direction, type, cycle, created_at)
      values (${fila.id}, 'user', ${texto}, 'inbound', 'text', 1, now() - make_interval(secs => ${120 - i}))
    `;
  }
  // La lámina de ENTONCES, que la declaró equivalente.
  await sql`
    insert into messages (conversation_id, role, content, direction, type, cycle, metadata, created_at)
    values (${fila.id}, 'assistant', 'Opciones enviadas', 'outbound', 'image', 1,
      ${sql.json({ piece: "options", codes: [o.producto.code], sizeLabel: null, equivalentes: [o.producto.sizeLabel] })},
      now() - interval '60 seconds')
  `;
  await sql`
    insert into quote_artifacts (conversation_id, cycle, kind, products)
    values (${fila.id}, 1, 'options', ${sql.json([{ code: o.producto.code, brand: o.producto.brand, design: o.producto.design }])})
  `;
  // La pregunta que nombra la llanta y su medida, con su hecho de oferta.
  await sql`
    insert into messages (conversation_id, role, content, direction, type, cycle, author_kind, metadata, created_at)
    values (${fila.id}, 'assistant', ${o.pregunta}, 'outbound', 'text', 1, 'bot',
      ${sql.json({ oferta: { tipo: "oferta_de_cotizar", clase: "una", codigo: o.producto.code, medida: o.producto.sizeLabel } })},
      now() - interval '50 seconds')
  `;
  return fila;
}

async function cotizar(fila: Fila, phone: string, code: string, texto: string) {
  await sql`
    insert into messages (conversation_id, role, content, direction, type, cycle)
    values (${fila.id}, 'user', ${texto}, 'inbound', 'text', 1)
  `;
  const tools = buildTools({
    conversation: { id: fila.id, phone, name: "Fernando", stage: "seleccionando", bot_paused_until: null, status: "open", current_cycle: fila.current_cycle },
    customerPhone: phone, customerName: "Fernando", currentUserText: texto, aceptoCotizacion: true,
  } as never);
  const tool = tools.find((t) => t.function.name === "generar_cotizacion")!;
  return JSON.parse(await tool.execute({ items: [{ code, cantidad: 4 }], nombre_cliente: null }));
}

const cotizacionesDe = (id: number) => sql`select id from quotes where conversation_id=${id}`;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("generar_cotizacion · la equivalente tiene que servirle de verdad", () => {
  it("EL CASO 26218: «Okey» no firma una 245/50R20 102V para una 265/45R20 Extra Load", async () => {
    const phone = "593900026218";
    const fila = await chat(phone, {
      tireSize: "265/45R20", entrantes: ["Mercedes Benz ML 350 2014\n625/45R20 9Jx20", FOTO_1, FOTO_2],
      producto: CT60, pregunta: "¿Le cotizo la *FALKEN ZIEX CT60 A/S* en *245/50R20*? 😊",
    });
    const salida = await cotizar(fila, phone, CT60.code, "Okey");
    expect(salida.error ?? "").toMatch(/carga|extra load|XL/i);
    expect(await cotizacionesDe(fila.id)).toHaveLength(0);
  });

  it("EL CASO 22492: no firma una 185/70R14 a quien pidió más ancha que 205", async () => {
    const phone = "593900022492";
    const fila = await chat(phone, {
      tireSize: "205/60R14",
      entrantes: [
        "Al usar la 205/60 R13, tengo la altura necesaria, por eso al subir 1\" y bajar el pefil, lo que busco, es subir o mantener la altura y logra una banda de rodamiento, más ancha.",
        "No gracias, quiero subir a 14... estoy usando 205/60/R14...",
      ],
      producto: R380, pregunta: "¿Le cotizo la *WINRUN R380* en *185/70R14*? 😊",
    });
    const salida = await cotizar(fila, phone, R380.code, "Si");
    expect(salida.error ?? "").toMatch(/más ancha|direcci/i);
    expect(await cotizacionesDe(fila.id)).toHaveLength(0);
  });

  it("caso sano: la misma 185/70R14 declarada y aceptada SIN dirección pedida se cotiza", async () => {
    const phone = "593900022493";
    const fila = await chat(phone, {
      tireSize: "205/60R14", entrantes: ["estoy usando 205/60/R14"],
      producto: R380, pregunta: "¿Le cotizo la *WINRUN R380* en *185/70R14*? 😊",
    });
    const salida = await cotizar(fila, phone, R380.code, "Si");
    expect(salida.error, String(salida.error ?? "")).toBeUndefined();
    expect(await cotizacionesDe(fila.id)).toHaveLength(1);
  });
});

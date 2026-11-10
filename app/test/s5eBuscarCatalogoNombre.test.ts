import { describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * SPRINT 5 (pedido del Sprint 4, auditoría del 9-nov-2026) — `buscar_catalogo`
 * dice cuándo encontró el modelo DESCARTANDO una palabra que el catálogo no
 * tiene («Wrangler KR601» → la Kenda KR601), y su «no está» distingue la marca:
 * una que no se vende se dice claro, una que sí no se niega, y un nombre sin
 * marca conocida («Klever») puede ser el apodo del anuncio.
 */
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

function llanta(code: string, brand: string, design: string, medida: string, stock: number, precio: number): CatalogItem {
  const m = medida.match(/^(\d+)\/(\d+)R(\d+)$/)!;
  return {
    id: code, code, name: `LLANTA ${medida} ${brand} ${design}`, brand, design,
    size: { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) },
    sizeLabel: medida,
    price: precio, sourcePrice: precio * 0.8, priceTier: "pvp1",
    prices: { pvp1: precio, pvp2: precio, pvp3: precio, pvp4: precio },
    taxRate: 0.15, customerPriceWithTax: precio * 1.3, minimumPriceWithTax: precio, distributorPriceWithTax: precio * 0.9,
    stock, availability: stock <= 0 ? "out" : stock < 4 ? "check" : "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

const KR601 = llanta("35242007", "KENDA", "KR601", "225/75R15", 20, 214.94);
const catalogo: CatalogItem[] = [KR601, llanta("2257016WRMAXCLAWAT", "WINRUN", "MAXCLAW A/T", "225/70R16", 20, 124.76)];

vi.mock("../src/services/catalog.js", async () => {
  const { buscarConEscalera, searchCatalog } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (q: string, l = 40) => searchCatalog(catalogo, q, l),
    searchByRim: () => [],
    searchWithLadder: (q: string, l = 8) => buscarConEscalera(catalogo, q, l),
    searchBySize: () => [],
    searchAlternatives: () => [],
    catalogCandidates: () => [],
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (code: string) => catalogo.find((i) => i.code === code),
    productosDelCatalogoMencionados: () => [],
  };
});

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(async () => [], { end: async () => undefined }),
}));

const { buildTools } = await import("../src/agent/tools.js");

async function buscar(consulta: string) {
  const tools = buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999", customerName: "Cliente", currentUserText: consulta,
  } as never);
  const crudo = await tools.find((t) => t.function.name === "buscar_catalogo")!.execute({ consulta });
  return { crudo, salida: JSON.parse(crudo) };
}

describe("buscar_catalogo · el nombre que el catálogo no tiene", () => {
  it("«Kenda Klever KR601»: encuentra la KR601 y dice que «klever» no figura, dentro de los 500 caracteres", async () => {
    const { crudo, salida } = await buscar("Kenda Klever KR601");
    expect(salida.resultados[0].code ?? salida.resultados[0].codigo).toBe("35242007");
    expect(salida.palabras_que_no_figuran).toEqual(["klever"]);
    expect(salida.regla_de_nombre).toMatch(/figura como «KENDA KR601»/);
    expect(crudo.slice(0, 500)).toContain("palabras_que_no_figuran");
  });

  it("SANO: «Kenda KR601» es exacta y no lleva la regla", async () => {
    const { salida } = await buscar("Kenda KR601");
    expect(salida.palabras_que_no_figuran).toBeUndefined();
  });
});

describe("buscar_catalogo · el «no está» según la marca", () => {
  it("marca que no se vende (Michelin): se dice claro", async () => {
    const { salida } = await buscar("Michelin Primacy 4 205/55R16");
    expect(salida.siguiente_paso).toMatch(/MICHELIN no la manejamos/);
  });

  it("marca que sí se vende (Kenda) con un modelo que no aparece: no se niega la marca", async () => {
    const { salida } = await buscar("Kenda KR999");
    expect(salida.siguiente_paso).toMatch(/KENDA SÍ la manejamos/);
    expect(salida.siguiente_paso).toMatch(/PROHIBIDO «no tenemos KENDA»/);
  });

  it("sin marca conocida («Klever» solo): no se afirma que no existe", async () => {
    const { salida } = await buscar("Klever");
    expect(salida.siguiente_paso).toMatch(/NO digas que no existe/);
  });
});

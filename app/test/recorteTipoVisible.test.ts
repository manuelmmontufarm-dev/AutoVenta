import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * NINGÚN TIPO VENDIBLE SE QUEDA FUERA DEL RECORTE.
 *
 * Producción, 1-sep-2026 (conv 13645): el cliente pidió A/T en 265/65R17. La
 * medida tenía DOS A/T con stock de juego —KR28 con 89 y KR608 con 74— pero
 * `recorteConEscalera` corta a 5 con una sola llanta por escalón de PRECIO:
 * la «intermedia» la ganó la KR50 H/T ($0.42 más barata que la KR28) y la
 * «económica» una A/T con stock 3. El modelo respondió «no le ofrezco una A/T
 * disponible para juego de 4» y el guardián lo confirmó con la misma lista.
 *
 * El catálogo del fixture es el de ese día, con los códigos REALES de la base
 * de tipos (`assets/base_llantas_tipos.json`): el tipo lo resuelve el mismo
 * `tipoDeProducto` de producción. Los precios son los finales del Interbot de
 * esa tarde.
 */

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

let catalogo: CatalogItem[] = [];

vi.mock("../src/services/catalog.js", () => ({
  ensureCatalogReady: async () => ({}),
  // `buscar_llanta` entra por acá: la medida exacta, en el orden del catálogo.
  searchBySize: (size: { width: number; aspect: number | null; rim: number }) =>
    catalogo.filter(
      (item) =>
        item.size?.width === size.width &&
        item.size?.aspect === size.aspect &&
        item.size?.rim === size.rim,
    ),
  searchAlternatives: () => [],
  searchByText: () => [],
  searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
  catalogCandidates: () => [],
  catalogStatus: () => ({ items: 0, error: null }),
  applyInterbotPrices: () => undefined,
  findByCode: () => undefined,
}));

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(async () => [{ tire_size: null }], { end: async () => undefined }),
}));

vi.mock("../src/services/conversations.js", () => ({
  appendMessage: async () => undefined,
  logQuote: async () => undefined,
  logQuoteArtifact: async () => undefined,
  registrarMedidaQueNoCoincide: async () => undefined,
  setStage: async () => undefined,
  updateConversationFacts: async () => undefined,
}));

vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));

const { buildTools } = await import("../src/agent/tools.js");

function llanta(over: {
  code: string;
  brand: string;
  design: string;
  stock: number;
  precio: number;
  medida?: string;
  width?: number;
  aspect?: number;
  rim?: number;
}): CatalogItem {
  const medida = over.medida ?? "265/65R17";
  return {
    id: over.code,
    code: over.code,
    name: `LLANTA ${medida} ${over.brand} ${over.design}`,
    brand: over.brand,
    design: over.design,
    size: { width: over.width ?? 265, aspect: over.aspect ?? 65, rim: over.rim ?? 17 },
    sizeLabel: medida,
    price: over.precio,
    sourcePrice: over.precio * 0.8,
    priceTier: "pvp1",
    prices: { pvp1: over.precio, pvp2: over.precio, pvp3: over.precio, pvp4: over.precio },
    taxRate: 0.15,
    customerPriceWithTax: over.precio * 1.33,
    minimumPriceWithTax: over.precio,
    stock: over.stock,
    availability: over.stock <= 0 ? "out" : over.stock < 4 ? "check" : "available",
    imageUrl: null,
    imageSource: null,
    loadSpeed: null,
    active: true,
    source: "contifico",
  };
}

/** Los diez productos de 265/65R17 del 1-sep, en el orden del catálogo real. */
function catalogoDelPrimeroDeSeptiembre(): CatalogItem[] {
  return [
    llanta({ code: "K560B709", brand: "KENDA", design: "KR50", stock: 48, precio: 202.33 }),
    llanta({ code: "356398", brand: "FALKEN", design: "WILDPEAK A/T4W", stock: 1, precio: 256.5 }),
    llanta({ code: "32793002", brand: "KENDA", design: "KR29", stock: 80, precio: 263.4 }),
    llanta({ code: "2656517WRMAXCLAWRT", brand: "WINRUN", design: "MAXCLAW R/T", stock: 44, precio: 206.6 }),
    llanta({ code: "2656517WNMAXCLAWAT", brand: "WINRUN", design: "MAXCLAW A/T", stock: 3, precio: 170.7 }),
    llanta({ code: "33005026", brand: "KENDA", design: "KR608", stock: 74, precio: 262.9 }),
    // 238.37 es el precio de LISTA: la promo del −25% (que deja 178.79) vivía
    // solo en el cotizador web ese día. Con la lista, la KR28 pierde el
    // escalón económico contra la Maxclaw R/T — así se escondió en producción.
    llanta({ code: "K292B779", brand: "KENDA", design: "KR28", stock: 89, precio: 238.37 }),
    llanta({ code: "33005000", brand: "KENDA", design: "KR608", stock: 0, precio: 266.7 }),
    llanta({ code: "35272004", brand: "KENDA", design: "KR601", stock: 44, precio: 274.6 }),
    llanta({ code: "K417B753", brand: "KENDA", design: "KR628", stock: 3, precio: 209.6 }),
  ];
}

async function buscarLlanta() {
  const tools = buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "Cliente",
    currentUserText: "En 265 65 17",
  } as never);
  const tool = tools.find((t) => t.function.name === "buscar_llanta");
  if (!tool) throw new Error("buscar_llanta no está registrada");
  return JSON.parse(await tool.execute({ flotacion: null, width: 265, aspect: 65, rim: 17 }));
}

beforeEach(() => {
  catalogo = catalogoDelPrimeroDeSeptiembre();
});

describe("buscar_llanta · el recorte no esconde ningún tipo vendible", () => {
  it("en la 265/65R17 del 1-sep, una A/T con stock de juego SÍ está en los resultados", async () => {
    const salida = await buscarLlanta();

    const atVendibles = salida.resultados.filter(
      (o: { tipo?: string; stock: number }) => o.tipo === "A/T" && o.stock >= 4,
    );
    expect(atVendibles.length).toBeGreaterThan(0);
    // Y no una A/T cualquiera: la más barata de las que alcanzan (la KR28).
    expect(atVendibles.map((o: { code: string }) => o.code)).toContain("K292B779");
  });

  it("la garantía es por TODOS los tipos, no solo el A/T: la R/T vendible también entra", async () => {
    const salida = await buscarLlanta();

    const tiposConJuego = new Set(
      salida.resultados
        .filter((o: { stock: number }) => o.stock >= 4)
        .map((o: { tipo?: string }) => o.tipo)
        .filter(Boolean),
    );
    for (const tipo of ["A/T", "H/T", "R/T", "M/T"]) expect(tiposConJuego).toContain(tipo);
  });

  it("un tipo que solo existe sin stock de juego NO se fuerza a entrar", async () => {
    // Si las únicas A/T tienen 1 y 3 unidades, meterlas «por cobertura»
    // invitaría a ofrecer lo que generar_cotizacion después bloquea.
    catalogo = catalogoDelPrimeroDeSeptiembre().filter(
      (item) => !["33005026", "K292B779"].includes(item.code),
    );

    const salida = await buscarLlanta();

    const atForzadas = salida.resultados.filter(
      (o: { tipo?: string; stock: number }) => o.tipo === "A/T" && o.stock >= 4,
    );
    expect(atForzadas).toHaveLength(0);
    expect(salida.resultados.length).toBeLessThanOrEqual(6);
  });

  it("con pocos productos el recorte no toca nada: salen todos, como siempre", async () => {
    catalogo = catalogoDelPrimeroDeSeptiembre().slice(0, 4);

    const salida = await buscarLlanta();

    expect(salida.resultados).toHaveLength(4);
  });

  it("el siguiente_paso manda a re-buscar por tipo en vez de contestar con esta lista", async () => {
    const salida = await buscarLlanta();

    expect(salida.siguiente_paso).toMatch(/buscar_por_aro_y_tipo/);
    expect(salida.siguiente_paso).toMatch(/afirmar o negar/i);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * FAMILIA 1-A: LA MEDIDA EN PULGADAS QUE NO LLEGA AL CATÁLOGO COMO LA MISMA LLAVE.
 *
 * No es «en la conv 23250 dijo que no había stock». Es: una flotación escrita
 * a mano (31x10.50R15 en cualquiera de sus formas) no se traduce a la llave
 * canónica con la que el catálogo guarda esa llanta, y entonces el bot dice
 * «no me aparece stock», ofrece medidas de auto del mismo aro, o guarda basura
 * en la ficha —«0R15» en las conv 23250 y 22421—.
 *
 * Los textos son los de los chats reales (auditoría 28-sep-2026). Los nombres
 * del catálogo son los tres SKUs reales de Contífico en esa medida: Depot
 * tiene la KR628, la KR601 y la KR29, y el asesor terminó vendiéndolas a mano.
 *
 * El «0R15» salía de `buscar_llanta`: cuando el texto del turno no se leía
 * como flotación, el modelo llamaba la herramienta como MÉTRICA con ancho 0, y
 * esa rama guardaba `formatTireSize({width: 0, aspect: null, rim: 15})` en la
 * ficha sin validar nada.
 */

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_pulgadas_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const LA_MEDIDA = "31X10.5R15";

/** Los textos reales del cliente, tal cual llegaron. */
const TEXTOS_REALES = [
  // conv 23250, 25-sep (65cca9e): salió la lámina del aro 15 con medidas de auto.
  "31-10-50- Rin 15 para camino en piedra",
  // conv 23250, 25-sep: «En esa medida exacta 31x10.50R15 no me aparece stock».
  "[El cliente mandó un audio. Dice: Buenas tardes, necesito la 31x10.50x15.]",
  // conv 22421, 22-sep: ficha quedó en «0R15».
  "¡Hola! Quiero más información buenas noches disculpe el juego de llantas pantaneras rin 15la 31x10x50 en cuanto sale o la mixta",
  // conv 3608, 14-sep y 22-sep.
  "Buenas tardes necesito 4 llantas Rin 15 31 x 10.50 MT para una Toyota 4Runner del 95 gracias",
  "Buenas noches necesito 4 llantas Rin 15 31 x 10.50",
  // conv 3608, 11-ago.
  "Mud oMTR rin15LT31x10.50",
  // conv 3608, foto.
  "[El cliente mandó una foto. Se lee: 31x10.50R15LT, marca Cooper, modelo STT Pro, 109Q]",
  // conv 22445, 22-sep.
  "Rin 15 31 10 50",
  // conv 11449, 25 y 27-sep.
  "31x10.5 R15 AT  \nBuenos dias",
  "31x10.5 r15 para una rodeo v6  en AT",
];

/** Los tres SKUs reales de Depot en 31x10.50R15, nombre como lo manda Contífico. */
const SKUS_REALES = [
  { code: "3285B527", name: "31X10.50R15LT 109Q KR628 6PR KENDA", design: "KR628", stock: 6, precio: 166 },
  { code: "35292002", name: "KENDA 31X10.50R15LT 109Q KR601 6PR", design: "KR601", stock: 4, precio: 140 },
  { code: "3810B505", name: "KENDA 31X10.50 R15 LT 109Q KR29 6PR TL", design: "KR29", stock: 4, precio: 183 },
];

let catalogo: CatalogItem[] = [];
let medidaEnLaFicha: string | null = null;
const guardadas: (string | undefined)[] = [];

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (consulta: string, limite = 40) => searchCatalog(catalogo, consulta, limite),
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    // La métrica con ancho 0 no existe en ningún catálogo: esto es lo que
    // producción devolvía, y de ahí el «no me aparece stock».
    searchBySize: () => [],
    searchAlternatives: () => [],
    catalogCandidates: () => [],
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: () => undefined,
  };
});

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(async () => [{ tire_size: medidaEnLaFicha, content: "" }], { end: async () => undefined }),
}));

vi.mock("../src/services/conversations.js", () => ({
  appendMessage: async () => undefined,
  logQuote: async () => undefined,
  logQuoteArtifact: async () => undefined,
  registrarMedidaQueNoCoincide: async () => undefined,
  setStage: async () => undefined,
  updateConversationFacts: async (_id: number, facts: { tireSize?: string }) => {
    guardadas.push(facts.tireSize);
  },
}));

vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));

const ts = await import("../src/domain/tireSize.js");
const cat = await import("../src/domain/catalog.js");
const { buildTools } = await import("../src/agent/tools.js");

function sku(s: (typeof SKUS_REALES)[number]): CatalogItem {
  const { size, sizeLabel } = cat.extractCatalogSizeLabel(s.name);
  return {
    id: s.code, code: s.code, name: s.name, brand: "KENDA", design: s.design,
    size, sizeLabel,
    price: s.precio, sourcePrice: s.precio * 0.8, priceTier: "pvp1",
    prices: { pvp1: s.precio, pvp2: s.precio, pvp3: s.precio, pvp4: s.precio },
    taxRate: 0.15, customerPriceWithTax: s.precio * 1.15, minimumPriceWithTax: s.precio,
    distributorPriceWithTax: s.precio * 0.9, stock: s.stock,
    availability: s.stock <= 0 ? "out" : s.stock < 4 ? "check" : "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

describe("texto del cliente → medida canónica (un solo dueño)", () => {
  for (const texto of TEXTOS_REALES) {
    it(`«${texto.slice(0, 50)}» es ${LA_MEDIDA}`, () => {
      expect(ts.medidaCanonica(texto)).toBe(LA_MEDIDA);
    });
  }

  it("las formas que no son flotación siguen sin serlo", () => {
    // Tres números sueltos de auto siguen siendo métrica, no pulgadas.
    expect(ts.medidaCanonica("195 50 15")).toBe("195/50R15");
    expect(ts.medidaCanonica("205-55-16 rin 16")).toBe("205/55R16");
    expect(ts.extractFlotationSizes("195 50 rin 15")).toEqual([]);
    expect(ts.medidaCanonica("0991247772")).toBeNull();
    expect(ts.medidaCanonica("31 10 50")).toBeNull(); // sin aro no hay medida
    expect(ts.medidaCanonica("son 31 10 50 dólares, rin 15?")).toBeNull();
    expect(ts.medidaCanonica("tengo 4 llantas 205/55R16")).toBe("205/55R16");
    expect(ts.medidaCanonica("7.00R15")).toBe("7.00R15");
    expect(ts.medidaCanonica("30x9.50x15")).toBe("30X9.5R15");
  });
});

describe("una medida rota no se guarda nunca", () => {
  it("«0R15» y compañía no son guardables", () => {
    expect(ts.medidaGuardable("0R15")).toBeNull();
    expect(ts.medidaGuardable("0/0R15")).toBeNull();
    expect(ts.medidaGuardable("R15")).toBeNull();
    expect(ts.medidaGuardable("")).toBeNull();
  });

  it("las buenas pasan canonizadas", () => {
    expect(ts.medidaGuardable("31x10.50R15LT")).toBe(LA_MEDIDA);
    expect(ts.medidaGuardable(LA_MEDIDA)).toBe(LA_MEDIDA);
    expect(ts.medidaGuardable("205/55R16")).toBe("205/55R16");
    expect(ts.medidaGuardable("185R14")).toBe("185R14");
    expect(ts.medidaGuardable("7.00R15")).toBe("7.00R15");
  });
});

describe("medida canónica → llave del catálogo (la misma en todos los chats)", () => {
  it("los tres SKUs reales tienen la llave que sale de CADA texto del cliente", () => {
    const items = SKUS_REALES.map(sku);
    for (const texto of TEXTOS_REALES) {
      const encontrados = cat.enLaMedidaConfirmada(items, ts.medidaCanonica(texto));
      expect(encontrados.map((i) => i.design).sort(), texto).toEqual(["KR29", "KR601", "KR628"]);
    }
  });

  it("la etiqueta del catálogo y la de la ficha son la misma función", () => {
    for (const s of SKUS_REALES) {
      expect(cat.extractCatalogSizeLabel(s.name).sizeLabel).toBe(ts.medidaCanonica(s.name));
    }
  });
});

describe("buscar_llanta con la flotación que el modelo pasó como métrica", () => {
  beforeEach(() => {
    catalogo = SKUS_REALES.map(sku);
    medidaEnLaFicha = null;
    guardadas.length = 0;
  });

  const buscar = (currentUserText: string, args: Record<string, unknown>) => {
    const tools = buildTools({
      conversation: { id: 23250, phone: "593983819216", name: "William", stage: "medida_confirmada", bot_paused_until: null, status: "open", current_cycle: 1 },
      customerPhone: "593983819216",
      currentUserText,
    } as never);
    const tool = tools.find((t) => t.function.name === "buscar_llanta")!;
    return tool.execute({ flotacion: null, ...args });
  };

  it("el audio «31x10.50x15» encuentra las tres y la ficha queda en la llave canónica", async () => {
    const r = JSON.parse(await buscar(TEXTOS_REALES[1], { width: 0, aspect: null, rim: 15 }));
    expect(r.medida).toBe(LA_MEDIDA);
    expect(r.total_en_esa_medida).toBe(3);
    expect(guardadas).toEqual([LA_MEDIDA]);
  });

  it("con la medida ya en la ficha, un ancho 0 del modelo no la pisa con «0R15»", async () => {
    medidaEnLaFicha = LA_MEDIDA;
    const r = JSON.parse(await buscar("Gracias", { width: 0, aspect: null, rim: 15 }));
    expect(guardadas).not.toContain("0R15");
    expect(r.medida).toBe(LA_MEDIDA);
    expect(r.total_en_esa_medida).toBe(3);
  });

  it("sin nada de dónde sacarla, un ancho 0 no se busca ni se guarda", async () => {
    const r = JSON.parse(await buscar("Gracias", { width: 0, aspect: null, rim: 15 }));
    expect(guardadas.filter(Boolean)).toEqual([]);
    expect(r.error).toBe("medida_invalida");
  });
});

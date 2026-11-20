import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * CONV 469 DE COMPETIMOTOR (20-nov-2026, «Abg Jumbo», 593993873816, 11:34).
 *
 *   «Llantas 23575r15» · «Tipo pantaneras» · «Que precio tiene ?»
 *   → «En 235/75R15 tipo pantanera (M/T) no me aparece stock disponible…»
 *
 * Carlos: pantanera es M/T y SÍ hay stock. Las llantas de abajo son las del
 * aro 15 del Excel de Fénix de hoy (INV_NOV.XLS, cargado en producción), con
 * sus nombres, diseños, códigos y stock. Antes del arreglo NINGUNA tenía tipo
 * (la base de tipos de Competimotor estaba vacía) y la búsqueda por M/T daba 0.
 */

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

let catalogo: CatalogItem[] = [];
let medidaDeLaFicha: string | null = null;

vi.mock("../src/services/catalog.js", async () => {
  const { buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (texto: string) => catalogo.filter((i) => (i.sizeLabel ?? "").startsWith(texto)),
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: (z: { width: number; aspect: number | null; rim: number }) =>
      catalogo.filter((i) => i.size?.width === z.width && i.size?.aspect === z.aspect && i.size?.rim === z.rim),
    searchAlternatives: () => [],
    catalogCandidates: () => [],
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (code: string) => catalogo.find((i) => i.code === code),
  };
});

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray) => {
      const consulta = strings.join(" ");
      if (/from messages/.test(consulta)) return [];
      if (/selected_quantity/.test(consulta)) return [{ selected_quantity: null }];
      if (/from conversations/.test(consulta)) return [{ tire_size: medidaDeLaFicha, vehicle: null }];
      return [];
    },
    { end: async () => undefined },
  ),
}));

vi.mock("../src/services/conversations.js", () => ({
  appendMessage: async () => undefined,
  lastOutboundText: async () => null,
  logQuote: async () => undefined,
  logQuoteArtifact: async () => undefined,
  registrarMedidaQueNoCoincide: async () => undefined,
  setStage: async () => undefined,
  updateConversationFacts: async () => undefined,
}));

vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));

const { buildTools } = await import("../src/agent/tools.js");

function llanta(code: string, nombre: string, design: string, medida: string, stock: number, precio: number): CatalogItem {
  const metrica = medida.match(/^(\d+)\/(\d+)R(\d+)$/);
  const brand = nombre.split(" ")[0];
  return {
    id: code, code, name: nombre, brand, design,
    size: metrica ? { width: Number(metrica[1]), aspect: Number(metrica[2]), rim: Number(metrica[3]) } : null,
    sizeLabel: medida,
    price: precio / 1.15, sourcePrice: precio / 1.15, priceTier: "pvp1",
    prices: { pvp1: precio, pvp2: precio, pvp3: precio, pvp4: precio },
    taxRate: 0.15,
    customerPriceWithTax: precio,
    minimumPriceWithTax: precio,
    distributorPriceWithTax: precio * 0.9,
    stock,
    availability: stock <= 0 ? "out" : stock < 4 ? "check" : "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "archivo",
  };
}

// INV_NOV.XLS, aro 15, lo que importa para 235/75R15 (código, nombre de Fénix, diseño, stock, precio A).
const KR29 = llanta("A0272", "KENDA 235/75R15LT KR29 6PR 104/101Q", "KR29", "235/75R15", 4, 220.8);
const MT802 = llanta("A0491", "TOWNHALL 235/75R15LT TH-MT802 6PR", "TH-MT802", "235/75R15", 2, 134.55);
const KR601 = llanta("A0273", "KENDA 235/75R15LT KR601 RT 6PR 104/101Q", "KR601", "235/75R15", 2, 209.3);
const WORKHORSE = llanta("1925", "GOODYEAR 235/75R15 WRANGLER WORKHORSE AT", "WRANGLER WORKHORSE AT", "235/75R15", 6, 177.99);
const FALKEN_AT = llanta("A0068", "FALKEN 235/75R15 WILDPEAK AT4W", "WILDPEAK A/T 4W", "235/75R15", 4, 277.15);
const TH_AT = llanta("A0490", "TOWNHALL 235/75R15 TH-AT802", "TH-AT802", "235/75R15", 4, 116.15);
const FALKEN_MT_30 = llanta("A0092", "FALKEN 30X9.5R15LT WILDPEAK M/T", "WILDPEAK M/T", "30X9.5R15", 8, 311.65);
const KR628_30 = llanta("A0318", "KENDA 30X9.5R15LT KR628 LB 104Q 6PR", "KR628", "30X9.5R15", 8, 227.7);
const KR29_31 = llanta("A0320", "KENDA 31X10.5R15LT KR29 MT 109Q 6PR", "KR29", "31X10.5R15", 12, 239.2);
const HAIDA_185 = llanta("A0112", "HAIDA 185/55R15 HD921", "HD921", "185/55R15", 8, 87.99);

beforeEach(() => {
  catalogo = [KR29, MT802, KR601, WORKHORSE, FALKEN_AT, TH_AT, FALKEN_MT_30, KR628_30, KR29_31, HAIDA_185];
  medidaDeLaFicha = null;
});

function tools(texto: string) {
  return buildTools({
    conversation: { id: 469, phone: "593900000469", name: "Abg Jumbo", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593900000469",
    customerName: "Abg Jumbo",
    currentUserText: texto,
  } as never);
}

async function buscarPorAro(texto: string, args: { tipo?: string | null; uso?: string | null; ancho?: number | null }) {
  const tool = tools(texto).find((t) => t.function.name === "buscar_por_aro_y_tipo")!;
  return JSON.parse(await tool.execute({ aro: 15, tipo: args.tipo ?? null, uso: args.uso ?? null, ancho: args.ancho ?? null }));
}

const TEXTO = "Llantas 23575r15\nTipo pantaneras\nQue precio tiene ?";
const codigos = (salida: { opciones?: { code: string }[] }) => (salida.opciones ?? []).map((o) => o.code);

describe("conv 469: «23575r15 tipo pantaneras»", () => {
  it("lo que llamó el bot en producción (aro 15, M/T, ancho 235) ya encuentra M/T con stock", async () => {
    const salida = await buscarPorAro(TEXTO, { tipo: "M/T", ancho: 235 });

    expect(salida.encontrado).toBe(true);
    expect(codigos(salida)).toContain("A0272"); // KENDA KR29
    expect(codigos(salida)).not.toContain("A0068"); // ninguna A/T
    expect(codigos(salida)).not.toContain("1925");
  });

  it("con la medida en la ficha, la M/T en pulgadas (30X9.5R15) entra como suya; la 31X10.5 no", async () => {
    medidaDeLaFicha = "235/75R15";
    const salida = await buscarPorAro(TEXTO, { tipo: "M/T", ancho: 235 });

    expect(salida.encontrado).toBe(true);
    expect(codigos(salida)).toEqual(expect.arrayContaining(["A0272", "A0092"]));
    expect(codigos(salida)).not.toContain("A0320"); // 31X10.5R15: otra llanta
    expect(codigos(salida)).not.toContain("A0318"); // KR628 es A/T
  });

  it("si el modelo pasa «pantanera» como tipo, es M/T", async () => {
    medidaDeLaFicha = "235/75R15";
    const salida = await buscarPorAro(TEXTO, { tipo: "pantanera" });

    expect(salida.tipo_pedido).toBe("M/T");
    expect(codigos(salida)).toContain("A0272");
  });

  it("sin M/T en la métrica, las de pulgadas son la respuesta (no «no hay stock»)", async () => {
    catalogo = catalogo.filter((i) => i !== KR29 && i !== MT802);
    medidaDeLaFicha = "235/75R15";
    const salida = await buscarPorAro(TEXTO, { tipo: "M/T", ancho: 235 });

    expect(salida.encontrado).toBe(true);
    expect(codigos(salida)).toEqual(["A0092"]);
  });
});

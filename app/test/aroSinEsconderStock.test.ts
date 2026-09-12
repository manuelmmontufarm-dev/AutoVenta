/**
 * EL ARO NO PUEDE ESCONDER LA MEDIDA EXACTA.
 *
 * Producción, 9-sep-2026, conv 18016. Dos turnos seguidos, el mismo stock:
 *
 *   CLIENTE: «265/70R17» · «MT»
 *   BOT: «⚠️ Ojo: en *265/70R17* no me queda disponibilidad exacta en M/T.
 *         La opción equivalente de su aro es *KENDA KR29* en *265/65R17*»
 *   CLIENTE: «No»
 *   BOT: «Es la opción M/T exacta en la medida que me pidió:
 *         *FALKEN WILDPEAK M/T* — $282.10 c/u con IVA»
 *
 * El primer turno entró por `buscar_por_aro_y_tipo` y el segundo por
 * `buscar_llanta`. La diferencia: el primero pedía el aro con
 * `searchByText("R17", 60)` —una búsqueda por TEXTO que puntúa, ordena por
 * disponibilidad y precio, y corta en 60— y en el aro 17 hay 102 productos.
 * Los que se caen del corte son los caros, que es justo donde viven las M/T.
 *
 * El cliente dijo «No» a una equivalente que no necesitaba, y solo la
 * casualidad de que insistiera destapó que su medida sí estaba.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_aro_falso";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
process.env.SELLER_PHONE ??= "test";

let catalogo: CatalogItem[] = [];
let medidaEnLaFicha: string | null = null;

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    // Las MISMAS funciones del dominio que usa producción, con sus topes y su
    // orden: un mock que devolviera el catálogo entero no probaría nada.
    searchByText: (consulta: string, limite = 40) => searchCatalog(catalogo, consulta, limite),
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: () => [],
    searchAlternatives: () => [],
    catalogCandidates: () => [],
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: () => undefined,
  };
});

vi.mock("../src/db/client.js", () => ({
  sql: async () => [{ tire_size: medidaEnLaFicha, content: "", created_at: new Date() }],
}));
vi.mock("../src/services/conversations.js", () => ({
  updateConversationFacts: async () => undefined,
  logFunnelEvent: async () => undefined,
}));
vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));

const { buildTools } = await import("../src/agent/tools.js");

function llanta(over: {
  code: string; brand: string; design: string; medida: string;
  rim: number; width: number; aspect: number; stock?: number; precio?: number;
}): CatalogItem {
  const precio = over.precio ?? 200;
  const stock = over.stock ?? 8;
  return {
    id: over.code, code: over.code,
    name: `LLANTA ${over.medida} ${over.brand} ${over.design}`,
    brand: over.brand, design: over.design,
    size: { width: over.width, aspect: over.aspect, rim: over.rim },
    sizeLabel: over.medida,
    price: precio, sourcePrice: precio * 0.8, priceTier: "pvp1",
    prices: { pvp1: precio, pvp2: precio, pvp3: precio, pvp4: precio },
    taxRate: 0.15,
    customerPriceWithTax: precio * 1.3,
    minimumPriceWithTax: precio,
    distributorPriceWithTax: precio * 0.9,
    stock,
    availability: stock <= 0 ? "out" : stock < 4 ? "check" : "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

/** La que el cliente pidió y el bot negó: su medida, su tipo, con stock. Es la más cara del aro. */
const FALKEN_MT_SU_MEDIDA = llanta({
  code: "318931", brand: "FALKEN", design: "WILDPEAK M/T",
  medida: "265/70R17", width: 265, aspect: 70, rim: 17, stock: 6, precio: 282,
});
/** La equivalente que ofreció en su lugar: otra medida, más barata. */
const KENDA_MT_OTRA_MEDIDA = llanta({
  code: "32793002", brand: "KENDA", design: "KR29",
  medida: "265/65R17", width: 265, aspect: 65, rim: 17, stock: 4, precio: 232,
});
/**
 * El relleno que empujaba a la M/T fuera del corte: 60 llantas del aro 17, con
 * stock y más baratas, así que la búsqueda por texto las pone primero.
 */
const RELLENO = Array.from({ length: 60 }, (_, i) =>
  llanta({
    code: `REL${i}`, brand: "WINRUN", design: "R330",
    medida: "215/55R17", width: 215, aspect: 55, rim: 17, stock: 8, precio: 80 + i,
  }),
);

async function buscar(aro: number, tipo: string | null, texto: string) {
  const tools = buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "Cliente",
    currentUserText: texto,
  } as never);
  const tool = tools.find((t) => t.function.name === "buscar_por_aro_y_tipo");
  if (!tool) throw new Error("buscar_por_aro_y_tipo no está registrada");
  return JSON.parse(await tool.execute({ aro, tipo, uso: null }));
}

describe("conv 18016 · la M/T de su medida no puede quedar fuera del aro", () => {
  beforeEach(() => {
    catalogo = [...RELLENO, KENDA_MT_OTRA_MEDIDA, FALKEN_MT_SU_MEDIDA];
    medidaEnLaFicha = "265/70R17";
  });

  it("con 265/70R17 confirmada, «MT» devuelve la M/T de SU medida", async () => {
    const salida = await buscar(17, "M/T", "MT");
    expect(salida.encontrado).toBe(true);
    const codigos = (salida.opciones ?? []).map((o: { code?: string; codigo?: string }) => o.code ?? o.codigo);
    expect(codigos).toContain("318931");
  });

  it("y NO la presenta como si su medida no existiera", async () => {
    const salida = await buscar(17, "M/T", "MT");
    // `sinTipoEnSuMedida` es lo que dispara el «⚠️ Ojo: no me queda
    // disponibilidad exacta» y el aviso de equivalentes.
    expect(salida.sin_tipo_en_su_medida).toBe(false);
    expect(salida.su_medida).toBe("265/70R17");
  });

  it("la equivalente de otra medida no se cuela cuando la suya está", async () => {
    const salida = await buscar(17, "M/T", "MT");
    const codigos = (salida.opciones ?? []).map((o: { code?: string; codigo?: string }) => o.code ?? o.codigo);
    expect(codigos).not.toContain("32793002");
  });

  it("sin medida confirmada sigue mostrando las M/T del aro, las dos", async () => {
    medidaEnLaFicha = null;
    const salida = await buscar(17, "M/T", "una MT para rin 17");
    const codigos = (salida.opciones ?? []).map((o: { code?: string; codigo?: string }) => o.code ?? o.codigo);
    expect(codigos).toContain("318931");
    expect(codigos).toContain("32793002");
  });
});

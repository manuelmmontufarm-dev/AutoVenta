import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * EL MENÚ COSTO / EQUILIBRIO / PREMIUM RESPETA EL USO QUE EL CLIENTE DECLARÓ.
 *
 * Semana del 21-sep-2026, 10 chats: la escalera se armaba por precio y marca,
 * así que una Kenda KR29 (M/T, la de barro) salió como «la económica» de
 * clientes que pidieron ciudad y dijeron «NO todoterreno» (Chevrolet Traverse
 * 245/70R17, Pathfinder, «2 llantas para ciudad»). La regla 1 de la escalera
 * (primero el tipo según el uso, después el precio) solo vivía en el prompt.
 *
 * Los códigos son REALES de la base de tipos de Depot: el tipo lo resuelve el
 * mismo `tipoDeProducto` de producción.
 */

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

let catalogo: CatalogItem[] = [];

vi.mock("../src/services/catalog.js", async () => {
  const { buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: () => [],
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

/** Lo que la base contestaría: la ficha vacía y ningún mensaje previo del cliente. */
vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray) => {
      const consulta = strings.join(" ");
      if (/from messages/.test(consulta)) return [];
      if (/selected_quantity/.test(consulta)) return [{ selected_quantity: null }];
      if (/from conversations/.test(consulta)) return [{ tire_size: null, vehicle: null }];
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

function llanta(code: string, brand: string, design: string, medida: string, stock: number, precio: number): CatalogItem {
  const m = medida.match(/^(\d+)\/(\d+)R(\d+)$/)!;
  return {
    id: code, code,
    name: `LLANTA ${medida} ${brand} ${design}`,
    brand, design,
    size: { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) },
    sizeLabel: medida,
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

// H/T: una por escalón de marca (premium Falken, intermedia KR50, económica Winrun).
const FALKEN_HT = llanta("329042", "FALKEN", "ZIEX CT60 A/S", "235/60R17", 8, 260);
const KENDA_HT = llanta("K501B784", "KENDA", "KR50", "235/65R17", 8, 200);
const WINRUN_HT = llanta("2256517WNMAXCLAWHT2", "WINRUN", "MAXCLAW H/T2", "225/65R17", 8, 170);
// La M/T de barro: en el escalón económico y MÁS BARATA que la Winrun H/T.
const KENDA_MT = llanta("3817B706", "KENDA", "KR29", "245/70R17", 40, 150);
const FALKEN_MT = llanta("318931", "FALKEN", "WILDPEAK M/T", "265/70R17", 8, 330);
// A/T de relleno.
const FALKEN_AT = llanta("356398", "FALKEN", "WILDPEAK A/T4W", "265/65R17", 8, 300);
const WINRUN_AT = llanta("2656517WNMAXCLAWAT", "WINRUN", "MAXCLAW A/T", "265/65R17", 8, 175);
const KENDA_RT = llanta("35272004", "KENDA", "KR601", "265/65R17", 8, 210);

async function buscarPorAro(textoDelCliente: string, args: { tipo?: string | null; uso?: string | null } = {}) {
  const tools = buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "Cliente",
    currentUserText: textoDelCliente,
  } as never);
  const tool = tools.find((t) => t.function.name === "buscar_por_aro_y_tipo");
  if (!tool) throw new Error("buscar_por_aro_y_tipo no está registrada");
  return JSON.parse(await tool.execute({ aro: 17, tipo: args.tipo ?? null, uso: args.uso ?? null }));
}

const codigos = (salida: { opciones: { code: string }[] }) => salida.opciones.map((o) => o.code);
const tipos = (salida: { opciones: { tipo?: string }[] }) => salida.opciones.map((o) => o.tipo);

beforeEach(() => {
  catalogo = [FALKEN_HT, KENDA_HT, WINRUN_HT, KENDA_MT, FALKEN_MT, FALKEN_AT, WINRUN_AT, KENDA_RT];
});

describe("buscar_por_aro_y_tipo · el menú respeta el uso", () => {
  it("«ciudad, NO todoterreno»: la M/T más barata NO sale como la económica", async () => {
    const salida = await buscarPorAro("Es para ciudad, NO todoterreno");

    expect(tipos(salida)).not.toContain("M/T");
    // La económica es la H/T de Winrun, no la KR29.
    expect(codigos(salida)).toEqual(["329042", "K501B784", "2256517WNMAXCLAWHT2"]);
    expect(salida.aviso_tipo ?? null).toBeNull();
  });

  it("el uso también llega por el argumento `uso` del modelo (fuente ya existente)", async () => {
    const salida = await buscarPorAro("dame opciones del 17", { uso: "ciudad" });

    expect(tipos(salida)).not.toContain("M/T");
  });

  it("uso de lodo: el menú es M/T (y R/T), no H/T", async () => {
    const salida = await buscarPorAro("es para lodo, pantanero");

    expect(tipos(salida).every((t) => t === "M/T" || t === "R/T")).toBe(true);
    expect(tipos(salida)).toContain("M/T");
  });

  it("uso mixto: A/T, R/T o H/T; nunca una M/T", async () => {
    const salida = await buscarPorAro("camino mixto");

    expect(tipos(salida)).not.toContain("M/T");
    expect(tipos(salida)).toContain("A/T");
  });

  it("sin uso declarado no se filtra nada: la M/T barata sigue siendo candidata", async () => {
    const salida = await buscarPorAro("dame opciones del aro 17");

    expect(codigos(salida)).toContain("3817B706");
    expect(salida.aviso_tipo ?? null).toBeNull();
  });

  it("un tipo pedido EXPLÍCITO manda sobre el uso (no se toca la búsqueda por tipo)", async () => {
    const salida = await buscarPorAro("para ciudad pero quiero M/T", { tipo: "M/T" });

    expect(tipos(salida).every((t) => t === "M/T")).toBe(true);
  });

  it("con menos de 2 compatibles vendibles se completa con otro tipo Y SE DICE", async () => {
    // Solo queda UNA H/T vendible; la otra está agotada.
    catalogo = [KENDA_HT, { ...FALKEN_HT, stock: 0, availability: "out" }, KENDA_MT, FALKEN_MT, FALKEN_AT, WINRUN_AT];

    const salida = await buscarPorAro("Es para ciudad");

    expect(salida.aviso_tipo).toMatch(/H\/T/);
    expect(salida.aviso_tipo).toMatch(/A\/T/);
    // El relleno es A/T; la M/T nunca entra para ciudad.
    expect(tipos(salida)).not.toContain("M/T");
    expect(tipos(salida)).toContain("H/T");
    expect(tipos(salida)).toContain("A/T");
    expect(salida.regla).toMatch(/aviso_tipo|no me queda de ese tipo/i);
  });
});

async function prepararOpciones(textoDelCliente: string, codes: string[]) {
  const tools = buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "Cliente",
    currentUserText: textoDelCliente,
  } as never);
  const tool = tools.find((t) => t.function.name === "preparar_opciones");
  if (!tool) throw new Error("preparar_opciones no está registrada");
  return JSON.parse(await tool.execute({
    codes, nombre_cliente: "Cliente", recomendado: codes[0], motivo: "por su uso de ciudad y carretera", cantidad: null,
  }));
}

describe("preparar_opciones · lo que el modelo elige también respeta el uso", () => {
  it("el modelo mandó la KR29 M/T como «la económica» de quien pidió ciudad: no sale en la pieza", async () => {
    const salida = await prepararOpciones("Es para ciudad, NO todoterreno", ["329042", "K501B784", "3817B706"]);

    expect(salida.error).toBeUndefined();
    const enPieza = JSON.stringify(salida);
    expect(enPieza).not.toContain("3817B706");
    expect(enPieza).not.toContain("KR29");
  });

  it("sin uso declarado se respeta lo que el modelo eligió, M/T incluida", async () => {
    const salida = await prepararOpciones("dame opciones del aro 17", ["329042", "K501B784", "3817B706"]);

    expect(JSON.stringify(salida)).toContain("3817B706");
    expect(salida.aviso_tipo).toBeUndefined();
  });

  it("con menos de 2 compatibles la pieza se completa con A/T, sin la M/T, y el aviso viaja", async () => {
    const salida = await prepararOpciones("Es para ciudad", ["K501B784", "3817B706", "356398"]);

    const enPieza = JSON.stringify(salida);
    expect(enPieza).not.toContain("3817B706");
    expect(enPieza).toContain("356398");
    expect(salida.aviso_tipo).toBe(true);
    expect(salida.aviso).toMatch(/H\/T/);
  });

  it("lodo con UNA M/T elegida y una R/T con stock en su medida: la R/T se suma, sin aviso", async () => {
    const kr29 = llanta("32793002", "KENDA", "KR29", "265/65R17", 4, 269);
    const rt = llanta("2656517WRMAXCLAWRT", "WINRUN", "MAXCLAW R/T", "265/65R17", 8, 200);
    catalogo = [kr29, rt];

    const salida = await prepararOpciones("es para lodo, camino pantanero", ["32793002"]);

    const enPieza = JSON.stringify(salida);
    expect(enPieza).toContain("2656517WRMAXCLAWRT");
    expect(salida.aviso_tipo).toBeUndefined();
  });

  it("el aviso de tipo va HORNEADO en mensaje_para_enviar, no solo en el JSON", async () => {
    const salida = await prepararOpciones("Es para ciudad", ["K501B784", "3817B706", "356398"]);

    expect(salida.mensaje_para_enviar).toMatch(/Ojo: para ciudad/);
  });
});

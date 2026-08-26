import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * SU MEDIDA LE GANA AL ARO.
 *
 * Caso que trajo Joaquín de la reunión del 25-ago-2026: el cliente había
 * confirmado **265/65R18**, pidió «una A/T para 4x4» y el bot le ofreció A/T de
 * **225/50R18** — otra medida del mismo aro — teniendo la Falken Wildpeak A/T4W
 * en su medida exacta, con cuatro unidades en stock.
 *
 * La causa está a la vista en `opcionesEnAro`: buscaba `R18` en todo el
 * catálogo y filtraba por tipo. La medida confirmada vivía en la ficha de la
 * conversación y no llegaba nunca al filtro, así que las tres opciones salían
 * de cualquier medida del aro y ni el modelo ni el cliente se enteraban.
 *
 * Las llantas del fixture son códigos REALES de la base de tipos que entregó
 * Depot (`assets/base_llantas_tipos.json`): el tipo de cada una lo resuelve el
 * mismo `tipoDeProducto` de producción, no una etiqueta inventada para el test.
 */

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

/** Catálogo del caso bajo prueba. */
let catalogo: CatalogItem[] = [];
/** Lo que `conversations.tire_size` tiene confirmado en el caso bajo prueba. */
let medidaEnLaFicha: string | null = null;

vi.mock("../src/services/catalog.js", async () => {
  // Mismo `searchCatalog` del dominio que usa producción: un mock que
  // devolviera el catálogo entero ignorando la consulta probaría otra cosa.
  const { searchCatalog } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (consulta: string, limite = 40) => searchCatalog(catalogo, consulta, limite),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: () => [],
    searchAlternatives: () => [],
    catalogCandidates: () => [],
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: () => undefined,
  };
});

/** La ficha de la conversación es lo único que esta herramienta le pide a la base. */
vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(async () => [{ tire_size: medidaEnLaFicha }], { end: async () => undefined }),
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
  medida: string;
  rim: number;
  width: number;
  aspect: number;
  stock?: number;
  precio?: number;
}): CatalogItem {
  const precio = over.precio ?? 200;
  const stock = over.stock ?? 8;
  return {
    id: over.code,
    code: over.code,
    // El nombre viene como lo manda Contífico: la medida adentro del texto.
    name: `LLANTA ${over.medida} ${over.brand} ${over.design}`,
    brand: over.brand,
    design: over.design,
    size: { width: over.width, aspect: over.aspect, rim: over.rim },
    sizeLabel: over.medida,
    price: precio,
    sourcePrice: precio * 0.8,
    priceTier: "pvp1",
    prices: { pvp1: precio, pvp2: precio, pvp3: precio, pvp4: precio },
    taxRate: 0.15,
    customerPriceWithTax: precio * 1.3,
    minimumPriceWithTax: precio,
    distributorPriceWithTax: precio * 0.9,
    stock,
    availability: stock <= 0 ? "out" : stock < 4 ? "check" : "available",
    imageUrl: null,
    imageSource: null,
    loadSpeed: null,
    active: true,
    source: "contifico",
  };
}

/** La A/T que el cliente tenía que haber recibido: su medida exacta, con stock. */
const FALKEN_AT_EN_SU_MEDIDA = llanta({
  code: "356530", brand: "FALKEN", design: "WILDPEAK A/T4W",
  medida: "265/65R18", width: 265, aspect: 65, rim: 18, stock: 4, precio: 260,
});
/** La que el bot ofreció en su lugar: otra medida del mismo aro y más barata. */
const FALKEN_AT_OTRA_MEDIDA = llanta({
  code: "351821", brand: "FALKEN", design: "WILDPEAK A/T TRAIL",
  medida: "225/50R18", width: 225, aspect: 50, rim: 18, stock: 8, precio: 180,
});
const KENDA_AT_OTRA_MEDIDA = llanta({
  code: "38685004", brand: "KENDA", design: "KR608",
  medida: "255/60R18", width: 255, aspect: 60, rim: 18, stock: 6, precio: 150,
});
/** H/T en la medida del cliente: el filtro de tipo tiene que seguir mandando. */
const FALKEN_HT_EN_SU_MEDIDA = llanta({
  code: "351657", brand: "FALKEN", design: "ZIEX CT60 A/S",
  medida: "265/65R18", width: 265, aspect: 65, rim: 18, stock: 4, precio: 240,
});
/** R/T del aro 18: existe el tipo, pero en ninguna 265/65R18. */
const FALKEN_RT_OTRA_MEDIDA = llanta({
  code: "352868", brand: "FALKEN", design: "WILDPEAK R/T01",
  medida: "275/65R18", width: 275, aspect: 65, rim: 18, stock: 5, precio: 290,
});

async function buscar(aro: number, tipo: string | null) {
  const tools = buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "Cliente",
    currentUserText: "quiero una A/T para mi 4x4",
  } as never);
  const tool = tools.find((t) => t.function.name === "buscar_por_aro_y_tipo");
  if (!tool) throw new Error("buscar_por_aro_y_tipo no está registrada");
  return JSON.parse(await tool.execute({ aro, tipo, uso: null }));
}

beforeEach(() => {
  catalogo = [
    FALKEN_AT_EN_SU_MEDIDA, FALKEN_AT_OTRA_MEDIDA, KENDA_AT_OTRA_MEDIDA,
    FALKEN_HT_EN_SU_MEDIDA, FALKEN_RT_OTRA_MEDIDA,
  ];
  medidaEnLaFicha = null;
});

describe("buscar_por_aro_y_tipo · el tipo pedido respeta la medida confirmada", () => {
  it("con 265/65R18 confirmada, «una A/T» devuelve la de SU medida y ninguna otra", async () => {
    // El caso del 25-ago tal cual. Antes salían la 225/50R18 y la 255/60R18.
    medidaEnLaFicha = "265/65R18";

    const salida = await buscar(18, "A/T");

    expect(salida.encontrado).toBe(true);
    expect(salida.su_medida).toBe("265/65R18");
    expect(salida.sin_tipo_en_su_medida).toBe(false);
    expect(salida.opciones.map((o: { code: string }) => o.code)).toEqual(["356530"]);
    for (const opcion of salida.opciones) expect(opcion.medida).toBe("265/65R18");
  });

  it("el filtro de tipo sigue mandando dentro de su medida: la H/T no se cuela", async () => {
    medidaEnLaFicha = "265/65R18";

    const salida = await buscar(18, "A/T");

    expect(salida.opciones.map((o: { code: string }) => o.code)).not.toContain("351657");
    for (const opcion of salida.opciones) expect(opcion.tipo).toBe("A/T");
  });

  it("sin medida confirmada, el aro completo sigue siendo la respuesta", async () => {
    // Quien llega por aro y nada más no puede quedarse con una sola opción.
    medidaEnLaFicha = null;

    const salida = await buscar(18, "A/T");

    expect(salida.su_medida).toBeNull();
    expect(salida.sin_tipo_en_su_medida).toBe(false);
    expect(salida.opciones.length).toBeGreaterThan(1);
    expect(new Set(salida.opciones.map((o: { medida: string }) => o.medida)).size).toBeGreaterThan(1);
  });

  it("si cambió de rines, su medida vieja no filtra nada", async () => {
    // La herramienta existe justo para esto («cambió los aros y ya no sirve la
    // medida original»): filtrar por una 265/65R18 en el aro 17 dejaría la
    // búsqueda en cero y el chat muerto.
    medidaEnLaFicha = "265/65R18";

    const salida = await buscar(18, "A/T");
    expect(salida.opciones).toHaveLength(1);

    catalogo = [
      llanta({ code: "356306", brand: "FALKEN", design: "WILDPEAK A/T4W", medida: "265/70R17", width: 265, aspect: 70, rim: 17, stock: 6 }),
    ];
    const enOtroAro = await buscar(17, "A/T");

    expect(enOtroAro.encontrado).toBe(true);
    expect(enOtroAro.su_medida).toBeNull();
    expect(enOtroAro.sin_tipo_en_su_medida).toBe(false);
    expect(enOtroAro.opciones).toHaveLength(1);
  });
});

describe("buscar_por_aro_y_tipo · cuando el tipo no existe en su medida, se dice", () => {
  it("declara sin_tipo_en_su_medida y ordena presentarlas como equivalentes", async () => {
    // R/T sí hay en el aro 18, pero ninguna en 265/65R18.
    medidaEnLaFicha = "265/65R18";

    const salida = await buscar(18, "R/T");

    expect(salida.encontrado).toBe(true);
    expect(salida.sin_tipo_en_su_medida).toBe(true);
    expect(salida.su_medida).toBe("265/65R18");
    expect(salida.opciones.map((o: { code: string }) => o.code)).toEqual(["352868"]);
    expect(salida.regla).toMatch(/265\/65R18/);
    expect(salida.regla).toMatch(/equivalentes/i);
  });

  it("no lo declara cuando el cliente nunca confirmó una medida", async () => {
    medidaEnLaFicha = null;

    const salida = await buscar(18, "R/T");

    expect(salida.encontrado).toBe(true);
    expect(salida.sin_tipo_en_su_medida).toBe(false);
    expect(salida.regla).not.toMatch(/equivalentes/i);
  });

  it("agotada en su medida = como si no hubiera: salen las equivalentes vendibles", async () => {
    // «Con stock» es parte del pedido. Si la única A/T de su medida está en
    // cero, quedarse en ella dejaba UNA opción incotizable (generar_cotizacion
    // bloquea agotadas) y escondía las equivalentes vendibles del aro.
    medidaEnLaFicha = "265/65R18";
    catalogo = [
      llanta({ code: "356530", brand: "FALKEN", design: "WILDPEAK A/T4W",
        medida: "265/65R18", width: 265, aspect: 65, rim: 18, stock: 0, precio: 260 }),
      FALKEN_AT_OTRA_MEDIDA, KENDA_AT_OTRA_MEDIDA, FALKEN_HT_EN_SU_MEDIDA,
    ];

    const salida = await buscar(18, "A/T");

    expect(salida.encontrado).toBe(true);
    expect(salida.sin_tipo_en_su_medida).toBe(true);
    expect(salida.opciones.map((o: { code: string }) => o.code)).not.toContain("356530");
    expect(salida.opciones.length).toBeGreaterThan(0);
    expect(salida.regla).toMatch(/equivalentes/i);
  });

  it("sin nada de ese tipo en el aro sigue siendo «no encontrado», no un equivalente", async () => {
    // M/T no existe en el aro 18 en toda la base: esa rama no cambió.
    medidaEnLaFicha = "265/65R18";

    const salida = await buscar(18, "M/T");

    expect(salida.encontrado).toBe(false);
    expect(salida.tipos_disponibles_en_ese_aro).toContain("A/T");
  });
});

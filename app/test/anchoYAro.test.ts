/**
 * «235 rin 15» (R-25): el ancho dado con el aro filtra la búsqueda.
 * El caso real es la demo de Mundillantas del 4-nov-2026 (28:14): el bot
 * mostró 205/65, 185/65 y 195/55 a quien pidió 235 en aro 15.
 */
import { describe, expect, it } from "vitest";
import { anchoYAro } from "../src/domain/anchoYAro.js";
import { medidaNoDada } from "../src/domain/medidaConfirmada.js";

describe("anchoYAro", () => {
  it.each([
    ["235 rin 15", 235, 15],
    ["235 R15", 235, 15],
    ["235 r 15", 235, 15],
    ["235 aro 15", 235, 15],
    ["rin 15 235", 235, 15],
    ["tiene la 265 en rin 16?", 265, 16],
    ["265 ring 16", 265, 16],
  ])("lee «%s» como ancho %i aro %i", (texto, ancho, aro) => {
    expect(anchoYAro(texto)).toEqual({ ancho, aro });
  });

  it.each([
    "235/60R15", // medida completa: su propia ruta
    "mejor la 235/60R15 entonces",
    "rin 15", // solo el aro
    "una llanta 235", // solo el ancho
    "quiero 4 llantas", // nada
    "33x12.50R15", // flotación completa
    "120 rin 15", // 120 no es un ancho métrico real
  ])("no inventa ancho+aro en «%s»", (texto) => {
    expect(anchoYAro(texto)).toBeNull();
  });

  it("con medida completa Y ancho+aro suelto, gana el suelto explícito", () => {
    // «tenía 235/60R15 pero ahora quiero 265 rin 16»
    expect(anchoYAro("tenia 235/60R15 pero ahora quiero 265 rin 16")).toEqual({ ancho: 265, aro: 16 });
  });
});

describe("medidaNoDada con «235 rin 15»", () => {
  // R-25: «235 rin 15» ya cuenta como medida escrita por el cliente
  // (extractTireSizes la lee con aspect null), así que el candado de
  // medida inventada NO bloquea una 235/60R15 buscada a partir de eso.
  it("no bloquea una 235/xxR15 cuando el cliente dio «235 rin 15»", () => {
    expect(
      medidaNoDada({
        medida: "235/60R15",
        textos: ["235 rin 15"],
        medidaDeLaFicha: null,
        huboFitment: false,
      }),
    ).toBeNull();
  });

  it("sí bloquea cuando el cliente dio SOLO el aro", () => {
    expect(
      medidaNoDada({
        medida: "235/60R15",
        textos: ["rin 15"],
        medidaDeLaFicha: null,
        huboFitment: false,
      }),
    ).toBe(15);
  });
});

// ── Por la herramienta y por la ruta directa (catálogo de mentira) ──────────
// Mismo patrón que `aroSinEsconderStock.test.ts`: las funciones del dominio
// sobre un catálogo fijo, la base y el WhatsApp de mentira.
import { vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_ancho_falso";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
process.env.SELLER_PHONE ??= "test";

let catalogo: CatalogItem[] = [];
const codigosALaLamina: string[][] = [];

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
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
  sql: async () => [{ tire_size: null, has_options: false, entrantes: [], content: "", created_at: new Date() }],
}));
vi.mock("../src/services/conversations.js", () => ({
  updateConversationFacts: async () => undefined,
  logFunnelEvent: async () => undefined,
}));
vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));
// La lámina no se dibuja: se anota qué códigos le llegarían. `buscar_por_aro_y_tipo`
// sigue siendo la real.
vi.mock("../src/agent/tools.js", async (original) => {
  const real = await original<typeof import("../src/agent/tools.js")>();
  return {
    ...real,
    buildTools: (ctx: Parameters<typeof real.buildTools>[0]) =>
      real.buildTools(ctx).map((t) =>
        t.function.name !== "preparar_opciones"
          ? t
          : {
              ...t,
              execute: async (args: unknown) => {
                codigosALaLamina.push((args as { codes: string[] }).codes);
                return JSON.stringify({ mensaje_para_enviar: "lámina" });
              },
            },
      ),
  };
});

const { buildTools } = await import("../src/agent/tools.js");
const { tryMostrarPorAro } = await import("../src/services/mostrarPorAro.js");

function llanta(code: string, brand: string, medida: string, precio: number, stock = 8): CatalogItem {
  const [, w, a, r] = /^(\d+)\/(\d+)R(\d+)$/.exec(medida)!;
  return {
    id: code, code, name: `LLANTA ${medida} ${brand}`, brand, design: `${brand}-${w}`,
    size: { width: Number(w), aspect: Number(a), rim: Number(r) }, sizeLabel: medida,
    price: precio, sourcePrice: precio * 0.8, priceTier: "pvp1",
    prices: { pvp1: precio, pvp2: precio, pvp3: precio, pvp4: precio },
    taxRate: 0.15, customerPriceWithTax: precio * 1.3, minimumPriceWithTax: precio,
    distributorPriceWithTax: precio * 0.9, stock,
    availability: stock <= 0 ? "out" : stock < 4 ? "check" : "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

/**
 * El aro 15 de la demo: las baratas (205/65, 185/65, 195/55) eran las que
 * salían; las 235 que pidió el cliente son las caras del aro.
 */
const ARO_15_DE_LA_DEMO = [
  llanta("205-65", "WINRUN", "205/65R15", 60),
  llanta("185-65", "KENDA", "185/65R15", 55),
  llanta("195-55", "FALKEN", "195/55R15", 70),
  llanta("235-75-A", "KENDA", "235/75R15", 140),
  llanta("235-75-B", "FALKEN", "235/75R15", 180),
  llanta("235-70-C", "WINRUN", "235/70R15", 110),
];

const CTX = (texto: string) => ({
  conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
  customerPhone: "593999",
  customerName: "Cliente",
  currentUserText: texto,
});

async function buscarPorAro(aro: number, texto: string, ancho: number | null = null) {
  const tool = buildTools(CTX(texto) as never).find((t) => t.function.name === "buscar_por_aro_y_tipo")!;
  return JSON.parse(await tool.execute({ aro, tipo: null, uso: null, ancho }));
}
const codigos = (salida: { opciones?: Array<{ code?: string; codigo?: string }> }) =>
  (salida.opciones ?? []).map((o) => String(o.code ?? o.codigo));

describe("demo del 4-nov (28:14) · «235 rin 15» por el agente", () => {
  it("solo devuelve anchos 235 del aro 15 (leído del mensaje)", async () => {
    catalogo = [...ARO_15_DE_LA_DEMO];
    const salida = await buscarPorAro(15, "235 rin 15");
    expect(salida.encontrado).toBe(true);
    expect(codigos(salida).length).toBeGreaterThan(0);
    for (const c of codigos(salida)) expect(c.startsWith("235-"), c).toBe(true);
  });

  it("también con el ancho pasado por parámetro", async () => {
    catalogo = [...ARO_15_DE_LA_DEMO];
    const salida = await buscarPorAro(15, "ese", 235);
    for (const c of codigos(salida)) expect(c.startsWith("235-"), c).toBe(true);
  });

  it("sin ese ancho lo dice y ofrece los cercanos, sin sustituirlo en silencio", async () => {
    catalogo = [...ARO_15_DE_LA_DEMO];
    const salida = await buscarPorAro(15, "245 rin 15");
    expect(salida.encontrado).toBe(false);
    expect(salida.ancho_pedido).toBe(245);
    expect(salida.anchos_cercanos_con_stock[0]).toBe(235);
    expect(salida.opciones).toBeUndefined();
    expect(salida.regla).toMatch(/PROHIBIDO ofrecer otro ancho/);
  });

  it("«rin 15» a secas sigue mostrando el aro completo (Depot igual)", async () => {
    catalogo = [...ARO_15_DE_LA_DEMO];
    const salida = await buscarPorAro(15, "rin 15");
    expect(codigos(salida).some((c) => !c.startsWith("235-"))).toBe(true);
  });
});

describe("demo del 4-nov (28:14) · «235 rin 15» por la ruta directa sin modelo", () => {
  it("tryMostrarPorAro manda a la lámina solo llantas 235", async () => {
    catalogo = [...ARO_15_DE_LA_DEMO];
    codigosALaLamina.length = 0;
    const ctx = CTX("235 rin 15");
    const salida = await tryMostrarPorAro(
      { conversation: ctx.conversation as never, customerPhone: ctx.customerPhone, customerName: "Cliente", previousOutbound: null },
      "235 rin 15",
    );
    expect(salida).toBe("lámina");
    expect(codigosALaLamina).toHaveLength(1);
    for (const c of codigosALaLamina[0]) expect(c.startsWith("235-"), c).toBe(true);
  });

  it("sin el ancho en el aro, la ruta directa se hace a un lado (sigue el agente)", async () => {
    catalogo = ARO_15_DE_LA_DEMO.filter((l) => !l.code.startsWith("235-"));
    codigosALaLamina.length = 0;
    const ctx = CTX("235 rin 15");
    const salida = await tryMostrarPorAro(
      { conversation: ctx.conversation as never, customerPhone: ctx.customerPhone, customerName: "Cliente", previousOutbound: null },
      "235 rin 15",
    );
    expect(salida).toBeNull();
    expect(codigosALaLamina).toHaveLength(0);
  });
});

describe("el mensaje real de la demo · conv 19354 (4-nov, 10:58)", () => {
  // «Buenas tardes tiene llanta rin 15 235» — en producción salió la lámina
  // con WINRUN R330, KENDA KR20 y FALKEN ZE310 (205/65, 185/65, 195/55).
  const REAL = "Buenas tardes tiene llanta rin 15 235";

  it("anchoYAro lo lee aunque el aro venga primero", () => {
    expect(anchoYAro(REAL)).toEqual({ ancho: 235, aro: 15 });
  });

  it("la ruta directa manda solo anchos 235", async () => {
    catalogo = [...ARO_15_DE_LA_DEMO];
    codigosALaLamina.length = 0;
    const ctx = CTX(REAL);
    const salida = await tryMostrarPorAro(
      { conversation: ctx.conversation as never, customerPhone: ctx.customerPhone, customerName: "Cliente", previousOutbound: null },
      REAL,
    );
    expect(salida).toBe("lámina");
    for (const c of codigosALaLamina[0]) expect(c.startsWith("235-"), c).toBe(true);
  });

  // PENDIENTE PARA EL SPRINT FINAL (fuera de los archivos de este sprint):
  // `medidaNoDada` (domain/medidaConfirmada.ts) devuelve 15 para una
  // 235/75R15 con este texto, porque `extractTireSizes` no lee «rin 15 235».
  // Si el modelo llama buscar_llanta 235/75R15, la bloquea y lo manda a
  // buscar_por_aro_y_tipo (que ya filtra por ancho): no muestra otro ancho,
  // pero da una vuelta de más. Arreglo: si `anchoYAro(texto)` coincide con el
  // ancho y el aro de la medida buscada, no es una medida inventada.
  it.todo("medidaNoDada no bloquea 235/xxR15 con «rin 15 235» (domain/medidaConfirmada.ts)");
});

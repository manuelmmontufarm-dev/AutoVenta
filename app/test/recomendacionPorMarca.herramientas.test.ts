import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * COMPETIMOTOR: LA LÁMINA LA ARMA EL CÓDIGO, NO EL MODELO (reunión 18-nov-2026).
 *
 * `buscar_llanta` le entrega al modelo YA elegidas las opciones (Falken, Winrun,
 * Kenda + la de mayor inventario) y `preparar_opciones` las vuelve a calcular
 * sobre el catálogo, así que aunque el modelo mande otros códigos la lámina sale
 * con esas. «Qué más tiene» trae las que faltan, hasta 10 en total.
 *
 * Catálogo REAL del cliente: las filas de 7 medidas del Excel de Fénix del
 * 6-nov (`fixtures/competimotor-medidas-06nov.json`).
 */
process.env.NEGOCIO = "mundillantas";
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

interface Fila { code: string; brand: string; design: string; sizeLabel: string; stock: number; precioConIva: number; listaConIva: number }
const FILAS = JSON.parse(
  readFileSync(new URL("./fixtures/competimotor-medidas-06nov.json", import.meta.url), "utf8"),
) as Fila[];

function item(f: Fila): CatalogItem {
  const m = f.sizeLabel.match(/^(\d+)\/(\d+)R(\d+)$/)!;
  return {
    id: f.code, code: f.code, name: `LLANTA ${f.sizeLabel} ${f.brand} ${f.design}`, brand: f.brand, design: f.design,
    size: { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) },
    sizeLabel: f.sizeLabel,
    price: f.precioConIva / 1.15, sourcePrice: f.precioConIva / 1.15, priceTier: "pvp1",
    prices: { pvp1: f.precioConIva, pvp2: null, pvp3: null, pvp4: null },
    taxRate: 0.15, customerPriceWithTax: f.listaConIva, minimumPriceWithTax: f.precioConIva, distributorPriceWithTax: f.precioConIva,
    stock: f.stock, availability: f.stock <= 0 ? "out" : f.stock < 4 ? "check" : "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "archivo",
  };
}
const CATALOGO = FILAS.map(item);

/** Lo que la base devuelve como piezas de opciones previas del ciclo (metadata.codes). */
let piezasPrevias: { codes: string[]; sizeLabel: string }[] = [];

vi.mock("../src/services/catalog.js", async () => ({
  ensureCatalogReady: async () => ({}),
  searchByText: () => [],
  searchByRim: () => [],
  searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
  searchBySize: (z: { width: number; aspect: number | null; rim: number }) =>
    CATALOGO.filter((i) => i.size?.width === z.width && i.size?.aspect === z.aspect && i.size?.rim === z.rim),
  searchAlternatives: () => [],
  catalogCandidates: () => [],
  catalogStatus: () => ({ items: CATALOGO.length, error: null }),
  applyInterbotPrices: () => undefined,
  findByCode: (code: string) => CATALOGO.find((i) => i.code === code),
  productosDelCatalogoMencionados: () => [],
}));

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray) => {
      const consulta = strings.join(" ");
      if (/piece'='options'/.test(consulta) && /from messages/.test(consulta)) {
        return piezasPrevias.map((p) => ({ metadata: { piece: "options", codes: p.codes, sizeLabel: p.sizeLabel }, content: "", minutos: 30 }));
      }
      if (/from messages/.test(consulta)) return [];
      if (/selected_quantity/.test(consulta)) return [{ selected_quantity: null }];
      if (/from conversations/.test(consulta)) return [{ tire_size: null, vehicle: null }];
      return [];
    },
    { end: async () => undefined },
  ),
}));

/** La metadata de la última lámina que la herramienta guardó (lo que el cliente tiene en pantalla). */
let ultimaLamina: { codes?: string[]; lista?: unknown[] } | null = null;

vi.mock("../src/services/conversations.js", () => ({
  appendMessage: async (_id: number, _rol: string, _texto: string, _wamid: unknown, extra?: { metadata?: Record<string, unknown> }) => {
    if (extra?.metadata?.piece === "options") ultimaLamina = extra.metadata as never;
  },
  lastOutboundText: async () => null,
  logQuote: async () => undefined,
  logQuoteArtifact: async () => undefined,
  registrarMedidaQueNoCoincide: async () => undefined,
  setStage: async () => undefined,
  updateConversationFacts: async () => undefined,
}));

vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));

const { buildTools } = await import("../src/agent/tools.js");
const { negocio } = await import("../src/negocio/index.js");

function herramientas(textoDelCliente: string) {
  return buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "Cliente",
    currentUserText: textoDelCliente,
  } as never);
}

async function buscarLlanta(texto: string, medida: [number, number, number]) {
  const tool = herramientas(texto).find((t) => t.function.name === "buscar_llanta")!;
  return JSON.parse(await tool.execute({ width: medida[0], aspect: medida[1], rim: medida[2], flotacion: null }));
}

async function prepararOpciones(texto: string, codes: string[]) {
  const tool = herramientas(texto).find((t) => t.function.name === "preparar_opciones")!;
  return JSON.parse(await tool.execute({ codes, nombre_cliente: "Cliente", recomendado: codes[0], motivo: "la que más se vende en su medida", cantidad: null }));
}

const marcasDe = (codes: string[]) => codes.map((c) => CATALOGO.find((i) => i.code === c)?.brand);
const marcasDeResultados = (salida: { resultados: { marca: string }[] }) => salida.resultados.map((r) => r.marca);
/** Los códigos de la lámina que salió en esta llamada (vacío si no salió ninguna). */
const codigosDeLaPieza = (_salida?: unknown, _medida?: string) => ultimaLamina?.codes ?? [];

beforeEach(() => {
  piezasPrevias = [];
  ultimaLamina = null;
});

describe("el perfil de la prueba es Competimotor", () => {
  it("NEGOCIO=mundillantas", () => {
    expect(negocio.id).toBe("mundillantas");
  });
});

describe("buscar_llanta entrega la selección por marca", () => {
  it("265/70R16: Falken, Winrun, Kenda + Townhall (mayor inventario)", async () => {
    const salida = await buscarLlanta("265/70R16", [265, 70, 16]);
    expect(marcasDeResultados(salida)).toEqual(["FALKEN", "WINRUN", "KENDA", "TOWNHALL"]);
    expect(salida.siguiente_paso).toContain("preparar_opciones");
  });

  it("235/75R15: falta Winrun → Falken, Kenda + Townhall", async () => {
    const salida = await buscarLlanta("235/75R15", [235, 75, 15]);
    expect(marcasDeResultados(salida)).toEqual(["FALKEN", "KENDA", "TOWNHALL"]);
  });
});

describe("preparar_opciones arma la lámina con la regla, mande lo que mande el modelo", () => {
  it("265/70R16 con tres códigos elegidos por el modelo (los más baratos): salen las 4 de la regla", async () => {
    // Lo que el modelo elegía por precio: Townhall, Wideway, Ilink.
    const salida = await prepararOpciones("265/70R16 precio", ["A0497", "A0522", "A0190"]);
    const enPantalla = codigosDeLaPieza(salida, "265/70R16");
    expect(new Set(marcasDe(enPantalla))).toEqual(new Set(["FALKEN", "WINRUN", "KENDA", "TOWNHALL"]));
    expect(enPantalla).toHaveLength(4);
    // La lista escrita trae las cuatro con su precio y una sola pregunta.
    expect(salida.mensaje_para_enviar).toContain("¿Cuál le cotizo?");
    expect(salida.mensaje_para_enviar).not.toContain("¿Le cotizo la 1, la 2 o la 3?");
  });

  it("215/65R16 pidiendo 4: Falken y Winrun (2 c/u) no alcanzan → Kenda + Townhall", async () => {
    const salida = await prepararOpciones("215/65R16", ["A0044", "A0541", "A0239"]);
    expect(new Set(marcasDe(codigosDeLaPieza(salida)))).toEqual(new Set(["KENDA", "TOWNHALL"]));
  });

  it("«qué más tiene» en 265/70R17 tras la primera: 6 nuevas, ninguna repetida (10 en total)", async () => {
    piezasPrevias = [{ codes: ["A0084", "A0563", "A0301", "A0470"], sizeLabel: "265/70R17" }];
    const salida = await prepararOpciones("qué más tiene", ["A0084"]);
    const enPantalla = codigosDeLaPieza(salida, "265/70R17");
    expect(enPantalla).toHaveLength(6);
    expect(enPantalla.some((c) => piezasPrevias[0].codes.includes(c))).toBe(false);
  });

  it("«qué más tiene» con las 10 ya vistas: no hay lámina nueva y se dice que son todas", async () => {
    piezasPrevias = [
      { codes: ["A0084", "A0563", "A0301", "A0470"], sizeLabel: "265/70R17" },
      { codes: ["TOW-023", "A0471", "A0164", "A0035", "A0012", "A0304"], sizeLabel: "265/70R17" },
    ];
    const salida = await prepararOpciones("qué más tiene", ["A0084"]);
    expect(salida.imagen_enviada).toBe(false);
    expect(salida.mensaje_para_enviar).toMatch(/265\/70R17/);
  });

  it("«tiene Maxxis?» en 205/55R16: la lámina es de Maxxis, la regla no la tapa", async () => {
    const salida = await prepararOpciones("205/55R16 tiene Maxxis?", ["A0353"]);
    expect(marcasDe(codigosDeLaPieza(salida, "205/55R16"))).toEqual(["MAXXIS"]);
  });
});

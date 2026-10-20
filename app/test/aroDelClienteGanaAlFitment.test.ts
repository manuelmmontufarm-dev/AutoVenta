import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";
import type { TireSize } from "../src/domain/tireSize.js";
import type { FitmentResearchResult } from "../src/services/vehicleFitmentResearch.js";

/**
 * FAMILIA 2-H — lo que el cliente ESCRIBIÓ le gana a la ficha del vehículo.
 *
 * Conv 23160 (25-sep, 65cca9e): «75  rin 15» y, en el mensaje siguiente, «Es
 * para Vitara clásico 5 huecos». El modelo llamó `fitment_vehiculo` sin aro,
 * la investigación trajo 225/65R17 y 225/70R16, y `preparar_opciones` las
 * mandó: el candado «el aro del cliente manda» dejaba pasar cualquier medida
 * cuando el cliente no había escrito una completa (`medidaEstaPedida(x, [])`
 * devuelve `true`). El guardián solo pudo maquillarlo: «La ficha no me
 * confirma aro 15 para este vehículo».
 *
 * Simulador 28-sep: «Chevrolet Traverse, uso 215/65R16» — con la medida
 * escrita, la investigación del vehículo no tiene nada que decidir.
 */

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

let catalogo: CatalogItem[] = [];
/** Lo que el cliente escribió ANTES de este turno, del más viejo al más nuevo. */
let entrantes: string[] = [];
let investigacion: FitmentResearchResult;
const espiaInvestigacion = vi.fn();

vi.mock("../src/services/catalog.js", async () => {
  const { buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: () => [],
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
    searchBySize: (size: TireSize) =>
      catalogo.filter((i) => i.size && i.size.width === size.width && i.size.rim === size.rim && i.size.aspect === size.aspect),
    searchAlternatives: () => [],
    catalogCandidates: () => [],
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (code: string) => catalogo.find((i) => i.code === code),
    resolveCatalogReference: () => undefined,
  };
});

vi.mock("../src/services/vehicleFitmentResearch.js", () => ({
  researchVehicleFitment: async (marca: string, modelo: string, anio: number | null, aro: number | null = null) => {
    espiaInvestigacion(marca, modelo, anio, aro);
    return investigacion;
  },
  PREGUNTA_MEDIDA_ESCRITA: "¿medida o foto?",
}));

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray) => {
      const consulta = strings.join(" ");
      if (/from messages/.test(consulta) && /direction='inbound'/.test(consulta)) {
        const ahora = Date.now();
        // Del más nuevo al más viejo, como `order by created_at desc`.
        return [...entrantes].reverse().map((content, i) => ({ content, created_at: new Date(ahora - (i + 1) * 20_000) }));
      }
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

function llanta(code: string, brand: string, design: string, medida: string, precio: number): CatalogItem {
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
    stock: 8,
    availability: "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  } as CatalogItem;
}

// Lo que salió en la conv 23160…
const ZE310R_17 = llanta("FZE310R2256517", "FALKEN", "ZE310R", "225/65R17", 180);
const KR50_16 = llanta("K50225701600", "KENDA", "KR50", "225/70R16", 150);
// …y lo que SÍ es de su aro, con y sin su perfil.
const KR15_15 = llanta("K15205751500", "KENDA", "KR15", "205/75R15", 110);
const R380_15 = llanta("WR380205651500", "WINRUN", "R380", "205/65R15", 90);

function herramientas(textoDelTurno: string) {
  return buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    customerName: "Cliente",
    currentUserText: textoDelTurno,
  } as never);
}

async function correr(textoDelTurno: string, nombre: string, args: Record<string, unknown>) {
  const tool = herramientas(textoDelTurno).find((t) => t.function.name === nombre);
  if (!tool) throw new Error(`${nombre} no está registrada`);
  return JSON.parse(await tool.execute(args));
}

beforeEach(() => {
  catalogo = [ZE310R_17, KR50_16, KR15_15, R380_15];
  entrantes = [];
  espiaInvestigacion.mockClear();
  investigacion = {
    status: "reference",
    vehicle: "Suzuki Vitara clásico",
    sizes: ["225/65R17", "225/70R16"],
    candidatos: [
      { medida: "225/65R17", confianza: "media", porque: "ficha" },
      { medida: "225/70R16", confianza: "media", porque: "ficha" },
    ],
    note: "nota",
    nextQuestion: null,
    sources: [],
    provider: "web",
  } as FitmentResearchResult;
});

describe("conv 23160 — «75  rin 15» + «Vitara clásico»", () => {
  it("preparar_opciones no manda 225/65R17 ni 225/70R16 a quien escribió rin 15", async () => {
    entrantes = ["¡Hola! Quiero más información", "75  rin 15"];
    const salida = await correr("Es para Vitara clásico 5 huecos", "preparar_opciones", {
      codes: [ZE310R_17.code, KR50_16.code], nombre_cliente: "Cliente", recomendado: KR50_16.code,
      motivo: "la que más se usa en su vehículo", cantidad: null,
    });
    expect(salida.error).toBe("opciones_de_otro_aro");
    expect(JSON.stringify(salida)).not.toContain(ZE310R_17.code);
  });

  it("fitment_vehiculo investiga con el aro 15 aunque el modelo no lo mande, y no ofrece otro aro ni otro perfil", async () => {
    entrantes = ["¡Hola! Quiero más información", "75  rin 15"];
    const salida = await correr("Es para Vitara clásico 5 huecos", "fitment_vehiculo", {
      marca: "Suzuki", modelo: "Vitara clásico", anio: null, aro: null,
    });
    expect(espiaInvestigacion).toHaveBeenCalledWith("Suzuki", "Vitara clásico", null, 15);
    const enOpciones = JSON.stringify(salida.opciones);
    expect(enOpciones).not.toContain(ZE310R_17.code);
    expect(enOpciones).not.toContain(KR50_16.code);
    expect(enOpciones).not.toContain(R380_15.code);
    expect(salida.regla).toMatch(/solo el ancho/i);
  });
});

describe("simulador 28-sep — «Chevrolet Traverse, uso 215/65R16»", () => {
  it("con la medida escrita, fitment_vehiculo no investiga ni reemplaza: manda a buscar_llanta", async () => {
    const salida = await correr(
      "Hola, tengo una Chevrolet Traverse, uso 215/65R16, la uso en ciudad, NO todoterreno",
      "fitment_vehiculo", { marca: "Chevrolet", modelo: "Traverse", anio: null, aro: null },
    );
    expect(espiaInvestigacion).not.toHaveBeenCalled();
    expect(salida.error).toBe("medida_escrita_por_el_cliente");
    expect(salida.medida_del_cliente).toBe("215/65R16");
    expect(salida.regla).toMatch(/buscar_llanta/);
  });
});

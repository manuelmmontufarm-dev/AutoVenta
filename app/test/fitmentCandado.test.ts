import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";
import type { TireSize } from "../src/domain/tireSize.js";
import type { FitmentResearchResult } from "../src/services/vehicleFitmentResearch.js";

/**
 * CANDADO DE FITMENT — el bot nunca se queda sin nada que ofrecer.
 *
 * Caso que lo motivó (7-ago, conversación 1704): el cliente escribió «Para rin
 * 19 / Marca hyundai / Modelo creta 2027» y el bot respondió que no tenía una
 * medida verificada y una pregunta. Nada de stock, nada de precios, chat muerto.
 * Había DOS fallas encadenadas: la investigación devolvía vacío, y la tool
 * aceptaba ese vacío como respuesta final.
 *
 * Esta suite protege la segunda: pase lo que pase con la investigación, si el
 * catálogo tiene stock la tool devuelve al menos una opción y dice de qué
 * escalón la sacó. Todo se prueba con catálogo e investigación falsos porque lo
 * que se está verificando es la lógica del candado, no la red.
 */

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_candado_falso";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

/** Catálogo del caso bajo prueba; cada test lo arma como necesita. */
let catalogo: CatalogItem[] = [];
/** Lo que "descubre" la investigación del vehículo en el caso bajo prueba. */
let investigacion: FitmentResearchResult;
const espiaInvestigacion = vi.fn();

vi.mock("../src/services/catalog.js", async () => {
  // `searchByText` NO se reimplementa: se llama al mismo `searchCatalog` del
  // dominio que usa producción (services/catalog.ts:293 es una línea, delegar).
  // Un mock que devolviera el catálogo entero ignorando la consulta haría pasar
  // el escalón (d) sin probarlo: en producción `muestraDelStock` hace 13
  // búsquedas de texto "R12".."R24" y que rindan algo depende del scoring real.
  const { searchCatalog } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    // Réplicas fieles de los filtros reales de services/catalog.ts: si el candado
    // se apoyara en un criterio más laxo que el de producción, el test mentiría.
    searchBySize: (size: TireSize) =>
      catalogo.filter(
        (item) =>
          item.size !== null &&
          item.size.width === size.width &&
          item.size.rim === size.rim &&
          (size.aspect === null || item.size.aspect === size.aspect),
      ),
    searchAlternatives: (size: TireSize) =>
      catalogo.filter(
        (item) =>
          item.size !== null &&
          item.size.rim === size.rim &&
          Math.abs(item.size.width - size.width) <= 10 &&
          !(item.size.width === size.width && item.size.aspect === size.aspect) &&
          item.stock > 0,
      ),
    searchByText: (consulta: string, limite = 40) => searchCatalog(catalogo, consulta, limite),
    findByCode: () => undefined,
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

vi.mock("../src/services/conversations.js", () => ({
  appendMessage: async () => undefined,
  logQuote: async () => undefined,
  logQuoteArtifact: async () => undefined,
  setStage: async () => undefined,
  updateConversationFacts: async () => undefined,
}));

vi.mock("../src/db/client.js", () => ({ sql: Object.assign(async () => [], { end: async () => undefined }) }));
vi.mock("../src/wa/client.js", () => ({ sendImage: async () => "wamid", sendPdf: async () => "wamid" }));

const { buildTools } = await import("../src/agent/tools.js");

function llanta(over: Partial<CatalogItem> & { size: TireSize; brand: string; code: string }): CatalogItem {
  const { size, brand, code } = over;
  return {
    id: code,
    code,
    name: `${brand} ${code}`,
    brand,
    design: over.design ?? "ZE310",
    size,
    sizeLabel: `${size.width}/${size.aspect}R${size.rim}`,
    price: 100,
    sourcePrice: 90,
    priceTier: "pvp1",
    prices: { pvp1: 100, pvp2: 95, pvp3: 90, pvp4: 85 },
    taxRate: 0.15,
    customerPriceWithTax: 115,
    minimumPriceWithTax: 110,
    distributorPriceWithTax: 105,
    stock: over.stock ?? 8,
    availability: over.availability ?? "available",
    imageUrl: null,
    imageSource: null,
    loadSpeed: null,
    active: true,
    source: "contifico",
    ...over,
  } as CatalogItem;
}

const R19_235_45 = { width: 235, aspect: 45, rim: 19 };
const R19_225_45 = { width: 225, aspect: 45, rim: 19 };
const R19_255_50 = { width: 255, aspect: 50, rim: 19 };
const R16_205_65 = { width: 205, aspect: 65, rim: 16 };

function resultado(over: Partial<FitmentResearchResult>): FitmentResearchResult {
  return {
    status: "reference",
    vehicle: "Hyundai Creta 2027",
    sizes: [],
    candidatos: [],
    note: "nota",
    nextQuestion: null,
    sources: [],
    provider: "web",
    ...over,
  };
}

async function correrFitment(args: Record<string, unknown>) {
  const tools = buildTools({
    conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593999",
    currentUserText: "Para rin 19, hyundai creta 2027",
  } as never);
  const fitment = tools.find((t) => t.function.name === "fitment_vehiculo")!;
  return JSON.parse(await fitment.execute(args));
}

describe("candado de fitment_vehiculo", () => {
  beforeEach(() => {
    catalogo = [];
    espiaInvestigacion.mockClear();
    investigacion = resultado({});
  });

  it("el aro del cliente llega hasta la investigación", async () => {
    investigacion = resultado({ status: "not_found" });
    await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: 19 });
    // Era la falla #1 del caso Creta: el aro se quedaba en el chat.
    expect(espiaInvestigacion).toHaveBeenCalledWith("Hyundai", "Creta", 2027, 19);
  });

  describe("escalón (a): la medida investigada existe en el catálogo", () => {
    it("devuelve opciones de esa medida y lo declara", async () => {
      catalogo = [
        llanta({ code: "FAL-235", brand: "FALKEN", size: R19_235_45 }),
        llanta({ code: "KEN-235", brand: "KENDA", size: R19_235_45 }),
        llanta({ code: "OTRA-16", brand: "GITI", size: R16_205_65 }),
      ];
      investigacion = resultado({ sizes: ["235/45R19"], candidatos: [{ medida: "235/45R19", confianza: "alta", porque: "ficha" }] });

      const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: 19 });

      expect(r.origen_opciones).toBe("medida_investigada");
      expect(r.opciones.length).toBeGreaterThanOrEqual(1);
      expect(r.medidas_con_stock).toEqual(["235/45R19"]);
      // Solo de la medida investigada: la R16 no se cuela.
      expect(r.opciones.every((o: { medida: string }) => o.medida === "235/45R19")).toBe(true);
    });

    it("una medida que existe pero está AGOTADA no cuenta como opción", async () => {
      catalogo = [
        llanta({ code: "FAL-235", brand: "FALKEN", size: R19_235_45, stock: 0, availability: "out" }),
        llanta({ code: "KEN-255", brand: "KENDA", size: R19_255_50 }),
      ];
      investigacion = resultado({ sizes: ["235/45R19"] });

      const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: 19 });

      // Se reporta como agotada, pero el candado baja al aro para tener algo real.
      expect(r.medidas_agotadas).toEqual(["235/45R19"]);
      expect(r.medidas_con_stock).toEqual([]);
      expect(r.origen_opciones).toBe("aro_del_cliente");
      expect(r.opciones.length).toBeGreaterThanOrEqual(1);
      // ESTO es lo que dice el título y lo que faltaba: la agotada volvía a
      // salir como opción #1 por la puerta del aro, con el mismo payload
      // declarándola agotada. `tresOpciones` prefiere lo disponible pero no
      // excluye lo agotado, así que el filtro tiene que ser del candado.
      expect(r.opciones.map((o: { code: string }) => o.code)).not.toContain("FAL-235");
      expect(r.opciones.every((o: { stock: number }) => o.stock > 0)).toBe(true);
      // Y no se contradice consigo mismo: ninguna opción es de una medida agotada.
      expect(r.opciones.some((o: { medida: string }) => r.medidas_agotadas.includes(o.medida))).toBe(false);
    });

    it("con el escalón de marca copado por una agotada, sale la disponible de ese escalón", async () => {
      // Regresión fina: si se filtrara el stock DESPUÉS de `tresOpciones`, la
      // FALKEN agotada se comería el cupo de su escalón y la FALKEN con stock
      // del mismo escalón se perdería. Por eso se filtra antes.
      catalogo = [
        llanta({ code: "FAL-CERO", brand: "FALKEN", size: R19_225_45, stock: 0, availability: "out" }),
        llanta({ code: "FAL-VIVA", brand: "FALKEN", size: R19_255_50, stock: 6 }),
      ];
      investigacion = resultado({ status: "not_found", sizes: [] });

      const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: 19 });

      expect(r.origen_opciones).toBe("aro_del_cliente");
      expect(r.opciones.map((o: { code: string }) => o.code)).toEqual(["FAL-VIVA"]);
    });
  });

  describe("escalón (b): no hay medida con stock, pero el cliente dio su aro", () => {
    it("ofrece opciones de ese aro cuando la investigación no encontró nada", async () => {
      catalogo = [
        llanta({ code: "FAL-255", brand: "FALKEN", size: R19_255_50 }),
        llanta({ code: "WIN-225", brand: "WINRUN", size: R19_225_45 }),
        llanta({ code: "GIT-16", brand: "GITI", size: R16_205_65 }),
      ];
      investigacion = resultado({ status: "not_found", sizes: [] });

      const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: 19 });

      expect(r.encontrado).toBe(false);
      expect(r.origen_opciones).toBe("aro_del_cliente");
      expect(r.opciones.length).toBeGreaterThanOrEqual(1);
      // Todas del aro del cliente; nunca una R16.
      expect(r.opciones.every((o: { medida: string }) => o.medida.endsWith("R19"))).toBe(true);
      // Y la regla obliga a decir que son del aro, no las de fábrica.
      expect(r.regla).toContain("ARO");
    });
  });

  describe("escalón (c): sin aro, se ofrecen las medidas más cercanas que sí existen", () => {
    it("cae a la alternativa del mismo aro cuando la medida exacta no está", async () => {
      catalogo = [
        llanta({ code: "FAL-225", brand: "FALKEN", size: R19_225_45 }),
        llanta({ code: "GIT-16", brand: "GITI", size: R16_205_65 }),
      ];
      investigacion = resultado({ sizes: ["235/45R19"] });

      const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: null });

      expect(r.origen_opciones).toBe("medida_cercana");
      expect(r.opciones.map((o: { code: string }) => o.code)).toContain("FAL-225");
      // El vendedor tiene que saber que NO son las de fábrica.
      expect(r.regla).toContain("cercanas");
    });
  });

  describe("escalón (d): no hay ni medida ni aro", () => {
    it("muestra stock real en vez de cerrar el turno con una pregunta", async () => {
      catalogo = [llanta({ code: "FAL-16", brand: "FALKEN", size: R16_205_65 })];
      investigacion = resultado({ status: "not_found", sizes: [] });

      const r = await correrFitment({ marca: "Marca", modelo: "Inventada", anio: null, aro: null });

      expect(r.origen_opciones).toBe("muestra_del_stock");
      expect(r.opciones.length).toBeGreaterThanOrEqual(1);
      // Es una muestra, no una recomendación para ese carro: la regla lo exige.
      expect(r.regla).toContain("MUESTRA");
    });
  });

  describe("la invariante", () => {
    const escenarios = [
      { nombre: "medida investigada con stock", sizes: ["235/45R19"], aro: 19, estado: "reference" as const },
      { nombre: "medida investigada sin stock, con aro", sizes: ["185/60R14"], aro: 19, estado: "reference" as const },
      { nombre: "sin medida, con aro", sizes: [], aro: 19, estado: "not_found" as const },
      { nombre: "sin medida, sin aro", sizes: [], aro: null, estado: "not_found" as const },
      { nombre: "medida de otro aro, sin aro del cliente", sizes: ["185/60R14"], aro: null, estado: "ambiguous" as const },
    ];

    for (const escenario of escenarios) {
      it(`nunca devuelve opciones vacías: ${escenario.nombre}`, async () => {
        catalogo = [
          llanta({ code: "FAL-235", brand: "FALKEN", size: R19_235_45 }),
          llanta({ code: "KEN-225", brand: "KENDA", size: R19_225_45 }),
          llanta({ code: "GIT-16", brand: "GITI", size: R16_205_65 }),
        ];
        investigacion = resultado({ status: escenario.estado, sizes: escenario.sizes });

        const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: escenario.aro });

        expect(r.opciones.length).toBeGreaterThanOrEqual(1);
        expect(r.origen_opciones).not.toBeNull();
        // La otra mitad de la invariante: lo que sale se puede vender hoy.
        // Sin esto, «nunca vacío» se cumple mandando llantas en cero.
        expect(r.opciones.every((o: { stock: number }) => o.stock > 0)).toBe(true);
      });
    }

    it("con el catálogo vacío no inventa opciones", async () => {
      // El candado promete no quedarse callado teniendo stock; no promete stock.
      catalogo = [];
      investigacion = resultado({ status: "not_found", sizes: [] });

      const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: 19 });

      expect(r.opciones).toEqual([]);
      expect(r.origen_opciones).toBeNull();
    });

    /**
     * Catálogo vacío y catálogo en cero NO son el mismo escenario, y el que
     * ocurre en producción es el segundo: un lunes con el inventario agotado.
     * Probando solo `catalogo = []` la invariante se veía cumplida mientras los
     * escalones (b), (c) y (d) devolvían llantas invendibles.
     */
    const sinStock = [
      { nombre: "con aro del cliente y medida investigada", sizes: ["235/45R19"], aro: 19 },
      { nombre: "con aro del cliente, sin medida", sizes: [], aro: 19 },
      { nombre: "sin aro, con medida investigada (escalón c)", sizes: ["235/45R19"], aro: null },
      { nombre: "sin aro y sin medida (escalón d)", sizes: [], aro: null },
    ];

    for (const escenario of sinStock) {
      it(`con el catálogo entero AGOTADO se calla en vez de ofrecer ceros: ${escenario.nombre}`, async () => {
        catalogo = [
          llanta({ code: "FAL-235", brand: "FALKEN", size: R19_235_45, stock: 0, availability: "out" }),
          llanta({ code: "KEN-225", brand: "KENDA", size: R19_225_45, stock: 0, availability: "out" }),
          llanta({ code: "GIT-16", brand: "GITI", size: R16_205_65, stock: 0, availability: "out" }),
        ];
        investigacion = resultado({ status: "not_found", sizes: escenario.sizes });

        const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: escenario.aro });

        expect(r.opciones).toEqual([]);
        expect(r.origen_opciones).toBeNull();
      });
    }
  });

  describe("la regla que lee el agente", () => {
    it("las opciones vienen listas para preparar_opciones", async () => {
      catalogo = [llanta({ code: "FAL-235", brand: "FALKEN", size: R19_235_45 })];
      investigacion = resultado({ sizes: ["235/45R19"] });

      const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: 19 });

      expect(r.regla).toContain("preparar_opciones");
      expect(r.regla).toContain("sin volver a buscar");
    });

    /**
     * La prohibición de pedir fotos venció el 6-ago con vision.ts en producción.
     * Mientras siguiera escrita en la tool, el agente creía que no sabía leerlas
     * y descartaba la vía más fácil para el cliente.
     */
    it("ya no afirma que el bot no puede leer fotos, y ofrece las dos vías", async () => {
      catalogo = [llanta({ code: "FAL-235", brand: "FALKEN", size: R19_235_45 })];
      investigacion = resultado({ sizes: ["235/45R19"] });

      const r = await correrFitment({ marca: "Hyundai", modelo: "Creta", anio: 2027, aro: 19 });

      expect(r.regla).not.toMatch(/no puedes leer|NUNCA pidas foto|Nunca pidas foto/i);
      expect(r.regla).toMatch(/escrita/);
      expect(r.regla).toMatch(/foto/);
    });

    it("la descripción de la tool tampoco prohíbe las fotos y pide el aro", () => {
      const tools = buildTools({
        conversation: { id: 1, phone: "593999", name: "C", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
        customerPhone: "593999",
        currentUserText: "hola",
      } as never);
      const fitment = tools.find((t) => t.function.name === "fitment_vehiculo")!;

      expect(fitment.function.description).not.toMatch(/no puedes leer|NUNCA pidas foto/i);
      expect(fitment.function.description).toContain("aro");
      // El aro entró al schema: sin esto la investigación nunca lo recibe.
      const props = (fitment.function.parameters as { properties: Record<string, unknown> }).properties;
      expect(props).toHaveProperty("aro");
    });
  });
});

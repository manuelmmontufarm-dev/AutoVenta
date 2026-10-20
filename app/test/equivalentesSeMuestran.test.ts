import { describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * SIN STOCK EXACTO Y CON EQUIVALENTES DE VERDAD: SE MUESTRAN EN ESE TURNO.
 *
 * Verificación en vivo de la familia 1-B (28-sep, V3a, corrida 2): «Grand
 * Vitara 5p, uso 265/65R16». En 265/65R16 no había; `buscar_llanta` devolvió
 * la KENDA KR608 245/70R16 (−0,2 % de diámetro) y el modelo, en vez de mandar
 * la lámina, escribió «no me aparece stock exacto… sí tengo alternativas en aro
 * 16… ¿Le muestro las opciones equivalentes?». El guardián lo marcó (alta), su
 * reescritura nombraba la KR608 y el freno la podó como «producto nuevo»
 * (guardian_hecho_nuevo_bloqueado): salió el texto flojo. En la corrida 1 del
 * mismo caso el modelo sí llamó preparar_opciones: es azar, no regla.
 *
 * Tres costuras, las tres deterministas:
 *  1. la herramienta dice CUÁLES hay que mostrar (solo las que el juez aprueba);
 *  2. el agente fuerza preparar_opciones con esos códigos si el modelo no lo hizo;
 *  3. esas llantas son hechos del turno: el guardián las puede nombrar.
 */

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_equivalentes_se_muestran";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

let catalogo: CatalogItem[] = [];

vi.mock("../src/services/catalog.js", async () => {
  const { buscarPorAro } = await import("../src/domain/catalog.js");
  const { ordenarPorCercania } = await import("../src/domain/equivalencia.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: () => [],
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: (z: { width: number; aspect: number | null; rim: number }) =>
      catalogo.filter((i) => i.size?.width === z.width && i.size?.aspect === z.aspect && i.size?.rim === z.rim),
    // La de producción: mismo aro, con stock, ordenadas por el juez.
    searchAlternatives: (z: { width: number; aspect: number | null; rim: number }) =>
      ordenarPorCercania(
        catalogo.filter((i) => i.size?.rim === z.rim && !(i.size.width === z.width && i.size.aspect === z.aspect) && i.stock > 0),
        `${z.width}/${z.aspect}R${z.rim}`,
      ),
    catalogCandidates: () => [],
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (code: string) => catalogo.find((i) => i.code === code),
    productosDelCatalogoMencionados: (texto: string) => catalogo.filter((i) => texto.includes(i.design)),
  };
});

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray) => {
      const consulta = strings.join(" ");
      if (/from messages/.test(consulta)) return [];
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
const { obligacionDeMostrarEquivalentes, equivalentesDevueltos, hechoDeEquivalentesDevueltos } = await import("../src/domain/equivalentesPorMostrar.js");
const { frenarHechosNuevosDelGuardian } = await import("../src/domain/guardianNoVendeSolo.js");

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
    customerPriceWithTax: precio, minimumPriceWithTax: precio, distributorPriceWithTax: precio * 0.8,
    stock, availability: stock > 0 ? "available" : "out",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

const CLIENTE = "Grand Vitara 5p, uso 265/65R16";

async function buscarLlanta(texto: string) {
  const tools = buildTools({
    conversation: { id: 1, phone: "593990001601", name: "V3a", stage: "medida_confirmada", bot_paused_until: null, status: "open", current_cycle: 1 },
    customerPhone: "593990001601",
    customerName: "V3a",
    currentUserText: texto,
  } as never);
  const tool = tools.find((t) => t.function.name === "buscar_llanta")!;
  return tool.execute({ width: 265, aspect: 65, rim: 16, flotacion: null });
}

describe("V3a: sin stock en 265/65R16, con equivalentes de verdad en aro 16", () => {
  const conEquivalentes = () => {
    catalogo = [
      llanta("KR608-2457016", "KENDA", "KR608", "245/70R16", 8, 151.2),
      llanta("MAXCLAW-2557016", "WINRUN", "MAXCLAW A/T", "255/70R16", 8, 139.9),
      // Del aro, con stock, pero NO equivale (−8,7 %): no se obliga a mostrarla.
      llanta("R380-2156516", "WINRUN", "R380", "215/65R16", 12, 88.5),
    ];
  };

  it("la herramienta nombra las equivalentes que hay que mostrar, y solo esas", async () => {
    conEquivalentes();
    const resultado = JSON.parse(await buscarLlanta(CLIENTE));
    const codigos = (resultado.mostrar_equivalentes_ahora ?? []).map((e: { code: string }) => e.code);
    expect(codigos).toEqual(["KR608-2457016", "MAXCLAW-2557016"]);
    expect(resultado.siguiente_paso).toMatch(/preparar_opciones/);
    expect(resultado.siguiente_paso).toMatch(/PROHIBIDO preguntar/);
  });

  it("y el campo va primero: la huella del guardián corta a 500 caracteres", async () => {
    conEquivalentes();
    const crudo = await buscarLlanta(CLIENTE);
    expect(crudo.slice(0, 500)).toContain("KR608");
  });

  it("si el modelo contesta en texto sin preparar_opciones, el turno lo obliga con esos códigos", async () => {
    conEquivalentes();
    const resultado = await buscarLlanta(CLIENTE);
    const obligacion = obligacionDeMostrarEquivalentes([{ herramienta: "buscar_llanta", resultado }]);
    expect(obligacion?.codigos).toEqual(["KR608-2457016", "MAXCLAW-2557016"]);
    expect(obligacion?.recordatorio).toMatch(/preparar_opciones/);
    expect(obligacion?.recordatorio).toContain("KR608-2457016");
    // Una vez mostradas, ya no hay obligación.
    expect(obligacionDeMostrarEquivalentes([
      { herramienta: "buscar_llanta", resultado },
      { herramienta: "preparar_opciones", resultado: "{\"imagen_enviada\":true}" },
    ])).toBeNull();
  });

  it("con stock en su medida exacta no se obliga nada", async () => {
    conEquivalentes();
    catalogo.push(llanta("AT-2656516", "FALKEN", "WILDPEAK A/T", "265/65R16", 6, 210));
    const resultado = await buscarLlanta(CLIENTE);
    expect(JSON.parse(resultado).mostrar_equivalentes_ahora).toBeUndefined();
    expect(obligacionDeMostrarEquivalentes([{ herramienta: "buscar_llanta", resultado }])).toBeNull();
  });

  it("sin ninguna equivalente de verdad tampoco (la 215/65R16 no se empuja)", async () => {
    catalogo = [llanta("R380-2156516", "WINRUN", "R380", "215/65R16", 12, 88.5)];
    const resultado = await buscarLlanta(CLIENTE);
    expect(obligacionDeMostrarEquivalentes([{ herramienta: "buscar_llanta", resultado }])).toBeNull();
  });

  it("la reescritura del guardián que nombra la KR608 devuelta NO se poda como producto nuevo", async () => {
    conEquivalentes();
    const resultado = await buscarLlanta(CLIENTE);
    const borrador = "En *265/65R16* no me aparece stock exacto en este momento. Sí tengo alternativas en aro 16.\n---\n¿Le muestro las opciones equivalentes?";
    const correccion = "En *265/65R16* no tengo stock exacto; le calza la *KENDA KR608 245/70R16* a *$151.20 c/u con IVA*, equivalente de su aro.";
    const productos = catalogo.filter((p) => correccion.includes(p.design));
    const yaDicho = equivalentesDevueltos([{ herramienta: "buscar_llanta", argumentos: "{}", resultado: resultado.slice(0, 500) }]);
    expect(frenarHechosNuevosDelGuardian(borrador, correccion, productos, yaDicho).bloqueado).toBe(false);
  });

  it("el guardián las recibe como hecho duro, leídas de la huella recortada a 500", async () => {
    conEquivalentes();
    const resultado = await buscarLlanta(CLIENTE);
    const hecho = hechoDeEquivalentesDevueltos([{ herramienta: "buscar_llanta", resultado: resultado.slice(0, 500) }]);
    expect(hecho).toContain("KENDA KR608 245/70R16");
    expect(hecho).toMatch(/pregunta_de_mas/);
  });
});

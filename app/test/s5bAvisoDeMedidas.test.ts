import { describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * SPRINT 5b (auditoría del 9-nov-2026) — EL GUARDIÁN BORRA EL AVISO VERDADERO
 * DE «MEDIDAS DISTINTAS».
 *
 *   39897 · CLIENTE: «Que precio tienen en 175 x. Rin 16»
 *           BORRADOR: «⚠️ Ojo: estas opciones son de *medidas distintas* del
 *           mismo aro (195/45R16, 205/50R16, 205/55R16) — cada tarjeta lleva la
 *           suya. Para asegurarle el calce necesito la medida del costado…»
 *           GUARDIÁN (mini): `cotizacion_sin_medida` → lo borró entero.
 *   39787 · igual, `hecho_comercial_inventado` («esas medidas no aparecen»).
 *
 * Tres piezas: (1) «175 x. Rin 16» se lee como ancho 175 + aro 16; (2) la
 * herramienta avisa `aviso_medidas:true` DENTRO de los 500 caracteres que ve el
 * Guardián; (3) un candado después del Guardián repone la primera frase del
 * aviso si la corrección la quitó — y solo esa: 39845 (sano) quitó con razón la
 * re-pregunta de medida y conservó el aviso.
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
    productosDelCatalogoMencionados: () => [],
  };
});

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

const { anchoYAro } = await import("../src/domain/anchoYAro.js");
const { buildTools } = await import("../src/agent/tools.js");
const { PASOS } = await import("../src/services/prepararSalida.js");

function llanta(code: string, brand: string, design: string, medida: string, stock: number, precio: number): CatalogItem {
  const m = medida.match(/^(\d+)\/(\d+)R(\d+)$/)!;
  return {
    id: code, code, name: `LLANTA ${medida} ${brand} ${design}`, brand, design,
    size: { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) },
    sizeLabel: medida,
    price: precio, sourcePrice: precio * 0.8, priceTier: "pvp1",
    prices: { pvp1: precio, pvp2: precio, pvp3: precio, pvp4: precio },
    taxRate: 0.15, customerPriceWithTax: precio * 1.3, minimumPriceWithTax: precio, distributorPriceWithTax: precio * 0.9,
    stock, availability: stock <= 0 ? "out" : stock < 4 ? "check" : "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

// Las tres de la lámina real de 39897 (aro 16, tres medidas).
const ZE310 = llanta("359978", "FALKEN", "ZE310", "205/55R16", 12, 141.81);
const KR20 = llanta("K236B042", "KENDA", "KR20", "205/50R16", 12, 113.41);
const R330 = llanta("2055516WNR330", "WINRUN", "R330", "195/45R16", 12, 60.67);

const AVISO_39897 =
  "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (195/45R16, 205/50R16, 205/55R16) — cada tarjeta lleva la suya. Para asegurarle el calce necesito la medida del costado de su llanta.";
const LISTA_39897 = [
  "1 · WINRUN R330 — $60.67 c/u · 4 = $242.68",
  "2 · KENDA KR20 — 2 × $113.41 + 2 × $45.36 = $317.54 (−60 % en la 2.ª llanta)",
  "3 · FALKEN ZE310 — 2 × $141.81 + 2 × $56.72 = $397.06 (−60 % en la 2.ª llanta)",
  "",
  "¿Le cotizo la 1, la 2 o la 3?",
].join("\n");

describe("5b-1 · «175 x. Rin 16» es ancho 175 y aro 16", () => {
  it("39897: lo lee", () => {
    expect(anchoYAro("Que precio tienen en 175 x. Rin 16")).toEqual({ ancho: 175, aro: 16 });
  });

  it.each(["175 x rin 16", "175 × rin 16", "175*rin 16", "175 . rin 16"])("variante «%s»", (t) => {
    expect(anchoYAro(t)).toEqual({ ancho: 175, aro: 16 });
  });

  it("sanos: «175 rin 16» sigue, y una medida completa no cae acá", () => {
    expect(anchoYAro("175 rin 16")).toEqual({ ancho: 175, aro: 16 });
    expect(anchoYAro("175/65R14")).toBeNull();
    expect(anchoYAro("33x12.5 rin 15")).toBeNull();
  });
});

describe("5b-2 · la herramienta avisa `aviso_medidas` donde el Guardián lo ve", () => {
  it("lámina de tres medidas del mismo aro sin medida pedida: `aviso_medidas:true` en los primeros 500 caracteres", async () => {
    catalogo = [ZE310, KR20, R330];
    const tools = buildTools({
      conversation: { id: 1, phone: "593999", name: "Cliente", stage: "nuevo", bot_paused_until: null, status: "open", current_cycle: 1 },
      customerPhone: "593999",
      customerName: "Cliente",
      currentUserText: "Que precio tienen en rin 16",
    } as never);
    const tool = tools.find((t) => t.function.name === "preparar_opciones")!;
    const crudo = await tool.execute({
      codes: ["2055516WNR330", "K236B042", "359978"], nombre_cliente: "Cliente", recomendado: "K236B042",
      motivo: "equilibra precio y rendimiento", cantidad: null,
    });
    const salida = JSON.parse(crudo);
    expect(salida.mensaje_para_enviar).toContain("*medidas distintas*");
    expect(salida.aviso_medidas).toBe(true);
    expect(crudo.slice(0, 500)).toContain('"aviso_medidas":true');
  });
});

describe("5b-3 · el aviso verdadero sobrevive al Guardián", () => {
  const paso = PASOS.find((p) => p.nombre === "aviso_de_medidas_se_queda");
  const ctx = (borrador: string) =>
    ({
      conversation: { id: 39897, current_cycle: 1, stage: "nuevo" },
      tipo: "respuesta",
      textoAntesDelGuardian: borrador,
      textoDelCliente: "Que precio tienen en 175 x. Rin 16",
    }) as never;

  it("el paso existe y corre DESPUÉS del Ángel Guardián", () => {
    const nombres = PASOS.map((p) => p.nombre);
    expect(nombres).toContain("aviso_de_medidas_se_queda");
    expect(nombres.indexOf("aviso_de_medidas_se_queda")).toBeGreaterThan(nombres.indexOf("angel_guardian"));
  });

  it("39897: la corrección sin aviso recupera la primera frase del aviso, sin la re-pregunta", async () => {
    const borrador = `${AVISO_39897}\n\n---\n\n${LISTA_39897}`;
    const salida = await paso!.aplicar(LISTA_39897, ctx(borrador));
    expect(salida).toContain("⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (195/45R16, 205/50R16, 205/55R16) — cada tarjeta lleva la suya.");
    expect(salida).not.toContain("necesito la medida del costado");
    expect(salida).toContain("¿Le cotizo la 1, la 2 o la 3?");
    // El aviso va arriba, como en el borrador.
    expect(salida!.indexOf("medidas distintas")).toBeLessThan(salida!.indexOf("1 · WINRUN"));
  });

  it("39787 (simulador, 9-nov): la corrección dejó el aviso pero le BORRÓ las medidas → vuelve la frase exacta de la herramienta", async () => {
    const aviso = "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (215/60R17, 225/60R17) — cada tarjeta lleva la suya.";
    const lista = "1 · WINRUN R380 — $92.40 c/u · 4 = $369.60\n\n¿Le cotizo la 1, la 2 o la 3?";
    const borrador = `${aviso} Para asegurarle el calce necesito la medida del costado de su llanta.\n\n---\n\n${lista}`;
    const corregido =
      "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro. Para asegurarle el calce necesito la medida del costado de su llanta.\n\n"
      + lista;
    const salida = await paso!.aplicar(corregido, ctx(borrador));
    expect(salida).toContain(aviso);
    expect(salida!.match(/medidas distintas/g)).toHaveLength(1);
  });

  it("39787 (simulador, vuelta 2): la corrección PARAFRASEÓ el aviso («…son de *rin 17*…») → se reemplaza, no se duplica", async () => {
    const aviso = "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (215/60R17, 225/60R17) — cada tarjeta lleva la suya.";
    const lista = "1 · WINRUN R380 — $92.40 c/u · 4 = $369.60\n\n¿Le cotizo la 1, la 2 o la 3?";
    const borrador = `${aviso} Para asegurarle el calce necesito la medida del costado de su llanta.\n\n---\n\n${lista}`;
    const corregido = "⚠️ Ojo: estas opciones son de *rin 17* y cada tarjeta lleva su medida. Si desea, le ayudo a elegir la mejor para su camioneta.\n\n" + lista;
    const salida = await paso!.aplicar(corregido, ctx(borrador));
    expect(salida).toContain(aviso);
    expect(salida!.match(/⚠️ Ojo/g)).toHaveLength(1);
    expect(salida).not.toContain("*rin 17*");
  });

  it.each([
    "Ojo: cada opción es de una medida diferente (215/60R17 y 225/60R17).",
    "Ojo: cada tarjeta lleva su medida, revísela antes de elegir.",
  ])("revisión ronda 1 (m7): la corrección reescribió el aviso como «%s» → se reemplaza, no se duplica", async (reescrito) => {
    const aviso = "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (215/60R17, 225/60R17) — cada tarjeta lleva la suya.";
    const lista = "1 · WINRUN R380 — $92.40 c/u · 4 = $369.60\n\n¿Le cotizo la 1, la 2 o la 3?";
    const borrador = `${aviso} Para asegurarle el calce necesito la medida del costado de su llanta.\n\n---\n\n${lista}`;
    const salida = await paso!.aplicar(`${reescrito}\n\n${lista}`, ctx(borrador));
    expect(salida).toContain(aviso);
    expect(salida!.match(/Ojo/g)).toHaveLength(1);
  });

  it("SANO 39845: la corrección ya conservó el aviso (y quitó la re-pregunta) → no se toca", async () => {
    const aviso = "⚠️ Ojo: estas opciones son de *medidas distintas* del mismo aro (225/75R15, 225/70R15) — cada tarjeta lleva la suya.";
    const lista = "1 · KENDA KR15 — 2 × $132.94 + 2 × $53.18 = $372.24 (−60 % en la 2.ª llanta)\n\n¿Le cotizo la 1, la 2 o la 3?";
    const borrador = `${aviso} Para asegurarle el calce necesito la medida del costado de su llanta.\n\n---\n\n${lista}`;
    const corregido = `${aviso}\n\n---\n\n${lista}`;
    expect(await paso!.aplicar(corregido, ctx(borrador))).toBe(corregido);
  });

  it("sin aviso en el borrador no inventa nada", async () => {
    expect(await paso!.aplicar(LISTA_39897, ctx(LISTA_39897))).toBe(LISTA_39897);
  });
});

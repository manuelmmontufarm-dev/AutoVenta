import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * EL CANDADO `sin_precio_por_llanta_con_promo`, DE PUNTA A PUNTA (auditoría 9-nov).
 *
 * Cotiza con la herramienta de verdad (Falken $75 hoy / $100 de lista × 4 =
 * 2 × $100 + 2 × $40 = $280) y comprueba que lo que el candado lee es lo que la
 * cotización GUARDÓ (no el texto del bot), que reescribe un «c/u» de hoy o de
 * lista por la cuenta en las tres puertas, y que no toca Winrun ni una cotización
 * sin promo. También que el texto de la cotización recién firmada
 * (`tryCotizarLoElegido`) lee la línea guardada.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_precio_por_llanta_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

let catalogo: CatalogItem[] = [];
vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (q: string, l = 40) => searchCatalog(catalogo, q, l),
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: () => [], searchAlternatives: () => [],
    catalogCandidates: (r: string) => catalogo.filter((i) => i.code === r),
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (c: string) => catalogo.find((i) => i.code === c),
  };
});
vi.mock("../src/services/interbotPrices.js", () => ({
  refreshPriceForSize: async () => undefined, getInterbotPrice: () => undefined,
}));
vi.mock("../src/wa/client.js", () => ({
  sendImage: async () => "wamid-imagen", sendPdf: async () => "wamid-pdf",
}));
vi.mock("../src/render/quoteImage.js", () => ({
  renderQuoteImage: async () => Buffer.from("png"),
  renderCompareImage: async () => Buffer.from("png"),
  renderOptionsImage: async () => Buffer.from("png"),
  renderMedidaGuideImage: async () => Buffer.from("png"),
  toRenderLine: async (p: CatalogItem, quantity = 1) => ({
    brand: p.brand, design: p.design, sizeLabel: p.sizeLabel ?? p.name,
    quantity, unitPrice: p.minimumPriceWithTax, total: p.minimumPriceWithTax * quantity,
  }),
}));
vi.mock("../src/services/advisorNotifications.js", () => ({ notifyAdvisor: async () => undefined }));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { buildTools } = await import("../src/agent/tools.js");
const { PASOS } = await import("../src/services/prepararSalida.js");
const { lineasConPromoDelCiclo, lineaCotizadaDe } = await import("../src/services/lineasConPromo.js");

function llanta(marca: string): CatalogItem {
  return {
    id: `C-${marca}`, code: `C-${marca}`, name: `205/55R16 ${marca} ZE310`,
    brand: marca, design: "ZE310",
    size: { width: 205, aspect: 55, rim: 16 }, sizeLabel: "205/55R16",
    price: 65.22, sourcePrice: 60, priceTier: "pvp1",
    prices: { pvp1: 65.22, pvp2: 65.22, pvp3: 65.22, pvp4: 65.22 },
    taxRate: 0.15,
    customerPriceWithTax: 100, minimumPriceWithTax: 75, distributorPriceWithTax: 60,
    stock: 12, availability: "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}

interface Fila { id: number; current_cycle: number }
let telefono = 593980078000;
async function conversacion(): Promise<{ fila: Fila; phone: string }> {
  const phone = String(++telefono);
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Cliente', 'open', 'opciones_enviadas', 1, '205/55R16', 4)
    returning id, current_cycle
  `;
  return { fila, phone };
}
const contexto = (fila: Fila, phone: string) => ({
  conversation: { id: fila.id, phone, name: "Cliente", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: fila.current_cycle },
  customerPhone: phone, customerName: "Cliente", currentUserText: "sí, cotíceme esas por favor",
} as never);
async function cotizar(fila: Fila, phone: string, code: string, cantidad: number) {
  const tool = buildTools(contexto(fila, phone)).find((t) => t.function.name === "generar_cotizacion")!;
  return JSON.parse(await tool.execute({ items: [{ code, cantidad }], nombre_cliente: null }));
}
const paso = PASOS.find((p) => p.nombre === "sin_precio_por_llanta_con_promo")!;
const salida = (fila: Fila, phone: string, tipo: "respuesta" | "retomada" | "seguimiento") => ({
  conversation: { id: fila.id, current_cycle: fila.current_cycle, stage: "cotizacion_enviada" as never, phone },
  tipo,
});

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T17:00:00Z"));
  await ensureSchema();
  catalogo = [llanta("FALKEN"), llanta("WINRUN")];
});
afterEach(() => vi.setSystemTime(new Date("2026-11-15T17:00:00Z")));
afterAll(async () => {
  vi.useRealTimers();
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("el paso sin_precio_por_llanta_con_promo", () => {
  it("está en la cadena, después del Guardián y de su candado, y corre en las tres puertas", () => {
    const nombres = PASOS.map((p) => p.nombre);
    expect(paso).toBeDefined();
    expect(nombres.indexOf("sin_precio_por_llanta_con_promo")).toBeGreaterThan(nombres.indexOf("guardian_no_vende_solo"));
    expect(nombres.indexOf("sin_precio_por_llanta_con_promo")).toBeGreaterThan(nombres.indexOf("sin_menu_repetido"));
    expect([...paso.corre].sort()).toEqual(["respuesta", "retomada", "seguimiento"]);
  });

  it("Falken × 4 cotizada: lee la promo guardada y cambia el c/u de hoy y el de lista por la cuenta (caso 39909)", async () => {
    const { fila, phone } = await conversacion();
    const r = await cotizar(fila, phone, "C-FALKEN", 4);
    expect(r.enviada).toBe(true);
    const lineas = await lineasConPromoDelCiclo(fila.id, fila.current_cycle);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ hoyConIva: 75, listaConIva: 100, cantidad: 4 });
    const cuenta = "2 × $100.00 + 2 × $40.00 = $280.00 (−60 % en la 2.ª llanta)";
    for (const tipo of ["respuesta", "retomada", "seguimiento"] as const) {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const hoy = await paso.aplicar("Listo, le cotizo la *FALKEN ZE310* — *$75.00 c/u con IVA* 👍", salida(fila, phone, tipo));
      const lista = await paso.aplicar("Listo, la *FALKEN ZE310* queda en *$100.00 c/u con IVA* 👍", salida(fila, phone, tipo));
      expect(hoy).toBe(`Listo, le cotizo la *FALKEN ZE310* — *${cuenta}* 👍`);
      expect(lista).toBe(`Listo, la *FALKEN ZE310* queda en *${cuenta}* 👍`);
      // El mecanismo deja huella en el log.
      expect(warn.mock.calls.some((c) => String(c[0]).includes("💲") && String(c[0]).includes("Black Friday"))).toBe(true);
      warn.mockRestore();
    }
  });

  it("la línea recién cotizada que lee tryCotizarLoElegido trae la promo guardada", async () => {
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-FALKEN", 4);
    const linea = await lineaCotizadaDe(fila.id, fila.current_cycle, "C-FALKEN");
    expect(linea?.segundaLlanta?.totalConIva).toBe(280);
    expect(linea?.quantity).toBe(4);
  });

  it("Winrun × 4 y Falken × 1 (sin promo): el c/u se conserva", async () => {
    const w = await conversacion();
    await cotizar(w.fila, w.phone, "C-WINRUN", 4);
    expect(await lineasConPromoDelCiclo(w.fila.id, w.fila.current_cycle)).toEqual([]);
    expect(await paso.aplicar("Winrun $75.00 c/u con IVA · 4 = $300.00", salida(w.fila, w.phone, "respuesta")))
      .toBe("Winrun $75.00 c/u con IVA · 4 = $300.00");
    const u = await conversacion();
    await cotizar(u.fila, u.phone, "C-FALKEN", 1);
    expect(await lineasConPromoDelCiclo(u.fila.id, u.fila.current_cycle)).toEqual([]);
    expect(await paso.aplicar("La Falken queda en $75.00 c/u con IVA", salida(u.fila, u.phone, "respuesta")))
      .toBe("La Falken queda en $75.00 c/u con IVA");
  });

  it("una cotización más nueva (otra cantidad) reemplaza a la anterior: no se reescribe con la cuenta vieja", async () => {
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-FALKEN", 4);
    await new Promise((ok) => setTimeout(ok, 5));
    vi.setSystemTime(new Date("2026-11-15T17:05:00Z"));
    await cotizar(fila, phone, "C-FALKEN", 1);
    expect(await lineasConPromoDelCiclo(fila.id, fila.current_cycle)).toEqual([]);
  });
});

describe.sequential("ronda 1 de la revisión: el candado lee el ESTADO y respeta la temporada", () => {
  const cuenta = "2 × $100.00 + 2 × $40.00 = $280.00 (−60 % en la 2.ª llanta)";

  it("B1 · cotización del 29-nov leída el 2-dic: el «$75.00 c/u» (que ese día es el precio) sale intacto", async () => {
    vi.setSystemTime(new Date("2026-11-29T17:00:00Z"));
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-FALKEN", 4);
    expect(await lineasConPromoDelCiclo(fila.id, fila.current_cycle)).toHaveLength(1);
    vi.setSystemTime(new Date("2026-12-02T17:00:00Z"));
    expect(await lineasConPromoDelCiclo(fila.id, fila.current_cycle)).toEqual([]);
    for (const tipo of ["respuesta", "retomada", "seguimiento"] as const) {
      expect(await paso.aplicar("Cada una le sale en $75.00 c/u con IVA.", salida(fila, phone, tipo)))
        .toBe("Cada una le sale en $75.00 c/u con IVA.");
    }
  });

  it("B1 · compuerta cerrada por Ajustes a mitad de mes: tampoco se reescribe", async () => {
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-FALKEN", 4);
    const temporada = await import("../src/domain/promocionDeTemporada.js");
    temporada.fijarCompuertaDeTemporada(() => false);
    try {
      expect(await paso.aplicar("La Falken: $75.00 c/u con IVA.", salida(fila, phone, "respuesta")))
        .toBe("La Falken: $75.00 c/u con IVA.");
    } finally {
      temporada.fijarCompuertaDeTemporada(() => true);
    }
  });

  it("B2 · conv 40137: la ficha dice 3 llantas y la lámina trae la cuenta de 4: no se reescribe NADA con la cuenta de 4", async () => {
    const { fila, phone } = await conversacion();
    await sql`update conversations set selected_quantity = 3 where id = ${fila.id}`;
    const segunda = { porcentaje: 60, unidades: 2, precioNormalConIva: 100, precioConIva: 40, ahorroConIva: 120, totalConIva: 280, nombre: "Black Friday" };
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, metadata)
      values (${fila.id}, 1, 'assistant', 'outbound', 'Opciones enviadas', 'image',
        ${sql.json({ piece: "options", cantidad: 4, escalones: { economica: { codigo: "C-FALKEN", nombre: "FALKEN ZE310", precio_con_iva: 75, segunda_llanta: segunda }, equilibrada: null, premium: null } } as never)})
    `;
    expect(await lineasConPromoDelCiclo(fila.id, fila.current_cycle)).toEqual([]);
    const t = "FALKEN ZE310 — $75.00 c/u · 3 = $225.00";
    expect(await paso.aplicar(t, salida(fila, phone, "respuesta"))).toBe(t);
    // Con la ficha en 4 (o sin ficha) la misma pieza sí se lee.
    await sql`update conversations set selected_quantity = 4 where id = ${fila.id}`;
    expect(await lineasConPromoDelCiclo(fila.id, fila.current_cycle)).toHaveLength(1);
    expect(await paso.aplicar("La Falken: $75.00 c/u con IVA.", salida(fila, phone, "respuesta")))
      .toBe(`La Falken: ${cuenta}.`);
  });

  it("M4 · el turno de la comparativa (enviar_comparacion) queda fuera del candado: es decisión pendiente de Manuel", async () => {
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-FALKEN", 4);
    const t = "FALKEN ZE310 · $75.00 c/u";
    const conComparativa = { ...salida(fila, phone, "respuesta"), huella: [{ herramienta: "enviar_comparacion", argumentos: "{}", resultado: "{}" }] };
    expect(await paso.aplicar(t, conComparativa)).toBe(t);
    expect(await paso.aplicar(t, salida(fila, phone, "respuesta"))).toBe(`FALKEN ZE310 · ${cuenta}`);
  });
});

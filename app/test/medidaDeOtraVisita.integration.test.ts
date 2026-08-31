import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * LA COTIZACIÓN DE OTRA MEDIDA — conversación 4732, 26-ago-2026.
 *
 * El caso, tal como está en producción: el cliente compró el 13-ago para una
 * Dongfeng en 265/65R17 (FALKEN WILDPEAK A/T 4W, código 356398). La
 * conversación nunca se cerró, así que el ciclo 1 siguió abierto. Trece días
 * después volvió por otro carro —235/70R15—, no había stock exacto, el bot le
 * ofreció bien la equivalente 235/75R15 (código 356521)… y cuando el cliente
 * dijo «Ok», el modelo llamó a `generar_cotizacion` con el código VIEJO. El
 * candado de medida lo dejó pasar porque 265/65R17 seguía figurando como
 * «pedida» trece días después, y salió COT-MTACN72K por una llanta de otra
 * medida.
 *
 * Estas pruebas atacan el turno exacto, con el código exacto que mandó el
 * modelo. Van de integración porque las tres cosas que se afirman viven en la
 * base: los mensajes con su fecha (la ventana de la visita), la pieza de
 * opciones con las equivalentes declaradas, y la alerta que queda.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_otra_visita_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

let catalogo: CatalogItem[] = [];

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog } = await import("../src/domain/catalog.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (consulta: string, limite = 40) => searchCatalog(catalogo, consulta, limite),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: () => [],
    searchAlternatives: () => [],
    catalogCandidates: (referencia: string) => catalogo.filter((i) => i.code === referencia),
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (codigo: string) => catalogo.find((i) => i.code === codigo),
  };
});
vi.mock("../src/services/interbotPrices.js", () => ({
  refreshPriceForSize: async () => undefined,
  getInterbotPrice: () => undefined,
}));
vi.mock("../src/wa/client.js", () => ({
  sendImage: async () => "wamid-imagen",
  sendPdf: async () => "wamid-pdf",
}));
vi.mock("../src/render/quoteImage.js", () => ({
  renderQuoteImage: async () => Buffer.from("png"),
  renderCompareImage: async () => Buffer.from("png"),
  renderOptionsImage: async () => Buffer.from("png"),
  renderMedidaGuideImage: async () => Buffer.from("png"),
  toRenderLine: async (product: CatalogItem, quantity = 1) => ({
    brand: product.brand, design: product.design, sizeLabel: product.sizeLabel ?? product.name,
    quantity, unitPrice: product.minimumPriceWithTax, total: product.minimumPriceWithTax * quantity,
  }),
}));
vi.mock("../src/services/advisorNotifications.js", () => ({ notifyAdvisor: async () => undefined }));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { buildTools } = await import("../src/agent/tools.js");

/** Las dos Falken del caso: mismo modelo, distinta medida. */
function falken(code: string, sizeLabel: string, width: number, aspect: number, rim: number): CatalogItem {
  return {
    id: code, code,
    name: `LLANTA ${sizeLabel} FALKEN WILDPEAK A/T 4W`,
    brand: "FALKEN", design: "WILDPEAK A/T 4W",
    size: { width, aspect, rim },
    sizeLabel,
    price: 180, sourcePrice: 150, priceTier: "pvp1",
    prices: { pvp1: 180, pvp2: 180, pvp3: 180, pvp4: 180 },
    taxRate: 0.15,
    customerPriceWithTax: 295.69, minimumPriceWithTax: 208.48, distributorPriceWithTax: 170,
    stock: 4, availability: "available",
    imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
  };
}
const VIEJA = "356398";   // 265/65R17 — la del 13-ago
const NUEVA = "356521";   // 235/75R15 — la equivalente que se le mostró el 26

interface Fila { id: number; current_cycle: number }

const HACE_13_DIAS = "now() - interval '13 days'";

/**
 * La conversación tal como estaba a las 17:09 del 26-ago: la compra vieja con
 * su medida, la visita nueva, y —si `conEquivalentesDeclaradas`— la pieza de
 * opciones que le dijo con todas las letras que la 235/75R15 es la equivalente.
 */
async function conversacion(phone: string, opciones: {
  tireSize: string;
  conEquivalentesDeclaradas: boolean;
  conVisitaNueva?: boolean;
}): Promise<Fila> {
  const [fila] = await sql<Fila[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_product_code, selected_quantity)
    values (${phone}, 'Andres Tamayo', 'open', 'opciones_enviadas', 1, ${opciones.tireSize}, ${VIEJA}, 4)
    returning id, current_cycle
  `;
  // La visita del 13-ago: acá el cliente sí pidió 265/65R17.
  await sql.unsafe(`
    insert into messages (conversation_id, role, content, direction, type, cycle, created_at)
    values (${fila.id}, 'user', '265/65R17', 'inbound', 'text', 1, ${HACE_13_DIAS}),
           (${fila.id}, 'user', 'Quiero para un camino mixto', 'inbound', 'text', 1, ${HACE_13_DIAS})
  `);
  if (opciones.conVisitaNueva !== false) {
    await sql`
      insert into messages (conversation_id, role, content, direction, type, cycle)
      values (${fila.id}, 'user', 'Hola llantas 235/70R15', 'inbound', 'text', 1),
             (${fila.id}, 'user', 'Me gusta la Falken', 'inbound', 'text', 1)
    `;
  }
  if (opciones.conEquivalentesDeclaradas) {
    // La pieza que salió: tres opciones, y el aviso de que son equivalentes.
    await sql`
      insert into messages (conversation_id, role, content, direction, type, cycle, metadata)
      values (${fila.id}, 'assistant', 'Opciones enviadas', 'outbound', 'image', 1,
        ${sql.json({ piece: "options", codes: [NUEVA], sizeLabel: "235/75R15", equivalentes: ["235/75R15"] })})
    `;
    await sql`
      insert into quote_artifacts (conversation_id, cycle, kind, products)
      values (${fila.id}, 1, 'options', ${sql.json([{ code: NUEVA, brand: "FALKEN", design: "WILDPEAK A/T 4W" }])})
    `;
  }
  return fila;
}

async function cotizar(
  fila: Fila,
  phone: string,
  code: string,
  texto = "Ok",
  permiso: { aceptoCotizacion?: boolean; consultaFueraDeCatalogo?: boolean } = {
    aceptoCotizacion: true,
  },
) {
  const tools = buildTools({
    conversation: { id: fila.id, phone, name: "Andres Tamayo", stage: "opciones_enviadas", bot_paused_until: null, status: "open", current_cycle: fila.current_cycle },
    customerPhone: phone,
    customerName: "Andres Tamayo",
    currentUserText: texto,
    ...permiso,
  } as never);
  const tool = tools.find((t) => t.function.name === "generar_cotizacion");
  if (!tool) throw new Error("generar_cotizacion no está registrada");
  return JSON.parse(await tool.execute({ items: [{ code, cantidad: 4 }], nombre_cliente: null }));
}

const cotizacionesDe = (id: number) => sql<{ items: Array<{ code: string; sizeLabel: string }> }[]>`
  select items from quotes where conversation_id=${id} order by created_at desc
`;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});
beforeEach(() => {
  catalogo = [
    falken(VIEJA, "265/65R17", 265, 65, 17),
    falken(NUEVA, "235/75R15", 235, 75, 15),
  ];
});

describe.sequential("generar_cotizacion · la medida de la compra anterior no firma la de hoy", () => {
  it("un «Ok» sobre cambio de aceite no firma una cotización de llantas", async () => {
    const phone = "593980004730";
    const fila = await conversacion(phone, {
      tireSize: "265/65R17", conEquivalentesDeclaradas: false, conVisitaNueva: false,
    });

    const salida = await cotizar(fila, phone, VIEJA, "Ok", {
      aceptoCotizacion: false,
      consultaFueraDeCatalogo: true,
    });

    expect(salida.error).toMatch(/no autorizó cotizar llantas/i);
    expect(await cotizacionesDe(fila.id)).toHaveLength(0);
  });

  it("EL BUG: con el código de hace 13 días, se cotiza la que el cliente SÍ vio", async () => {
    const phone = "593980004732";
    const fila = await conversacion(phone, { tireSize: "235/70R15", conEquivalentesDeclaradas: true });

    // Exactamente lo que hizo el modelo en producción a las 17:10.
    const salida = await cotizar(fila, phone, VIEJA);

    expect(salida.error, `no debía bloquearse: ${salida.error ?? ""}`).toBeUndefined();
    expect(salida.enviada).toBe(true);

    // Lo que se firmó es la 235/75R15, no la 265/65R17 de la otra compra.
    const [cotizacion] = await cotizacionesDe(fila.id);
    expect(cotizacion.items[0].code).toBe(NUEVA);
    expect(cotizacion.items[0].sizeLabel).toBe("235/75R15");

    // Y queda constancia de que hubo que corregir: el asesor lo ve.
    const [aviso] = await sql<{ exact_reason: string }[]>`
      select exact_reason from bot_alerts
      where conversation_id=${fila.id} and type='medida_no_coincide'
    `;
    expect(aviso.exact_reason).toContain("265/65R17");
    expect(aviso.exact_reason).toContain("235/75R15");
  });

  it("sin una equivalente que el cliente haya visto, NO se inventa: se bloquea", async () => {
    const phone = "593980004733";
    const fila = await conversacion(phone, { tireSize: "235/70R15", conEquivalentesDeclaradas: false });

    const salida = await cotizar(fila, phone, VIEJA);

    expect(salida.error).toContain("MEDIDA DISTINTA");
    expect(await cotizacionesDe(fila.id)).toHaveLength(0);
  });

  it("y la equivalente que el bot declaró se cotiza sola, sin pelear", async () => {
    // El otro medio caso de Joaquín: «y luego nunca le mandó la cotización».
    // Antes esto se bloqueaba porque 235/75R15 no la había escrito el cliente.
    const phone = "593980004734";
    const fila = await conversacion(phone, { tireSize: "235/70R15", conEquivalentesDeclaradas: true });

    const salida = await cotizar(fila, phone, NUEVA);

    expect(salida.error).toBeUndefined();
    const [cotizacion] = await cotizacionesDe(fila.id);
    expect(cotizacion.items[0].sizeLabel).toBe("235/75R15");
  });

  it("EL CASO QUE NO DEBE DISPARAR: la medida pedida hoy se cotiza como siempre", async () => {
    const phone = "593980004735";
    const fila = await conversacion(phone, {
      tireSize: "265/65R17", conEquivalentesDeclaradas: false, conVisitaNueva: false,
    });
    // El cliente acaba de escribir su medida en este mismo turno.
    const salida = await cotizar(fila, phone, VIEJA, "265/65R17, deme 4");

    expect(salida.error).toBeUndefined();
    const [cotizacion] = await cotizacionesDe(fila.id);
    expect(cotizacion.items[0].sizeLabel).toBe("265/65R17");
  });
});

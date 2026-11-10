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
  const { mencionaProducto } = await import("../src/domain/guardianNoVendeSolo.js");
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
    // Igual que producción: las llantas del catálogo que el texto nombra.
    productosDelCatalogoMencionados: (texto: string) => catalogo.filter((i) => mencionaProducto(texto, i)),
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
const lineasMod = await import("../src/services/lineasConPromo.js");

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

// ===========================================================================
// RONDA 2 DE LA REVISIÓN: el estado REAL de 40137 (ficha vacía) y la cantidad que dijo el CLIENTE
// ===========================================================================
describe.sequential("ronda 2: la cantidad que dijo el cliente es un veto", () => {
  const cuenta4 = "2 × $100.00 + 2 × $40.00 = $280.00 (−60 % en la 2.ª llanta)";
  const segunda4 = { porcentaje: 60, unidades: 2, precioNormalConIva: 100, precioConIva: 40, ahorroConIva: 120, totalConIva: 280, nombre: "Black Friday" };

  async function conPiezaDe4(mensajesDelCliente: string[]) {
    const { fila, phone } = await conversacion();
    // La ficha VACÍA, como en producción (40137): el bot no registró la cantidad.
    await sql`update conversations set selected_quantity = null where id = ${fila.id}`;
    for (const m of mensajesDelCliente) {
      await sql`insert into messages (conversation_id, cycle, role, direction, content, type) values (${fila.id}, 1, 'user', 'inbound', ${m}, 'text')`;
    }
    await sql`
      insert into messages (conversation_id, cycle, role, direction, content, type, metadata)
      values (${fila.id}, 1, 'assistant', 'outbound', 'Opciones enviadas', 'image',
        ${sql.json({ piece: "options", cantidad: 4, escalones: { economica: { codigo: "C-FALKEN", nombre: "FALKEN ZE310", precio_con_iva: 75, segunda_llanta: segunda4 }, equilibrada: null, premium: null } } as never)})
    `;
    return { fila, phone };
  }

  it("(1) ficha VACÍA + pieza de 4 + el mensaje real del 40137: «Le queda en $75.00 c/u con IVA.» sale intacto", async () => {
    const { fila, phone } = await conPiezaDe4(["225 70 rin 16 tres llantas por favor me cotizas"]);
    const t = "Le queda en $75.00 c/u con IVA.";
    expect(await paso.aplicar(t, salida(fila, phone, "respuesta"))).toBe(t);
    // También con el texto del turno (el mensaje que se está contestando aún no está en la base).
    const { fila: f2, phone: p2 } = await conPiezaDe4([]);
    expect(await paso.aplicar(t, { ...salida(f2, p2, "respuesta"), textoDelCliente: "225 70 rin 16 tres llantas por favor me cotizas" })).toBe(t);
  });

  it("(2) cotización de 4 + «¿y si llevo solo 2?»: nunca sale la cuenta de 4 por 2 llantas", async () => {
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-FALKEN", 4);
    await sql`insert into messages (conversation_id, cycle, role, direction, content, type) values (${fila.id}, 1, 'user', 'inbound', '¿y si llevo solo 2?', 'text')`;
    for (const borrador of ["Con 2 serían $75.00 c/u", "Si lleva solo 2, quedan a $75.00 c/u."]) {
      expect(await paso.aplicar(borrador, salida(fila, phone, "respuesta"))).toBe(borrador);
      expect(await paso.aplicar(borrador, { ...salida(fila, phone, "respuesta"), textoDelCliente: "¿y si llevo solo 2?" })).toBe(borrador);
    }
  });

  it("(3) NO se rompe: ficha vacía, pieza de 4 y el cliente no dijo ninguna cantidad (39597 sin «las 4») → sí reescribe con la cuenta de 4", async () => {
    const { fila, phone } = await conPiezaDe4(["Hola, 255/65/17 camioneta"]);
    expect(await paso.aplicar("La Falken queda en $75.00 c/u con IVA.", salida(fila, phone, "respuesta")))
      .toBe(`La Falken queda en ${cuenta4}.`);
  });

  it("(4) la ÚLTIMA cantidad que dijo manda: «quiero 2» y después «mejor las 4» → reescribe con la de 4", async () => {
    const { fila, phone } = await conPiezaDe4(["quiero 2 llantas", "mejor las 4 por favor"]);
    expect(await paso.aplicar("La Falken: $75.00 c/u con IVA.", salida(fila, phone, "respuesta")))
      .toBe(`La Falken: ${cuenta4}.`);
  });

  it("m1 · ficha sucia: 235 → el juego de 4; 16 sigue siendo 16 (8 + 8)", async () => {
    const { cantidadDeLaFicha } = await import("../src/agent/tools.js");
    const a = await conversacion();
    await sql`update conversations set selected_quantity = 235 where id = ${a.fila.id}`;
    expect(await cantidadDeLaFicha({ conversation: { id: a.fila.id } })).toBe(4);
    await sql`update conversations set selected_quantity = 16 where id = ${a.fila.id}`;
    expect(await cantidadDeLaFicha({ conversation: { id: a.fila.id } })).toBe(16);
    await sql`update conversations set selected_quantity = null where id = ${a.fila.id}`;
    expect(await cantidadDeLaFicha({ conversation: { id: a.fila.id } })).toBe(4);
  });

  it("m5 · un total viejo al lado de la cuenta deja una alerta propia (se cuenta en la próxima auditoría) y el texto no se borra", async () => {
    const { fila, phone } = await conversacion();
    await cotizar(fila, phone, "C-FALKEN", 4);
    const salidaTexto = await paso.aplicar("La Falken está a $75.00 c/u, son $300.00 por las 4.", salida(fila, phone, "respuesta"));
    expect(salidaTexto).toContain("$300.00");
    const alertas = await sql<{ type: string }[]>`select type from bot_alerts where conversation_id = ${fila.id}`;
    expect(alertas.map((a) => a.type)).toContain("precio_total_viejo_junto_a_la_cuenta");
  });
});

// ===========================================================================
// RONDA 3: la respuesta al menú («1», «2», «3», «quiero la 2») NO es una cantidad de llantas
// ===========================================================================
describe.sequential("ronda 3: contestar el menú no es pedir llantas", () => {
  const { cantidadDelCliente } = lineasMod;
  const cuenta4 = "2 × $100.00 + 2 × $40.00 = $280.00 (−60 % en la 2.ª llanta)";
  const segunda4 = { porcentaje: 60, unidades: 2, precioNormalConIva: 100, precioConIva: 40, ahorroConIva: 120, totalConIva: 280, nombre: "Black Friday" };
  const MENU = "¿Le cotizo la 1, la 2 o la 3?";

  async function hilo(ficha: number | null, mensajes: Array<["in" | "out", string, object?]>) {
    const { fila, phone } = await conversacion();
    await sql`update conversations set selected_quantity = ${ficha} where id = ${fila.id}`;
    for (const [dir, texto, metadata] of mensajes) {
      if (dir === "in") {
        await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, content, type) values (${fila.id}, 1, 'user', 'inbound', 'customer', ${texto}, 'text')`;
      } else {
        await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, content, type, metadata) values (${fila.id}, 1, 'assistant', 'outbound', 'bot', ${texto}, 'text', ${sql.json((metadata ?? {}) as never)})`;
      }
    }
    return { fila, phone };
  }
  const menu: ["out", string, object] = ["out", MENU, { oferta: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3 } }];

  for (const respuesta of ["3", "2", "1", "quiero la 2", "la 3"]) {
    it(`«${respuesta}» contestando «${MENU}»: no es cantidad (ficha 4 y ficha vacía)`, async () => {
      for (const ficha of [4, null]) {
        const { fila } = await hilo(ficha, [["in", "Hola, 225/70/16"], menu, ["in", respuesta]]);
        const q = await cantidadDelCliente(fila.id);
        expect(q.turno).toBeNull();
        expect(q.historial).toBeNull();
        expect(q.vetos).toEqual(ficha === null ? [] : [4]);
        // …y lo mismo si el llamador pasa el texto del turno.
        const q2 = await cantidadDelCliente(fila.id, respuesta);
        expect(q2.turno).toBeNull();
      }
    });
  }

  it("control: «tres llantas por favor me cotizas» (sin menú de por medio) sigue dando 3", async () => {
    const { fila } = await hilo(null, [["in", "225 70 rin 16 tres llantas por favor me cotizas"]]);
    expect((await cantidadDelCliente(fila.id)).turno).toBe(3);
  });

  it("control: después del menú, «quiero 3 llantas» SÍ es una cantidad (dice la unidad)", async () => {
    const { fila } = await hilo(null, [menu, ["in", "mejor quiero 3 llantas"]]);
    expect((await cantidadDelCliente(fila.id)).turno).toBe(3);
  });

  it("39226 real, ficha vacía: «4 llantas», el menú, «1», «Y fotos tiene», «De esta llanta» → el historial da 4, no 1", async () => {
    const { fila } = await hilo(null, [
      ["in", "Hola, quiero 4 llantas 265/65/17"], menu, ["in", "1"], ["out", "Aquí tiene la cotización."], ["in", "Y fotos tiene"], ["in", "De esta llanta"],
    ]);
    const q = await cantidadDelCliente(fila.id);
    expect(q.historial).toBe(4);
    expect(q.turno).toBeNull();
  });

  it("de punta a punta: pieza de 4, menú, el cliente contesta «3» (la Falken) → el candado SIGUE reescribiendo con la cuenta de 4", async () => {
    // El orden real: el cliente pide, sale la pieza, sale el menú, y recién entonces contesta «3».
    const pieza: ["out", string, object] = ["out", "Opciones enviadas", { piece: "options", cantidad: 4, escalones: { economica: { codigo: "C-FALKEN", nombre: "FALKEN ZE310", precio_con_iva: 75, segunda_llanta: segunda4 }, equilibrada: null, premium: null } }];
    const { fila, phone } = await hilo(null, [["in", "Hola, 225/70/16"], pieza, menu, ["in", "3"]]);
    expect(await paso.aplicar("La Falken queda en $75.00 c/u con IVA.", { ...salida(fila, phone, "respuesta"), textoDelCliente: "3" }))
      .toBe(`La Falken queda en ${cuenta4}.`);
  });
});

// ===========================================================================
// RONDA 4: el turno que contesta el menú ya guardó la cotización; burbujas en medio; mensaje citado; búsquedas sin promo
// ===========================================================================
describe.sequential("ronda 4: el «mensaje anterior» es el anterior al ÚLTIMO entrante", () => {
  const { cantidadDelCliente } = lineasMod;
  const segunda4 = { porcentaje: 60, unidades: 2, precioNormalConIva: 100, precioConIva: 40, ahorroConIva: 120, totalConIva: 280, nombre: "Black Friday" };
  const cuenta4 = "2 × $100.00 + 2 × $40.00 = $280.00 (−60 % en la 2.ª llanta)";
  const MENU = "¿Le cotizo la 1, la 2 o la 3?";
  const menu: ["out", string, object] = ["out", MENU, { oferta: { tipo: "oferta_de_cotizar", clase: "menu", opciones: 3 } }];
  const pieza: ["out", string, object] = ["out", "Opciones enviadas", { piece: "options", cantidad: 4, escalones: { economica: { codigo: "C-FALKEN", nombre: "FALKEN ZE310", precio_con_iva: 75, segunda_llanta: segunda4 }, equilibrada: null, premium: null } }];
  const cotizacion: ["out", string, object] = ["out", "Cotización COT-MW6YSMYU enviada por $280.00", { piece: "quote", quoteNumber: "COT-MW6YSMYU" }];

  async function hilo(ficha: number | null, mensajes: Array<["in" | "out", string, object?]>) {
    const { fila, phone } = await conversacion();
    await sql`update conversations set selected_quantity = ${ficha} where id = ${fila.id}`;
    for (const [dir, texto, metadata] of mensajes) {
      if (dir === "in") {
        await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, content, type) values (${fila.id}, 1, 'user', 'inbound', 'customer', ${texto}, 'text')`;
      } else {
        await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, content, type, metadata) values (${fila.id}, 1, 'assistant', 'outbound', 'bot', ${texto}, 'text', ${sql.json((metadata ?? {}) as never)})`;
      }
    }
    return { fila, phone };
  }

  it("BLOQUEANTE · pieza → menú → «3» → la cotización que el turno YA guardó: con textoDelTurno «3» el candado reescribe con la cuenta de 4", async () => {
    const { fila, phone } = await hilo(null, [["in", "Hola, 225/70/16"], pieza, menu, ["in", "3"], cotizacion]);
    expect((await cantidadDelCliente(fila.id, "3")).turno).toBeNull();
    expect(await paso.aplicar("La opción 3, FALKEN ZE310 — $75.00 c/u con IVA.", { ...salida(fila, phone, "respuesta"), textoDelCliente: "3" }))
      .toBe(`La opción 3, FALKEN ZE310 — ${cuenta4}.`);
  });

  it("burbuja entre el menú y la respuesta (mapas, «Quedo atento…»): el «2» sigue siendo la opción 2", async () => {
    const { fila } = await hilo(4, [["in", "Hola, 225/70/16"], menu, ["out", "Puede pasar sin compromiso a verlas"], ["out", "📍 Depot Tire Cumbayá: https://maps.app"], ["in", "2"]]);
    const q = await cantidadDelCliente(fila.id);
    expect(q.turno).toBeNull();
    expect(q.vetos).toEqual([4]);
  });

  it("…pero un «2» MUCHO después, ya contestado el menú y con la cotización de por medio, sí es una cantidad", async () => {
    const { fila } = await hilo(null, [["in", "Hola, 225/70/16"], menu, ["in", "3"], cotizacion, ["in", "2"]]);
    expect((await cantidadDelCliente(fila.id)).turno).toBe(2);
  });

  it("mensaje citado: un «2» que cita el menú NO es cantidad, aunque haya otra burbuja en medio", async () => {
    const { fila } = await hilo(null, [["in", "Hola, 225/70/16"], ["out", MENU], ["out", "Perfecto 👍"], ["in", "2"]]);
    expect((await cantidadDelCliente(fila.id, "2", MENU)).turno).toBeNull();
    expect((await cantidadDelCliente(fila.id, "2", null)).turno).toBe(2);
  });

  it("las búsquedas no consultan la base fuera de la promo (1-dic): la ficha en 3 da el juego; en noviembre da 3", async () => {
    const { cantidadDeLaFicha } = await import("../src/agent/tools.js");
    const { fila } = await hilo(3, []);
    vi.setSystemTime(new Date("2026-12-01T17:00:00Z"));
    expect(await cantidadDeLaFicha({ conversation: { id: fila.id } })).toBe(4);
    vi.setSystemTime(new Date("2026-11-15T17:00:00Z"));
    expect(await cantidadDeLaFicha({ conversation: { id: fila.id } })).toBe(3);
  });
});

describe.sequential("ronda 5 (replay 10-nov, 39597): el respaldo del catálogo, de punta a punta", () => {
  const TEXTO = [
    "⚠️ Ojo: en *255/65R17* no me queda disponibilidad exacta. Estas son las equivalentes de su aro que sí tengo:",
    "1 · FALKEN WILDPEAK TRAIL — *$75.00 c/u*",
    "2 · KENDA KR50 — *$75.00 c/u*",
    "3 · FALKEN WILDPEAK 4W — *$75.00 c/u*",
  ].join("\n");
  const cuenta4 = "2 × $100.00 + 2 × $40.00 = $280.00 (−60 % en la 2.ª llanta)";
  const otra = (marca: string, diseno: string, code: string): CatalogItem => ({ ...llanta(marca), id: code, code, design: diseno, name: `205/55R16 ${marca} ${diseno}` });

  async function hiloConFicha(ficha: number | null, textoCliente = "las 4 por favor") {
    const { fila, phone } = await conversacion();
    await sql`update conversations set selected_quantity = ${ficha} where id = ${fila.id}`;
    await sql`insert into messages (conversation_id, cycle, role, direction, author_kind, content, type) values (${fila.id}, 1, 'user', 'inbound', 'customer', ${textoCliente}, 'text')`;
    return { fila, phone };
  }
  const aplicar = (fila: Fila, phone: string, texto: string, textoDelCliente?: string) =>
    paso.aplicar(texto, { ...salida(fila, phone, "respuesta"), textoDelCliente });

  it("ficha 4 y NINGUNA pieza/cotización guardada: la KR50 y la 4W salen con la cuenta (antes pasaban con c/u)", async () => {
    catalogo = [otra("FALKEN", "WILDPEAK TRAIL", "C-TRAIL"), otra("KENDA", "KR50", "C-KR50"), otra("FALKEN", "WILDPEAK 4W", "C-4W"), llanta("WINRUN")];
    const { fila, phone } = await hiloConFicha(4);
    expect(await lineasConPromoDelCiclo(fila.id, fila.current_cycle)).toEqual([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nuevo = await aplicar(fila, phone, TEXTO);
    expect(nuevo).toContain(`1 · FALKEN WILDPEAK TRAIL — *${cuenta4}*`);
    expect(nuevo).toContain(`2 · KENDA KR50 — *${cuenta4}*`);
    expect(nuevo).toContain(`3 · FALKEN WILDPEAK 4W — *${cuenta4}*`);
    expect(nuevo).not.toMatch(/c\/u/);
    expect(warn.mock.calls.some((c) => String(c[0]).includes("del catálogo"))).toBe(true);
    warn.mockRestore();
  });

  it("ficha 3 (impar): el c/u se conserva", async () => {
    const { fila, phone } = await hiloConFicha(3, "tres llantas");
    expect(await aplicar(fila, phone, TEXTO)).toBe(TEXTO);
  });

  it("ficha VACÍA y el cliente nunca dijo cantidad: no se inventa una cuenta", async () => {
    const { fila, phone } = await hiloConFicha(null, "Hola, 255/65R17");
    expect(await aplicar(fila, phone, TEXTO)).toBe(TEXTO);
  });

  it("ficha 4 pero el cliente dijo «solo 2» en este turno: vetos en conflicto, no se reescribe", async () => {
    const { fila, phone } = await hiloConFicha(4, "¿y si llevo solo 2?");
    expect(await aplicar(fila, phone, TEXTO, "¿y si llevo solo 2?")).toBe(TEXTO);
  });

  it("ficha vacía pero el cliente dijo «cuatro llantas»: la cantidad del historial vale", async () => {
    const { fila, phone } = await hiloConFicha(null, "quiero cuatro llantas");
    const nuevo = await aplicar(fila, phone, "2 · KENDA KR50 — *$75.00 c/u*");
    expect(nuevo).toBe(`2 · KENDA KR50 — *${cuenta4}*`);
  });

  it("fuera de temporada (1-dic): el c/u es el precio y no se toca", async () => {
    const { fila, phone } = await hiloConFicha(4);
    vi.setSystemTime(new Date("2026-12-01T17:00:00Z"));
    expect(await aplicar(fila, phone, TEXTO)).toBe(TEXTO);
  });

  it("una Winrun nombrada con el mismo precio no se toca (sin promo); y un diseño repetido en otra marca no se adivina", async () => {
    catalogo = [llanta("FALKEN"), llanta("WINRUN")]; // mismo diseño ZE310 en las dos marcas
    const { fila, phone } = await hiloConFicha(4);
    const t = "WINRUN ZE310 — *$75.00 c/u*";
    expect(await aplicar(fila, phone, t)).toBe(t);
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * SPRINT 5d (auditoría del 9-nov-2026) — LA CORRECCIÓN DEL GUARDIÁN SE RECORTA Y
 * QUEDA UNA FRASE SIN SALIDA.
 *
 *   40017 · 11-08 09:46:50 CLIENTE «En labrado mixto» (tenía cotizada la
 *           Falken ZIEX CT60 A/S, H/T).
 *           BORRADOR: «Para ese uso le conviene una llanta A/T o SUV mixta, no
 *           una de turismo. ¿Le cotizo la Falken en 225/70R16?»
 *           GUARDIÁN (gpt-5.5, `tipo_negado_con_stock`): ofrecer la WINRUN
 *           MAXCLAW A/T con stock a $124.76 — lo correcto.
 *           CANDADO `guardian_no_vende_solo`: podó producto y precio nuevos →
 *           salió solo «La Falken ZIEX CT60 A/S que ya le coticé es H/T…; no
 *           es A/T.» Sin alternativa ni pregunta.
 *
 * Bajo `tipo_negado_con_stock` / `stock_prometido`, una llanta del CATÁLOGO DE
 * HOY que cumple el tipo pedido y tiene stock para el juego es un hecho que el
 * Guardián recibió: puede nombrarse con SU precio. Lo demás se sigue podando, y
 * si lo que queda no termina en pregunta, sale un respaldo fijo con el hecho y
 * una pregunta. El caso que el candado nació para frenar (11986: vitrina del
 * Guardián por su cuenta) no cambia.
 */
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_s5d_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

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

// Códigos reales: el tipo lo resuelve el mismo `tipoDeProducto` de producción
// (329015 = H/T, 2257016WRMAXCLAWAT = A/T).
const FALKEN_HT = llanta("329015", "FALKEN", "ZIEX CT60 A/S", "225/70R16", 12, 173.2);
const WINRUN_AT = llanta("2257016WRMAXCLAWAT", "WINRUN", "MAXCLAW A/T", "225/70R16", 20, 124.76);
let catalogo: CatalogItem[] = [FALKEN_HT, WINRUN_AT];

vi.mock("../src/services/catalog.js", async () => {
  const { searchCatalog, buscarPorAro } = await import("../src/domain/catalog.js");
  const { mencionaProducto } = await import("../src/domain/guardianNoVendeSolo.js");
  return {
    ensureCatalogReady: async () => ({}),
    searchByText: (consulta: string, limite = 40) => searchCatalog(catalogo, consulta, limite),
    searchByRim: (aro: number) => buscarPorAro(catalogo, aro),
    searchWithLadder: () => ({ resultados: [], sinCoincidenciaExacta: true, medidaPedida: null, enEsaMedida: [], modeloEnOtrasMedidas: [] }),
    searchBySize: (z: { width: number; aspect: number | null; rim: number }) =>
      catalogo.filter((i) => i.size?.width === z.width && (z.aspect === null || i.size?.aspect === z.aspect) && i.size?.rim === z.rim),
    searchAlternatives: () => [],
    catalogCandidates: (ref: string) => catalogo.filter((i) => i.code === ref),
    catalogStatus: () => ({ items: catalogo.length, error: null }),
    applyInterbotPrices: () => undefined,
    findByCode: (codigo: string) => catalogo.find((i) => i.code === codigo),
    productosDelCatalogoMencionados: (texto: string) => catalogo.filter((i) => mencionaProducto(texto, i)),
  };
});

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { PASOS } = await import("../src/services/prepararSalida.js");
const paso = PASOS.find((p) => p.nombre === "guardian_no_vende_solo")!;

const BORRADOR_40017 = "Para ese uso le conviene una llanta A/T o SUV mixta, no una de turismo.  \n¿Le cotizo la Falken en 225/70R16?";
const CORREGIDO_40017 = [
  "Claro. Para *labrado mixto* en 225/70R16, la opción A/T que tengo es la *WINRUN MAXCLAW A/T* a *$124.76 c/u con IVA*.",
  "",
  "La *Falken ZIEX CT60 A/S* que ya le coticé es *H/T*, más orientada a SUV/carretera; no es A/T.",
  "",
  "---",
  "¿Le cotizo la *WINRUN MAXCLAW A/T* en *225/70R16*?",
].join("\n");
const TIPO_NEGADO = [{
  categoria: "tipo_negado_con_stock", severidad: "alta",
  detalle: "El cliente pidió labrado mixto y el borrador cierra pidiendo cotizar la Falken ZIEX CT60 A/S [H/T]; el catálogo trae WINRUN MAXCLAW A/T con stock.",
}];

async function conversacion(phone: string): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_product_code, selected_quantity)
    values (${phone}, 'Rodolfo', 'open', 'cotizacion_enviada', 1, '225/70R16', '329015', 4) returning id
  `;
  // Lo que el cliente ya vio en el ciclo: la lámina de UNA sola llanta (la Falken) y su cotización.
  await sql`
    insert into messages (conversation_id, cycle, role, direction, content, type, author_kind, metadata, created_at) values
    (${fila.id}, 1, 'user', 'inbound', 'Esa llantita Falken, ¿a cómo está saliendo en rin 16, 70/225?', 'text', null, '{}', now() - interval '4 minutes'),
    (${fila.id}, 1, 'assistant', 'outbound', 'Opciones enviadas: FALKEN ZIEX CT60 A/S', 'image', 'bot',
      ${sql.json({ piece: "options", codes: ["329015"], escalones: { premium: { codigo: "329015", nombre: "FALKEN ZIEX CT60 A/S", precio_con_iva: 173.2 } } })},
      now() - interval '3 minutes'),
    (${fila.id}, 1, 'assistant', 'outbound', 'Cotización COT-S5D enviada por $646.92', 'image', 'bot',
      ${sql.json({ piece: "quote", quoteNumber: "COT-S5D", preciosMostrados: [231.04, 92.42, 277.24, 646.92] })},
      now() - interval '3 minutes'),
    (${fila.id}, 1, 'user', 'inbound', 'En labrado mixto', 'text', null, '{}', now() - interval '20 seconds')
  `;
  return fila.id;
}

const ctx = (id: number, borrador: string, hallazgos = TIPO_NEGADO) => ({
  conversation: { id, current_cycle: 1, stage: "cotizacion_enviada" as const },
  tipo: "respuesta" as const,
  textoDelCliente: "En labrado mixto",
  textoAntesDelGuardian: borrador,
  hallazgosDelGuardian: hallazgos as never,
  ofertaDelTurno: null as unknown,
});

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

describe.sequential("5d · la corrección de tipo negado llega con su alternativa y su pregunta", () => {
  it("40017: la WINRUN MAXCLAW A/T del catálogo (A/T, stock 20) se nombra con su precio y la pregunta queda", async () => {
    catalogo = [FALKEN_HT, WINRUN_AT];
    const id = await conversacion("593980053001");
    const c = ctx(id, BORRADOR_40017);
    const salida = await paso.aplicar(CORREGIDO_40017, c as never);
    expect(salida).toContain("WINRUN MAXCLAW A/T");
    expect(salida).toContain("$124.76");
    expect(salida!.trim()).toMatch(/\?$/);
    // La oferta queda declarada: un «sí» cotiza la Winrun.
    expect(c.ofertaDelTurno).toMatchObject({ tipo: "oferta_de_cotizar", clase: "una", codigo: "2257016WRMAXCLAWAT" });
  });

  it("si lo podado queda sin pregunta, sale el respaldo fijo con el hecho y una pregunta", async () => {
    catalogo = [FALKEN_HT, WINRUN_AT];
    const id = await conversacion("593980053002");
    // El precio no es el del catálogo: esa línea se poda igual que hoy.
    const conPrecioInventado = CORREGIDO_40017.replace(/\$124\.76/g, "$99.99").replace(/\n---\n¿Le cotizo[^\n]*$/, "");
    const salida = await paso.aplicar(conPrecioInventado, ctx(id, BORRADOR_40017) as never);
    expect(salida).not.toContain("$99.99");
    expect(salida).toContain("225/70R16");
    expect(salida).toMatch(/H\/T/);
    expect(salida!.trim()).toMatch(/¿Le muestro las A\/T que tengo\?$/);
  });

  it("sin stock para el juego, la alternativa no cuenta como conocida (se poda y sale el respaldo)", async () => {
    catalogo = [FALKEN_HT, { ...WINRUN_AT, stock: 2, availability: "check" }];
    const id = await conversacion("593980053003");
    const salida = await paso.aplicar(CORREGIDO_40017, ctx(id, BORRADOR_40017) as never);
    expect(salida).not.toContain("WINRUN");
    expect(salida!.trim()).toMatch(/\?$/);
  });

  it("CASO 11986 (no cambia): sin hallazgo de tipo/stock, la vitrina del Guardián se frena y vuelve el borrador", async () => {
    catalogo = [FALKEN_HT, WINRUN_AT];
    const id = await conversacion("593980053004");
    const salida = await paso.aplicar(
      CORREGIDO_40017,
      ctx(id, BORRADOR_40017, [{ categoria: "otro", severidad: "media", detalle: "mejorar el cierre" }]) as never,
    );
    expect(salida).toBe(BORRADOR_40017);
  });

  it("una llanta de OTRO tipo (no la pedida) sigue podándose aunque el hallazgo sea tipo_negado_con_stock", async () => {
    const KR29_MT = llanta("3816B706", "KENDA", "KR29", "225/70R16", 30, 210.5);
    catalogo = [FALKEN_HT, WINRUN_AT, KR29_MT];
    const id = await conversacion("593980053005");
    const vitrina = CORREGIDO_40017.replace("WINRUN MAXCLAW A/T* a *$124.76", "KENDA KR29* a *$210.50");
    const salida = await paso.aplicar(vitrina, ctx(id, BORRADOR_40017) as never);
    expect(salida).not.toContain("KR29");
    expect(salida!.trim()).toMatch(/\?$/);
  });
});

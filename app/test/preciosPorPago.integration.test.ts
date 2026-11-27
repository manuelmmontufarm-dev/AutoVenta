import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * EL PRECIO SEGÚN CÓMO PAGA, contra base: tras una cotización, «cuánto sale en
 * efectivo» se contesta en UN mensaje con los tres precios del Excel. Si la
 * llanta no trae B y C (catálogo subido antes de este cambio), el bot no
 * inventa: sigue lo de hoy, «lo confirma un asesor».
 */
process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_precios_pago_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;
const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

const llanta = (code: string, conPrecios: boolean): CatalogItem => ({
  id: code, code, name: `HAIDA 235/75R15LT AT HD818 LN 10PR`, brand: "HAIDA", design: "AT HD818 LN",
  size: null, sizeLabel: "235/75R15", price: 139.99 / 1.15, sourcePrice: 139.99, priceTier: "pvp1",
  prices: { pvp1: 139.99, pvp2: null, pvp3: null, pvp4: null }, taxRate: 0.15,
  customerPriceWithTax: 139.99, minimumPriceWithTax: 139.99, distributorPriceWithTax: 139.99,
  stock: 11, availability: "available", imageUrl: null, imageSource: null, loadSpeed: null, active: true,
  source: "archivo",
  ...(conPrecios ? { preciosPorPago: { tarjetaConIva: 125, efectivoConIva: 118 } } : {}),
});
const CATALOGO = [
  llanta("A0100", true), llanta("SINBC", false),
  // Producción, 19-nov 03:32 (Manuel): la lámina de 215/65R16, con B y C del Excel del 18-nov.
  { ...llanta("A0239", false), name: "KENDA 215/65R16 98H KR203", brand: "KENDA", design: "KR203", sizeLabel: "215/65R16",
    customerPriceWithTax: 147.2, preciosPorPago: { tarjetaConIva: 131.1, efectivoConIva: 119.6 } },
  { ...llanta("A0486", false), name: "TOWNHALL 215/65R16 TH-161 98H", brand: "TOWNHALL", design: "TH-161", sizeLabel: "215/65R16",
    customerPriceWithTax: 85.1, preciosPorPago: { tarjetaConIva: 75.9, efectivoConIva: 69 } },
  { ...llanta("A0999", false), name: "DURUN 215/65R16 B717", brand: "DURUN", design: "B717", sizeLabel: "215/65R16", customerPriceWithTax: 99 },
];

vi.mock("../src/services/catalog.js", async (orig) => ({
  ...(await orig<object>()),
  findByCode: (code: string) => CATALOGO.find((i) => i.code === code),
  catalogoConPreciosPorPago: () => true,
}));
vi.mock("../src/services/followUps.js", async (orig) => ({
  ...(await orig<object>()),
  createBotAlert: vi.fn(async () => undefined),
}));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { PASOS } = await import("../src/services/prepararSalida.js");
const { DESCUENTO_LO_CONFIRMA_EL_ASESOR } = await import("../src/domain/datosDelNegocio.js");
const paso = PASOS.find((p) => p.nombre === "el_pago_se_responde")!;

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});

async function cotizada(phone: string, code: string, cantidad = 4): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size)
    values (${phone}, 'Jenny', 'open', 'cotizacion_enviada', 1, '235/75R15') returning id
  `;
  await sql`
    insert into quotes (conversation_id, cycle, items, subtotal, tax, total, quote_number, sale_number)
    values (${fila.id}, 1, ${sql.json([{
      code, brand: "HAIDA", design: "AT HD818 LN", sizeLabel: "235/75R15",
      quantity: cantidad, salePriceWithTax: 139.99, listPriceWithTax: 139.99,
    }])}, 486.92, 73.04, 559.96, 'COT-X', 'AV-X')
  `;
  return fila.id;
}
const ctx = (id: number, textoDelCliente: string) =>
  ({ conversation: { id, current_cycle: 1 }, tipo: "respuesta", textoDelCliente }) as never;

/** Una conversación que solo vio la lámina: nadie eligió ni se cotizó nada. */
async function conLamina(phone: string, escalones: Record<string, unknown>): Promise<number> {
  const [fila] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Manuel', 'open', 'seleccionando', 10, '215/65R16', 4) returning id
  `;
  await sql`
    insert into messages (conversation_id, cycle, role, direction, author_kind, type, content, metadata)
    values (${fila.id}, 10, 'assistant', 'outbound', 'bot', 'image', 'Opciones enviadas', ${sql.json({
      piece: "options", cantidad: 4, sizeLabel: "215/65R16", escalones,
    })})
  `;
  return fila.id;
}
const ctx10 = (id: number, textoDelCliente: string) =>
  ({ conversation: { id, current_cycle: 10 }, tipo: "respuesta", textoDelCliente }) as never;

describe.sequential("precios por forma de pago con la lámina, sin elegir (producción, 19-nov)", () => {
  it("«Cuánto en efectivo?» con 1·TOWNHALL y 2·KENDA: las dos opciones con sus tres precios, en el orden de la lista", async () => {
    const id = await conLamina("593980008101", {
      premium: { codigo: "A0239", nombre: "KENDA KR203", precio_con_iva: 147.2 },
      economica: { codigo: "A0486", nombre: "TOWNHALL TH-161", precio_con_iva: 85.1 },
      equilibrada: null,
    });
    const borrador = "Si hay algún descuento por pagar en efectivo, eso se lo confirma un asesor del local.\n\nPrecios con IVA para 4 llantas:\n1 · TOWNHALL TH-161: $340.40\n2 · KENDA KR203: $588.80";
    const salida = await paso.aplicar(borrador, ctx10(id, "Cuánto en efectivo?"));
    const bloque = salida.split("\n---\n")[0];
    expect(bloque).toBe([
      "Estos son los precios según cómo pague (c/u · las 4 llantas):",
      "*1 · TOWNHALL TH-161*",
      "💳 Con tarjeta de crédito: *$75.90* · *$303.60*",
      "💵 En efectivo o transferencia: *$69.00* · *$276.00*",
      "*2 · KENDA KR203*",
      "💳 Con tarjeta de crédito: *$131.10* · *$524.40*",
      "💵 En efectivo o transferencia: *$119.60* · *$478.40*",
    ].join("\n"));
    expect(salida).not.toContain(DESCUENTO_LO_CONFIRMA_EL_ASESOR);
    // Y sobrevive entero al armado del turno. Simulador, 19-nov: el quitador de
    // «frases repetidas» se comía la tarjeta de la 2.ª opción (se parecía a la de la 1.ª).
    const { estructurarTurno } = await import("../src/domain/estructuraDelTurno.js");
    expect(estructurarTurno(bloque).repetidosQuitados).toEqual([]);
  });

  it("con la lámina, la segunda pregunta va en una línea por opción", async () => {
    const id = await conLamina("593980008103", {
      premium: { codigo: "A0239", nombre: "KENDA KR203", precio_con_iva: 147.2 },
      economica: { codigo: "A0486", nombre: "TOWNHALL TH-161", precio_con_iva: 85.1 },
      equilibrada: null,
    });
    const primera = await paso.aplicar("Claro.", ctx10(id, "Cuánto en efectivo?"));
    await sql`
      insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
      values (${id}, 10, 'assistant', 'outbound', 'bot', 'text', ${primera.split("\n---\n")[0]})
    `;
    const tarjeta = await paso.aplicar("Claro.", ctx10(id, "y con tarjeta?"));
    expect(tarjeta.split("\n---\n")[0]).toBe([
      "Con tarjeta de crédito le queda en:",
      "• 1 · TOWNHALL TH-161: *$75.90* c/u · *$303.60* las 4 llantas",
      "• 2 · KENDA KR203: *$131.10* c/u · *$524.40* las 4 llantas",
    ].join("\n"));
  });

  it("una opción sin B y C: da las de la que sí, y esa la confirma el asesor (nunca «asesor» para todo)", async () => {
    const id = await conLamina("593980008102", {
      premium: { codigo: "A0239", nombre: "KENDA KR203", precio_con_iva: 147.2 },
      economica: { codigo: "A0999", nombre: "DURUN B717", precio_con_iva: 99 },
      equilibrada: null,
    });
    const salida = await paso.aplicar("Claro.", ctx10(id, "hay descuento en efectivo?"));
    const [bloque] = salida.split("\n---\n");
    expect(bloque).toContain("*1 · DURUN B717*");
    // Desde el 20-nov (Carlos: «cotizar en P2 y P3») el Precio A no se dice nunca.
    expect(bloque).not.toContain("Precio normal");
    expect(bloque).toContain("El precio con tarjeta y en efectivo de esta se lo confirma un asesor.");
    expect(bloque).toContain("💵 En efectivo o transferencia: *$119.60* · *$478.40*");
    expect(salida).not.toContain(DESCUENTO_LO_CONFIRMA_EL_ASESOR);
  });
});

describe.sequential("precios por forma de pago tras una cotización", () => {
  it("«cuánto sale en efectivo»: un mensaje con el P2 (tarjeta) y el P3 (efectivo) del Excel, sin el A", async () => {
    const id = await cotizada("593980008001", "A0100");
    const borrador = "En efectivo serían $559.96 por las 4. Si hay descuento por efectivo, se lo confirma un asesor.";
    const salida = await paso.aplicar(borrador, ctx(id, "cuánto sale en efectivo?"));
    const [primero] = salida.split("\n---\n");
    expect(primero).toBe([
      "Estos son los precios según cómo pague:",
      "*4 llantas HAIDA AT HD818 LN 235/75R15*",
      "💳 Con tarjeta de crédito: *$125.00* c/u · *$500.00* las 4 llantas",
      "💵 En efectivo o transferencia: *$118.00* c/u · *$472.00* las 4 llantas",
    ].join("\n"));
    // Lo del modelo sobre el pago no se lee repetido ni contradice.
    expect(salida).not.toContain(DESCUENTO_LO_CONFIRMA_EL_ASESOR);
    expect(salida).not.toMatch(/se lo confirma un asesor/);
  });

  it("«y con tarjeta cuánto sale?»: el mismo mensaje", async () => {
    const id = await cotizada("593980008002", "A0100");
    const salida = await paso.aplicar("Con tarjeta el precio es el mismo.", ctx(id, "y con tarjeta cuánto sale?"));
    expect(salida).toContain("💳 Con tarjeta de crédito: *$125.00* c/u · *$500.00* las 4 llantas");
    expect(salida).not.toMatch(/el precio es el mismo/);
  });

  it("lo que queda de una frase quitada (un emoji suelto) no sale solo", async () => {
    const id = await cotizada("593980008007", "A0100");
    const salida = await paso.aplicar("Con tarjeta el precio es el mismo.\n\n🤝", ctx(id, "y con tarjeta cuánto sale?"));
    expect(salida).not.toContain("🤝");
    expect(salida).not.toContain("---");
  });

  it("«tienen algún descuento?» también", async () => {
    const id = await cotizada("593980008003", "A0100");
    const salida = await paso.aplicar("Le confirmo con el asesor.", ctx(id, "tienen algún descuento?"));
    expect(salida).toContain("💵 En efectivo o transferencia: *$118.00* c/u · *$472.00* las 4 llantas");
  });

  // Simulador, 18-nov: tras el bloque quedó «Total: *$559.96*.» del modelo, que
  // debajo de los tres precios se lee como un cuarto.
  it("otro monto del modelo no se queda debajo de los tres precios; lo demás sí", async () => {
    const id = await cotizada("593980008005", "A0100");
    const borrador = "Total: *$559.96*.\n\nIncluye enllantaje, balanceo y nitrógeno.";
    const salida = await paso.aplicar(borrador, ctx(id, "hay descuento en efectivo?"));
    // $559.96 es el Precio A × 4: desde el 20-nov no sale en ningún lado.
    expect(salida).not.toContain("$559.96");
    expect(salida).toContain("Incluye enllantaje, balanceo y nitrógeno.");
  });

  // Simulador, 18-nov: «y con tarjeta cuánto sale?» → el bloque; «hay descuento
  // en efectivo?» → el MISMO bloque, que el candado de calcos se comió entero, y
  // el turno quedó solo con «¿Qué día cree que puede ir?». La segunda vez se
  // contesta lo que preguntó, en una línea.
  it("si el bloque ya salió, la segunda pregunta se contesta con la línea de ese pago", async () => {
    const id = await cotizada("593980008006", "A0100");
    const primera = await paso.aplicar("Claro.", ctx(id, "y con tarjeta cuánto sale?"));
    await sql`
      insert into messages (conversation_id, cycle, role, direction, author_kind, type, content)
      values (${id}, 1, 'assistant', 'outbound', 'bot', 'text', ${primera.split("\n---\n")[0]})
    `;
    const efectivo = await paso.aplicar("Claro.", ctx(id, "hay descuento en efectivo?"));
    // Sprint 2 (auditoría 26-nov, 40/463): preguntó por DESCUENTO → la línea de la promo verdadera (aquí ninguna).
    expect(efectivo.split("\n---\n")[0]).toBe("Pagando en efectivo o por transferencia le queda en *$118.00* c/u · *$472.00* las 4 llantas.\n\n"
      + "Por ahora en *235/75R15* no hay una promoción vigente: el descuento es pagando en *efectivo o transferencia* 💵.");
    const tarjeta = await paso.aplicar("Claro.", ctx(id, "y con tarjeta?"));
    expect(tarjeta.split("\n---\n")[0]).toBe("Con tarjeta de crédito le queda en *$125.00* c/u · *$500.00* las 4 llantas.");
  });

  it("llanta sin B y C: no inventa, va al asesor como hoy", async () => {
    const id = await cotizada("593980008004", "SINBC");
    const salida = await paso.aplicar("Claro.", ctx(id, "hay descuento en efectivo?"));
    expect(salida).toContain(DESCUENTO_LO_CONFIRMA_EL_ASESOR);
    expect(salida).not.toMatch(/\$125|\$118|según cómo pague/);
  });
});

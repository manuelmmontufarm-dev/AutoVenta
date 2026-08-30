import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "../src/domain/catalog.js";

/**
 * EL AVISO DE STOCK NO SE PIERDE DESPUÉS DEL PRIMER TURNO (conv 11061, 26-ago).
 *
 * La prueba hermana (`stockInsuficiente.integration.test.ts`) cubre el turno en
 * que nace el aviso. Esta cubre lo que pasa DESPUÉS, que es donde falló en
 * producción: el reenvío de la pieza y el resumen de la cotización volvieron a
 * prometer 4 llantas cuando había 3, y el último de esos mensajes —el que el
 * cliente se lleva al local— lo escribió el propio Ángel Guardián.
 *
 * Desde el 29-ago el candado vive en UN solo lugar: `asegurarAvisoDeStock`
 * (services/stockCorto.ts), que `prepararSalida` corre DESPUÉS del Ángel
 * Guardián en las tres puertas. La copia que vivía en `applyOutboundGuard`
 * —antes del guardián, o sea inútil contra quien reescribe— se eliminó; esta
 * prueba ejercita la fuente única contra base y catálogo reales.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593999000111";

const BASE = `autoventa_stock_repetido_${process.pid}`;
process.env.DATABASE_URL = `postgresql://manue@localhost/${BASE}`;

const admin = postgres("postgresql://manue@localhost/postgres", { prepare: false, max: 1 });
await admin.unsafe(`drop database if exists ${BASE}`);
await admin.unsafe(`create database ${BASE}`);

/** La KENDA KR203 del caso; cada prueba le pone el stock que quiere probar. */
let stockDeHoy = 3;

vi.mock("../src/services/catalog.js", () => ({
  ensureCatalogReady: async () => ({}),
  findByCode: (codigo: string): CatalogItem | undefined =>
    codigo === "K108B468"
      ? ({
          id: "K108B468", code: "K108B468",
          name: "LLANTA 185/70R14 KENDA KR203",
          brand: "KENDA", design: "KR203",
          size: { width: 185, aspect: 70, rim: 14 },
          sizeLabel: "185/70R14",
          price: 57.09, sourcePrice: 45, priceTier: "pvp1",
          prices: { pvp1: 57.09, pvp2: 57.09, pvp3: 57.09, pvp4: 57.09 },
          taxRate: 0.15,
          customerPriceWithTax: 87.53, minimumPriceWithTax: 65.65, distributorPriceWithTax: 52,
          stock: stockDeHoy,
          availability: stockDeHoy <= 0 ? "out" : stockDeHoy < 4 ? "check" : "available",
          imageUrl: null, imageSource: null, loadSpeed: null, active: true, source: "contifico",
        } as CatalogItem)
      : undefined,
}));

vi.mock("../src/services/advisorNotifications.js", () => ({ notifyAdvisor: async () => undefined }));

const { sql } = await import("../src/db/client.js");
const { ensureSchema } = await import("../src/db/schema.js");
const { asegurarAvisoDeStock } = await import("../src/services/stockCorto.js");
const { PASOS } = await import("../src/services/prepararSalida.js");

/** El resumen de las 12:04:57, tal cual salió en producción. */
const EL_RESUMEN_CULPABLE =
  "Sí, si busca más duración podemos revisar una opción que le convenga para taxi.\n\n" +
  "Por ahora la cotización vigente que tiene es la *COT-MTACEW5X* por *4 × KENDA KR203 185/70R14* " +
  "a *$65.65 c/u*, total *$262.60*.";

let conversationId = 0;

async function conversacionConCotizacion(phone: string, cantidad = 4) {
  const [conv] = await sql<{ id: number }[]>`
    insert into conversations (phone, name, status, stage, current_cycle, tire_size, selected_quantity)
    values (${phone}, 'Edison', 'open', 'cotizacion_enviada', 1, '185/70R14', ${cantidad})
    returning id
  `;
  await sql`
    insert into quotes (conversation_id, cycle, quote_number, subtotal, tax, total, items)
    values (${conv.id}, 1, 'COT-MTACEW5X', 228.35, 34.25, 262.60, ${sql.json([{
      code: "K108B468", brand: "KENDA", design: "KR203", sizeLabel: "185/70R14",
      quantity: cantidad, salePriceWithTax: 65.65,
    }])})
  `;
  conversationId = conv.id;
  return conv.id;
}

beforeAll(async () => { await ensureSchema(); });
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`drop database if exists ${BASE}`);
  await admin.end();
});
beforeEach(() => { stockDeHoy = 3; });

describe.sequential("asegurarAvisoDeStock · el aviso viaja con la cotización (fuente única)", () => {
  it("corre en las tres puertas, después del Ángel Guardián", () => {
    const paso = PASOS.find((p) => p.nombre === "aviso_de_stock");
    expect(paso).toBeDefined();
    expect(paso!.corre).toEqual(expect.arrayContaining(["respuesta", "retomada", "seguimiento"]));
    const iGuardian = PASOS.findIndex((p) => p.nombre === "angel_guardian");
    const iStock = PASOS.findIndex((p) => p.nombre === "aviso_de_stock");
    expect(iStock).toBeGreaterThan(iGuardian);
  });

  it("EL CASO: el resumen que prometía 4 sale con el recordatorio pegado", async () => {
    const id = await conversacionConCotizacion("593982770963");

    const salida = await asegurarAvisoDeStock(id, 1, EL_RESUMEN_CULPABLE);

    expect(salida.texto).toContain("Por ahora la cotización vigente"); // la venta no se toca
    expect(salida.texto).toMatch(/hoy hay \*3\*/);
    expect(salida.texto).toMatch(/cotización es por \*4\*/);
    expect(salida.texto).toMatch(/asesor/);
    expect(salida.pegado).toBe(true);
  });

  it("le queda registrado al asesor que el bot lo había omitido", async () => {
    const id = await conversacionConCotizacion("593982770964");
    await asegurarAvisoDeStock(id, 1, EL_RESUMEN_CULPABLE);

    const alertas = await sql<{ summary: string }[]>`
      select summary from bot_alerts where conversation_id=${id} and type='guard_stock_recordado'
    `;
    expect(alertas).toHaveLength(1);
    expect(alertas[0].summary).toMatch(/sin decir que no hay tantas/i);
  });

  it("el reenvío de la pieza también lo lleva", async () => {
    const id = await conversacionConCotizacion("593982770965");
    const salida = await asegurarAvisoDeStock(id, 1, "Aquí está de nuevo su cotización *COT-MTACEW5X* 🏁");
    expect(salida.texto).toMatch(/hoy hay \*3\*/);
  });

  it("preguntar el día NO lleva aviso: repetirlo en cada turno es ruido", async () => {
    const id = await conversacionConCotizacion("593982770966");
    const cierre = "¿Qué día puede pasar y a cuál local? ¿Depot Tire Cumbayá o Depot Tire Quito Sur?";

    const salida = await asegurarAvisoDeStock(id, 1, cierre);

    expect(salida.texto).toBe(cierre);
    expect(salida.pegado).toBe(false);
  });

  it("si el mensaje ya avisa, no se duplica", async () => {
    const id = await conversacionConCotizacion("593982770967");
    const conAviso =
      "4 × KENDA KR203: $262.60\n\n⚠️ Ojo: de esa llanta hoy tengo *3* disponibles y usted pidió *4*. " +
      "Se la cotizo completa y el resto se lo confirma el asesor en el local.";

    const salida = await asegurarAvisoDeStock(id, 1, conAviso);

    expect(salida.texto).toBe(conAviso);
    expect(salida.pegado).toBe(false);
  });

  it("con stock de sobra el mensaje sale intacto", async () => {
    stockDeHoy = 12;
    const id = await conversacionConCotizacion("593982770968");

    const salida = await asegurarAvisoDeStock(id, 1, EL_RESUMEN_CULPABLE);

    expect(salida.texto).toBe(EL_RESUMEN_CULPABLE);
    expect(salida.pegado).toBe(false);
  });

  it("si reponen en bodega, el aviso deja de salir sin tocar la cotización", async () => {
    // El stock se compara contra el de HOY: la cotización sigue siendo por 4.
    const id = await conversacionConCotizacion("593982770969");
    expect((await asegurarAvisoDeStock(id, 1, EL_RESUMEN_CULPABLE)).pegado).toBe(true);

    stockDeHoy = 6;
    const despues = await asegurarAvisoDeStock(id, 1, EL_RESUMEN_CULPABLE);
    expect(despues.pegado).toBe(false);
    expect(despues.texto).toBe(EL_RESUMEN_CULPABLE);
  });
});

describe.sequential("guardián · el faltante es un hecho duro que ve el revisor", () => {
  it("el contexto trae la línea de STOCK CORTO con los dos números", async () => {
    const { armarContexto } = await import("../src/services/guardian.js");
    const id = await conversacionConCotizacion("593982770970");

    const contexto = await armarContexto(id, 1, EL_RESUMEN_CULPABLE);

    expect(contexto).toMatch(/STOCK CORTO: la cotización vigente es por 4 y hoy hay 3/);
    expect(contexto).toContain("KENDA KR203 185/70R14");
  });

  it("con stock suficiente esa línea no aparece — no hay nada que exigirle", async () => {
    stockDeHoy = 9;
    const { armarContexto } = await import("../src/services/guardian.js");
    const id = await conversacionConCotizacion("593982770971");

    expect(await armarContexto(id, 1, EL_RESUMEN_CULPABLE)).not.toMatch(/STOCK CORTO/);
  });
});

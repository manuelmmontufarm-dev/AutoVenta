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
 * Va de integración porque el candado vive en `applyOutboundGuard`, que lee la
 * cotización vigente de la base y el stock del catálogo: probarlo con la
 * función pura no diría nada del camino real por el que sale un mensaje.
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
const { applyOutboundGuard } = await import("../src/services/outboundGuard.js");

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

describe.sequential("outboundGuard · el aviso de stock viaja con la cotización", () => {
  it("EL CASO: el resumen que prometía 4 sale con el recordatorio pegado", async () => {
    const id = await conversacionConCotizacion("593982770963");

    const salida = await applyOutboundGuard(id, EL_RESUMEN_CULPABLE);

    expect(salida.text).toContain("Por ahora la cotización vigente"); // la venta no se toca
    expect(salida.text).toMatch(/hoy hay \*3\*/);
    expect(salida.text).toMatch(/cotización es por \*4\*/);
    expect(salida.text).toMatch(/asesor/);
    expect(salida.issues).toContain("stock_recordado");
  });

  it("le queda registrado al asesor que el bot lo había omitido", async () => {
    const id = await conversacionConCotizacion("593982770964");
    await applyOutboundGuard(id, EL_RESUMEN_CULPABLE);

    // La alerta se crea sin bloquear el envío (`void (async () => …)()` en
    // applyOutboundGuard): al cliente nunca se le hace esperar por el aviso
    // interno. Por eso acá se sondea en vez de leer de una.
    let alertas: { summary: string }[] = [];
    for (let intento = 0; intento < 20 && alertas.length === 0; intento += 1) {
      await new Promise((ok) => setTimeout(ok, 50));
      alertas = await sql<{ summary: string }[]>`
        select summary from bot_alerts where conversation_id=${id} and type='guard_stock_recordado'
      `;
    }
    expect(alertas).toHaveLength(1);
    expect(alertas[0].summary).toMatch(/sin decir que no hay tantas/i);
  });

  it("el reenvío de la pieza también lo lleva", async () => {
    const id = await conversacionConCotizacion("593982770965");
    const salida = await applyOutboundGuard(id, "Aquí está de nuevo su cotización *COT-MTACEW5X* 🏁");
    expect(salida.text).toMatch(/hoy hay \*3\*/);
  });

  it("preguntar el día NO lleva aviso: repetirlo en cada turno es ruido", async () => {
    const id = await conversacionConCotizacion("593982770966");
    const cierre = "¿Qué día puede pasar y a cuál local? ¿Depot Tire Cumbayá o Depot Tire Quito Sur?";

    const salida = await applyOutboundGuard(id, cierre);

    expect(salida.text).toBe(cierre);
    expect(salida.issues).not.toContain("stock_recordado");
  });

  it("si el mensaje ya avisa, no se duplica", async () => {
    const id = await conversacionConCotizacion("593982770967");
    const conAviso =
      "4 × KENDA KR203: $262.60\n\n⚠️ Ojo: de esa llanta hoy tengo *3* disponibles y usted pidió *4*. " +
      "Se la cotizo completa y el resto se lo confirma el asesor en el local.";

    const salida = await applyOutboundGuard(id, conAviso);

    expect(salida.text).toBe(conAviso);
    expect(salida.issues).not.toContain("stock_recordado");
  });

  it("con stock de sobra el mensaje sale intacto", async () => {
    stockDeHoy = 12;
    const id = await conversacionConCotizacion("593982770968");

    const salida = await applyOutboundGuard(id, EL_RESUMEN_CULPABLE);

    expect(salida.text).toBe(EL_RESUMEN_CULPABLE);
    expect(salida.issues).not.toContain("stock_recordado");
  });

  it("si reponen en bodega, el aviso deja de salir sin tocar la cotización", async () => {
    // El stock se compara contra el de HOY: la cotización sigue siendo por 4.
    const id = await conversacionConCotizacion("593982770969");
    expect((await applyOutboundGuard(id, EL_RESUMEN_CULPABLE)).issues).toContain("stock_recordado");

    stockDeHoy = 6;
    const despues = await applyOutboundGuard(id, EL_RESUMEN_CULPABLE);
    expect(despues.issues).not.toContain("stock_recordado");
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

/**
 * DEPOT NO CAMBIA EN NADA con el P2 y el Black Friday de Competimotor
 * (20-nov-2026). Todo lo nuevo cuelga de dos campos de la política
 * (`precioDeCotizacion`, `preciosEspeciales`) que Depot no tiene; acá se
 * comprueba que, sin ellos, cada pieza tocada devuelve lo mismo que antes.
 */
import { describe, expect, it } from "vitest";

delete process.env.NEGOCIO;
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

const { negocio } = await import("../src/negocio/index.js");
const { politica } = await import("../src/negocio/politica.js");
const { normalizarFilaDeCatalogo } = await import("../src/services/fuentes/sheets.js");
const { buildQuote } = await import("../src/services/quotePdf.js");
const { business } = await import("../src/config.js");
const { aplicarPreciosEspeciales } = await import("../src/domain/preciosEspeciales.js");
const { mensajeDePreciosPorPago } = await import("../src/domain/preciosPorPago.js");
const { toolItem } = await import("../src/agent/tools.js");
const { toRenderLine } = await import("../src/render/quoteImage.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");

describe("Depot: la política no trae nada nuevo", () => {
  it("es Depot, sin precio con tarjeta ni precios especiales", () => {
    expect(negocio.id).toBe("depot");
    expect(politica.precioDeCotizacion).toBeUndefined();
    expect(politica.preciosEspeciales).toBeUndefined();
  });
});

describe("Depot: cada pieza tocada devuelve lo de antes", () => {
  const cruda = { medida: "235/75R15", marca: "HAIDA", diseno: "HD818", codigo: "Z1", precio: "139.99", stock: "11", filaNumero: 2 };
  const precios = { conIva: 139.99, listaConIva: 160, minimoConIva: 139.99, taxRate: 0.15, tarjetaConIva: 126.5, efectivoConIva: 115 };

  it("la fila del catálogo: sin `cotizarCon` el precio es el de siempre (lista tachada y el de hoy)", () => {
    const { item } = normalizarFilaDeCatalogo(cruda, "archivo", precios, politica.precioDeCotizacion);
    expect(item).toMatchObject({ customerPriceWithTax: 160, minimumPriceWithTax: 139.99, distributorPriceWithTax: 139.99 });
    expect(item?.promocionDePrecio).toBeUndefined();
    // Y sin precios (la Sheet), byte a byte lo de siempre.
    expect(normalizarFilaDeCatalogo(cruda, "sheets").item).toMatchObject({ customerPriceWithTax: 139.99, minimumPriceWithTax: 139.99, taxRate: 0 });
  });

  it("Contífico: el mismo producto que antes", () => {
    const p = normalizeContificoProduct({ id: "1", codigo: "K1", nombre: "KENDA 235/75R15 KR28", pvp1: 100, porcentaje_iva: 15, cantidad_stock: 8 }, "pvp1");
    expect(p).toMatchObject({ distributorPriceWithTax: 115, minimumPriceWithTax: 153.33, customerPriceWithTax: 204.44 });
  });

  it("buildQuote: la cuenta de siempre (sin IVA y de vuelta), centavo incluido", () => {
    const linea = { code: "X", description: "x", quantity: 4, unitPrice: 85.99 / (1 + business.taxRate), salePriceWithTax: 85.99, listPriceWithTax: 85.99 };
    // Depot sigue con su cuenta: 4 × $85.99 por el camino sin IVA da $343.97.
    // Cambiarla es decisión aparte; este PR no la toca.
    expect(buildQuote([linea], "", "").total).toBe(343.97);
  });

  it("aplicarPreciosEspeciales con la política de Depot no toca el catálogo", () => {
    const { item } = normalizarFilaDeCatalogo(cruda, "archivo", precios);
    const antes = structuredClone(item!);
    const lista = [item!];
    expect(aplicarPreciosEspeciales(lista, politica.preciosEspeciales, new Date("2026-11-25T12:00:00-05:00"))).toEqual({ aplicadas: 0, omitidas: [] });
    expect(lista[0]).toEqual(antes);
  });

  it("el precio por pago con «Precio normal» sigue igual cuando lo traen", () => {
    expect(mensajeDePreciosPorPago([{ nombre: "X", cantidad: 1, normal: 139.99, tarjeta: 126.5, efectivo: 115 }])).toBe([
      "Estos son los precios según cómo pague:",
      "*1 llantas X*".replace("1 llantas", "1 llanta"),
      "🧾 Precio normal: *$139.99*",
      "💳 Con tarjeta de crédito: *$126.50*",
      "💵 En efectivo o transferencia: *$115.00*",
    ].join("\n"));
  });

  it("el ítem que ve el vendedor no trae claves nuevas", () => {
    const it = toolItem({ code: "K1", brand: "KENDA", design: "KR28", sizeLabel: "235/75R15", stock: 8, customerPriceWithTax: 204.44, minimumPriceWithTax: 153.33,
      preciosPorPago: { tarjetaConIva: 1, efectivoConIva: 1 } });
    expect(it).not.toHaveProperty("promocion");
    expect(it).not.toHaveProperty("precio_efectivo_o_transferencia_con_iva");
  });

  it("la línea de la pieza no trae promoción de precio", async () => {
    const { item } = normalizarFilaDeCatalogo(cruda, "archivo", precios);
    expect(await toRenderLine(item!, 4)).not.toHaveProperty("promocionDePrecio");
  });
});

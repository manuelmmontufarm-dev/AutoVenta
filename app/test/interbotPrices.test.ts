import { describe, expect, it, afterEach } from "vitest";

/**
 * Los precios del bot deben ser los del Interbot (los que ve el vendedor),
 * no los de la fórmula de divisores.
 *
 * Caso real del 7-ago: la RT01 315/70R17 (código 352862) salía $502.16 en la
 * cotización del bot y $489.14 en el Interbot. La fórmula (÷0.75 tras IVA =
 * margen 33%) solo acierta el 27% del catálogo: el Interbot pone los precios
 * producto por producto (32 factores distintos). De ahí el overlay.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";

const { getInterbotPrice, interbotPricesState, __setPreciosForTests } = await import(
  "../src/services/interbotPrices.js"
);
const { applyInterbotPrices } = await import("../src/services/catalog.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");

/** La RT01 tal como la devuelve Contífico (costo 327.50, IVA 15%). */
const RT01_WIRE = {
  id: "KBe1wDyxkIMDp7bX",
  codigo: "352862",
  nombre: "LT315/70R17 121/118R WILDPEAK R/T01 FALKEN",
  estado: "A",
  tipo: "PRO",
  pvp1: "327.500000",
  pvp2: "0.00",
  pvp3: "0.00",
  pvp4: "0.00",
  porcentaje_iva: 15,
  cantidad_stock: 14,
  marca_nombre: "FALKEN",
} as never;

function rt01Item() {
  const item = normalizeContificoProduct(RT01_WIRE, "pvp1");
  if (!item) throw new Error("normalize devolvió null");
  return item;
}

afterEach(() => __setPreciosForTests(null));

describe("precios reales del Interbot", () => {
  it("el snapshot de fábrica trae la RT01 con el precio del Interbot", () => {
    // Sin red y sin credenciales: getInterbotPrice carga assets/precios-interbot.json.
    const ib = getInterbotPrice("352862");
    expect(ib).not.toBeNull();
    expect(ib!.pvpMinConIva).toBe(489.14);
    expect(ib!.pvpFullConIva).toBe(652.18);
    expect(interbotPricesState().productos).toBeGreaterThan(300);
  });

  it("la fórmula sola da el precio equivocado que reclamó Depot (regresión del bug)", () => {
    const item = rt01Item();
    // Esto es lo que salía en la cotización COT-MSIZUCNG: 502.16 en vez de 489.14.
    expect(item.minimumPriceWithTax).toBeCloseTo(502.16, 1);
    expect(item.customerPriceWithTax).toBeCloseTo(669.55, 1);
  });

  it("el overlay corrige la RT01 al precio que ve el vendedor", () => {
    __setPreciosForTests({
      "352862": {
        marca: "FALKEN",
        medida: "315/70R17",
        costoConIva: 376.62,
        pvpFullConIva: 652.18,
        pvpMinConIva: 489.14,
        precioPromoConIva: null,
        tienePromo: false,
      },
    });
    const item = rt01Item();
    const applied = applyInterbotPrices([item]);
    expect(applied).toBe(1);
    expect(item.minimumPriceWithTax).toBe(489.14);
    expect(item.customerPriceWithTax).toBe(652.18);
    // El precio base (sin IVA) acompaña al nuevo PVP para que subtotal+IVA cuadre.
    expect(item.price).toBeCloseTo(652.18 / 1.15, 2);
  });

  it("una promo vigente manda sobre el precio normal", () => {
    __setPreciosForTests({
      "352862": {
        marca: "FALKEN",
        medida: "315/70R17",
        costoConIva: 376.62,
        pvpFullConIva: 652.18,
        pvpMinConIva: 489.14,
        precioPromoConIva: 450,
        tienePromo: true,
      },
    });
    const item = rt01Item();
    applyInterbotPrices([item]);
    expect(item.minimumPriceWithTax).toBe(450);
    expect(item.customerPriceWithTax).toBe(652.18);
  });

  it("un código que el Interbot no conoce conserva la fórmula (último recurso)", () => {
    const item = normalizeContificoProduct(
      { ...(RT01_WIRE as Record<string, unknown>), codigo: "999999" } as never,
      "pvp1",
    );
    if (!item) throw new Error("normalize devolvió null");
    const applied = applyInterbotPrices([item]);
    expect(applied).toBe(0);
    expect(item.minimumPriceWithTax).toBeCloseTo(502.16, 1);
  });

  it("nunca deja un tachado menor o igual al precio de venta", () => {
    __setPreciosForTests({
      "352862": {
        marca: "FALKEN",
        medida: "315/70R17",
        costoConIva: 376.62,
        // Caso raro pero visto en catálogos: full mal cargado por debajo del min.
        pvpFullConIva: 400,
        pvpMinConIva: 489.14,
        precioPromoConIva: null,
        tienePromo: false,
      },
    });
    const item = rt01Item();
    applyInterbotPrices([item]);
    expect(item.customerPriceWithTax).toBe(489.14);
    expect(item.customerPriceWithTax).toBeGreaterThanOrEqual(item.minimumPriceWithTax);
  });
});

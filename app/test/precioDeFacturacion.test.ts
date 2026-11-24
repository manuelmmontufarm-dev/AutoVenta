import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Caso real del 23/24-nov-2026 (Joaquín): «dos clientes vienen con la
 * proforma a menos precio». KENDA KR628 265/70R17 (K557B738):
 *   - cotización del bot COT-MWTHL7CK: $246,42 c/u de lista (4 × BF = $689,98)
 *   - sistema de facturación: $219,70 + IVA = $252,66
 * El Interbot no tiene ese código → caía a la fórmula ÷0,5625 sobre el costo.
 */

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://test@localhost/test";
process.env.CONTIFICO_API_KEY ||= "llave-catalogo-test";
process.env.CONTIFICO_FACTURAS_API_KEY ||= "llave-facturas-test";

const { normalizeContificoProduct } = await import("../src/domain/catalog.js");
const { __setPreciosForTests } = await import("../src/services/interbotPrices.js");
const { applyInterbotPrices, completarLasQueElInterbotNoTiene } = await import(
  "../src/services/catalog.js"
);
const { completarConPrecioDeFacturacion, __olvidarPreciosDeFacturacion } = await import(
  "../src/services/precioDeFacturacion.js"
);

/** Tal como la devuelve el Contífico del catálogo de Depot el 24-nov (pvp1 = costo). */
const KR628_R17_WIRE = {
  id: "XKdwp8OJvcGzLDeg",
  codigo: "K557B738",
  nombre: "265/70R17 115T KR628 TL",
  estado: "A",
  tipo: "PRO",
  pvp1: "120.530000",
  pvp2: "0.000000",
  pvp3: "0.000000",
  pvp4: "0.000000",
  porcentaje_iva: 15,
  cantidad_stock: 42,
  marca_nombre: "KENDA",
} as never;

/** La R16 del mismo diseño, que el Interbot SÍ tiene (no se debe tocar). */
const KR628_R16_WIRE = {
  ...(KR628_R17_WIRE as Record<string, unknown>),
  id: "xmbmZOA9XijK5mdo",
  codigo: "K383B639",
  nombre: "265/70R16 112T - KR628 TL",
  pvp1: "111.570000",
  cantidad_stock: 19,
} as never;

const INTERBOT_R16 = {
  K383B639: {
    marca: "KENDA",
    medida: "265/70R16",
    costoConIva: 128.31,
    pvpFullConIva: 230.08,
    pvpMinConIva: 172.55,
    precioPromoConIva: null,
    tienePromo: false,
  },
};

function item(wire: never) {
  const it = normalizeContificoProduct(wire, "pvp1");
  if (!it) throw new Error("normalize devolvió null");
  return it;
}

/** Respuesta de la API v1 de Contífico con el pvp1 de la empresa que factura. */
function respuestaV1(filas: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify(filas), { status: 200 });
}

afterEach(() => {
  __setPreciosForTests(null);
  __olvidarPreciosDeFacturacion();
  vi.unstubAllGlobals();
});

describe("precio de facturación para lo que el Interbot no tiene", () => {
  it("regresión: con la fórmula sola la KR628 R17 sale a $246,42 (lo que cotizó el bot)", () => {
    __setPreciosForTests(INTERBOT_R16);
    const r17 = item(KR628_R17_WIRE);
    applyInterbotPrices([r17]);
    expect(r17.customerPriceWithTax).toBe(246.42);
    expect(r17.price).toBeCloseTo(214.28, 2);
  });

  it("el caso que falló: queda al precio del POS, $219,70 + IVA = $252,66", async () => {
    __setPreciosForTests(INTERBOT_R16);
    const r17 = item(KR628_R17_WIRE);
    const llamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL, init: RequestInit) => {
        llamadas.push(`${url}`);
        expect((init.headers as Record<string, string>).Authorization).toBe("llave-facturas-test");
        return respuestaV1([{ codigo: "K557B738", nombre: "265/70R17 115T KR628 TL", pvp1: "219.7", estado: "A" }]);
      }),
    );
    applyInterbotPrices([r17]);
    await completarLasQueElInterbotNoTiene([r17]);

    expect(r17.customerPriceWithTax).toBe(252.66);
    expect(r17.price).toBe(219.7);
    // «Precio hoy» del vendedor: el mismo 75 % del lleno que usa el Interbot.
    expect(r17.minimumPriceWithTax).toBe(189.5);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toContain("/api/v1/producto/?codigo=K557B738");
  });

  it("lo que el Interbot sí tiene no se toca ni se consulta", async () => {
    __setPreciosForTests(INTERBOT_R16);
    const r16 = item(KR628_R16_WIRE);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    applyInterbotPrices([r16]);
    await completarLasQueElInterbotNoTiene([r16]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r16.customerPriceWithTax).toBe(230.08);
    expect(r16.minimumPriceWithTax).toBe(172.55);
  });

  it("si la empresa que factura no tiene el código, queda la fórmula y se reporta", async () => {
    const r17 = item(KR628_R17_WIRE);
    const res = await completarConPrecioDeFacturacion([r17], async () => null);
    expect(res).toEqual({ aplicadas: 0, sinConfirmar: ["K557B738"] });
    expect(r17.customerPriceWithTax).toBe(246.42);
  });

  it("una fila con otro código no se toma por buena (el filtro de la API no se cree)", async () => {
    __setPreciosForTests(INTERBOT_R16);
    const r17 = item(KR628_R17_WIRE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respuestaV1([{ codigo: "K557B7380", pvp1: "999", estado: "A" }])),
    );
    await completarLasQueElInterbotNoTiene([r17]);
    expect(r17.customerPriceWithTax).toBe(246.42);
  });

  it("borde: se lee una vez por hora; si después falla, queda el último precio leído", async () => {
    let n = 0;
    const leer = async () => {
      n += 1;
      if (n > 1) throw new Error("Contífico caído");
      return 219.7;
    };
    const t0 = Date.UTC(2026, 10, 24, 16, 0);
    await completarConPrecioDeFacturacion([item(KR628_R17_WIRE)], leer, t0);
    // 5 minutos después (otra sincronización): no se vuelve a preguntar.
    const r = item(KR628_R17_WIRE);
    await completarConPrecioDeFacturacion([r], leer, t0 + 5 * 60_000);
    expect(n).toBe(1);
    expect(r.customerPriceWithTax).toBe(252.66);
    // Pasada la hora se pregunta otra vez; Contífico falla y queda lo leído.
    const r2 = item(KR628_R17_WIRE);
    const res = await completarConPrecioDeFacturacion([r2], leer, t0 + 61 * 60_000);
    expect(n).toBe(2);
    expect(res.aplicadas).toBe(1);
    expect(r2.customerPriceWithTax).toBe(252.66);
  });
});

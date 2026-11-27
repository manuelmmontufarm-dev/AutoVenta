import { describe, expect, it } from "vitest";

/**
 * DEPOT NO CAMBIA con el arreglo de F-01 («Sí tenemos», Competimotor, 26-nov).
 *
 * `politica.stockCortoSeVende` no existe en Depot: la vitrina sigue enseñando
 * solo lo que alcanza para el juego (Joaquín, 26-ago), la caja no firma por
 * debajo de la mitad (conv 11720) y el aviso «hoy tengo 3 y usted pidió 4»
 * sigue saliendo (conv 11061). Mismas entradas que `siTenemosStockCorto`.
 */
process.env.NEGOCIO = "depot";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_medida_falsa";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const { politica } = await import("../src/negocio/politica.js");
const { opcionesQueAlcanzan, tipoQueFiltraLaBusqueda } = await import("../src/domain/opcionesCandados.js");
const stock = await import("../src/domain/stockCorto.js");
const { availabilityFromStock } = await import("../src/domain/catalog.js");

describe("Depot: todo como antes", () => {
  it("no tiene la perilla", () => {
    expect(politica.stockCortoSeVende).toBeUndefined();
    expect(stock.stockCortoSeVende()).toBe(false);
    expect(stock.nombraElStockAlCliente()).toBe(true);
  });

  it("la vitrina solo enseña lo que alcanza para el juego", () => {
    const productos = [{ code: "A", stock: 2 }, { code: "B", stock: 1 }, { code: "C", stock: 4 }, { code: "D", stock: 9 }];
    expect(opcionesQueAlcanzan(productos, 4).map((p) => p.code)).toEqual(["C", "D"]);
    expect(opcionesQueAlcanzan(productos.slice(0, 2), 4)).toEqual([]);
    expect(stock.minimoParaMostrar(4)).toBe(4);
    expect(stock.minimoParaMostrar(2)).toBe(2);
  });

  it("la caja: 3 de 4 se firma, 1 de 4 no (la raya de la mitad)", () => {
    expect(stock.alcanzaParaVender(3, 4)).toBe(true);
    expect(stock.alcanzaParaVender(2, 4)).toBe(true);
    expect(stock.alcanzaParaVender(1, 4)).toBe(false);
    expect(stock.alcanzaParaVender(0, 4)).toBe(false);
  });

  it("el recordatorio de stock corto sigue saliendo con el número", () => {
    expect(stock.recordatorioQueFalta("La cotización vigente es *4 × KENDA KR203* por $262.60.", {
      numero: "COT-MTACEW5X", cantidad: 4, total: 262.6, stockHoy: 3,
    })).toBe(stock.recordatorioStockCorto(3, 4));
  });

  it("al vendedor le viaja el número como siempre", () => {
    expect(stock.stockCortoParaElVendedor({ stock_hoy: 3, solicitadas: 4 })).toEqual({
      stock_insuficiente: { stock_hoy: 3, solicitadas: 4 },
    });
  });

  it("el tipo que pone el modelo filtra como siempre, aunque el cliente diga «pantanera»", () => {
    expect(politica.usoDelClienteAmpliaElTipo).toBeUndefined();
    expect(tipoQueFiltraLaBusqueda("M/T", "lodo", ["Tipo pantaneras"])).toBe("M/T");
  });

  it("la pieza sigue marcando «Consultar» con menos de 4", () => {
    expect(availabilityFromStock(2)).toBe("check");
    expect(availabilityFromStock(4)).toBe("available");
  });
});

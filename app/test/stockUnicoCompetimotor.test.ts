/**
 * UN SOLO STOCK GRANDE (Manuel y Jenny, 18-nov-2026).
 *
 * Los locales quedan cerca: si una llanta no está en uno, la piden por radio y
 * la traen enseguida. Jenny, en las preguntas operativas: «debe tomar en cuenta
 * el stock total», «debe ver solo el total». El bot cotiza con la columna
 * `Existencia` del reporte de Fénix —el total— y NO con la suma de las columnas
 * por local (`Principal, Compe, Matriz, Tsachila, La Feria`).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
delete process.env.IDENTIDAD;
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "593000000000";
process.env.DATABASE_URL ||= "postgresql://nadie@localhost/no_se_usa";

const archivo = await import("../src/services/fuentes/archivo.js");
const { normalizarFilaDeCatalogo } = await import("../src/services/fuentes/sheets.js");
const REPORTE = readFileSync(fileURLToPath(new URL("./fixtures/inventario-fenix-reporte.xls", import.meta.url)));

describe("el stock que usa el bot es `Existencia` (el total)", () => {
  it("el mapeo por defecto lee `existencia` y no declara stock por local", () => {
    expect(archivo.MAPEO_CATALOGO_DEFECTO.columnas.stock).toBe("existencia");
    expect(archivo.MAPEO_CATALOGO_DEFECTO.columnas.stockPorLocal).toBeUndefined();
  });

  it("cada llanta del reporte sale con su `Existencia`, no con la suma de los locales", async () => {
    const lectura = await archivo.leerInventario("inventario-fenix-reporte.xls", REPORTE, archivo.MAPEO_CATALOGO_DEFECTO);
    const items = lectura.catalogo.filas
      .map((f) => normalizarFilaDeCatalogo(f.cruda, "archivo", f.precios).item)
      .filter((i): i is NonNullable<typeof i> => Boolean(i));
    const stock = Object.fromEntries(items.map((i) => [i.code, i.stock]));
    // HAIDA: Existencia 11; los locales (Compe 3 + Matriz 2 + Tsachila 1) suman 6.
    expect(stock.A0100).toBe(11);
    // KENDA KR29: Existencia −4 (vendido sin ingresar) → 0, nunca negativo.
    expect(stock.A0101).toBe(0);
    // HAULMAX 750/15: Existencia 4; los locales (Matriz 1) suman 1.
    expect(stock.A0103).toBe(4);
    // Toda fila guardada sale como llanta: ninguna se filtra por local ni por marca.
    expect(items).toHaveLength(lectura.catalogo.filas.length);
  });
});

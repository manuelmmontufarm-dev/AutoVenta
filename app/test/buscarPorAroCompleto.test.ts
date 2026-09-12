/**
 * BUSCAR POR ARO NO PUEDE ESCONDER STOCK.
 *
 * Auditoría del 8 al 11-sep. Dos chats, el mismo minuto, el mismo stock:
 *
 *   conv 18016 · «265/70R17» + «MT»
 *   BOT: «⚠️ Ojo: en 265/70R17 no me queda disponibilidad exacta en M/T.
 *         La opción equivalente de su aro es KENDA KR29 en 265/65R17»
 *   CLIENTE: «No»
 *   BOT: «Es la opción M/T exacta en la medida que me pidió:
 *         FALKEN WILDPEAK M/T» ← la que acababa de negar
 *
 * La primera respuesta salió de `buscar_por_aro_y_tipo`, que pedía el aro con
 * `searchByText("R17", 60)`: una búsqueda por TEXTO, ordenada por
 * disponibilidad y precio, cortada en 60. En el aro 17 hay 102 productos, así
 * que 43 no entraban — y los que se caen son los caros y los de camioneta.
 * La segunda salió de `buscar_llanta`, que filtra el catálogo por medida y no
 * tiene tope.
 *
 * Y hay un segundo agujero, peor: las medidas en pulgadas («33X12.50R15») no
 * tienen `size` —el parser del catálogo solo les llena `sizeLabel`— así que el
 * filtro `item.size?.rim === aro` las descartaba TODAS, con stock y todo.
 *
 * Medido sobre la foto del catálogo que usa el simulador:
 *   aro 15 → 55 productos, la búsqueda devolvía 47; se caían 3 KR29 con stock
 *   aro 16 → 82 productos, devolvía 57; se caían 9 con stock
 *   aro 17 → 102 productos, devolvía 59; se caían 6 con stock (una es la 318931)
 *   aro 20 → 33 productos, devolvía 15; se caían 3 con stock
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { normalizeContificoProduct, aroDeMedida, buscarPorAro } = await import("../src/domain/catalog.js");
type CatalogItem = NonNullable<ReturnType<typeof normalizeContificoProduct>>;

const catalogo = (): CatalogItem[] => {
  const ruta = fileURLToPath(new URL("../scripts/sim/datos/catalogo.json", import.meta.url));
  const crudo = JSON.parse(readFileSync(ruta, "utf8")) as unknown[];
  return crudo
    .map((p) => {
      try {
        return normalizeContificoProduct(p as Record<string, unknown>, "pvp1");
      } catch {
        return null;
      }
    })
    .filter((x): x is CatalogItem => x !== null && x.active !== false);
};

/** El aro de un producto, venga de la medida métrica o de la de pulgadas. */
const aroDe = (item: CatalogItem): number | null => item.size?.rim ?? aroDeMedida(item.sizeLabel);

describe("buscar por aro devuelve TODO el aro", () => {
  const items = catalogo();

  it("no se queda corta en los aros grandes (17 tiene 102, no 59)", () => {
    for (const aro of [13, 14, 15, 16, 17, 18, 19, 20]) {
      const esperados = items.filter((i) => aroDe(i) === aro);
      const devueltos = buscarPorAro(items, aro);
      expect(devueltos.length, `aro ${aro}`).toBe(esperados.length);
    }
  });

  it("incluye las medidas en pulgadas, que no tienen medida métrica", () => {
    const enAro15 = buscarPorAro(items, 15).map((i) => i.sizeLabel);
    // Las tres KR29 de flotación del aro 15, todas con stock en la foto.
    expect(enAro15).toContain("33X12.5R15");
    expect(enAro15).toContain("31X10.5R15");
    expect(enAro15).toContain("32X11.5R15");
    // Y la 35X12.5R17 del aro 17, con 8 unidades.
    expect(buscarPorAro(items, 17).map((i) => i.sizeLabel)).toContain("35X12.5R17");
  });

  it("no devuelve nada de otro aro", () => {
    for (const aro of [14, 16, 18]) {
      for (const item of buscarPorAro(items, aro)) {
        expect(aroDe(item), `${item.code} ${item.sizeLabel}`).toBe(aro);
      }
    }
  });

  it("la M/T del chat 18016 aparece buscando por aro 17", () => {
    const codigos = buscarPorAro(items, 17).map((i) => i.code);
    // 318931 = LT265/70R17 WILDPEAK M/T, la que el bot negó y después encontró.
    expect(codigos).toContain("318931");
  });

  it("ningún producto con stock del aro queda fuera", () => {
    for (const aro of [15, 16, 17, 20]) {
      const conStock = items.filter((i) => aroDe(i) === aro && i.stock > 0);
      const devueltos = new Set(buscarPorAro(items, aro).map((i) => i.code));
      const perdidos = conStock.filter((i) => !devueltos.has(i.code));
      expect(perdidos.map((i) => `${i.sizeLabel} ${i.design}`), `aro ${aro}`).toEqual([]);
    }
  });
});

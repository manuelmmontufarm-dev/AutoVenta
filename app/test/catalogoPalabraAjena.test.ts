/**
 * Auditoría 9-nov-2026, bloque 10 (convs 39845 y 39615): el anuncio llama a la
 * llanta «Kenda Klever KR601»; en el catálogo es «KENDA … KR601». «klever» no
 * está en ningún producto y el buscador exigía TODAS las palabras: 0 resultados,
 * y el vendedor recibía la orden de decir «no aparece ese modelo en catálogo».
 *
 * Arreglo en el buscador: la palabra que no existe en NINGÚN producto del
 * catálogo se descarta cuando el resto sí encuentra algo — y para no devolver
 * otra marca, el resto tiene que casar al menos con el código o el diseño.
 */
import { describe, expect, it } from "vitest";
import { buscarConEscalera, normalizeContificoProduct, searchCatalog, type CatalogItem } from "../src/domain/catalog.js";

// Nombres y códigos reales de la foto del catálogo (Contífico).
const FILAS: Array<[string, string, string, number]> = [
  ["33374000", "LT285/60R18 122/119Q KR601 10PR TL KENDA", "KENDA", 0],
  ["32512006", "KENDA LT215/75R15 6PR 100/97Q - KR601 TL (CARGA)", "KENDA", 4],
  ["35222009", "KENDA LT235/75R15 6PR 104/101 Q - KR601 TL (CARGA)", "KENDA", 4],
  ["35232008", "KENDA LT235/70R16 6PR 104/101 Q - KR601 TL (CARGA)", "KENDA", 10],
  ["35272004", "KENDA LT265/65R17 10PR 120/117Q - KR601 TL (CARGA)", "KENDA", 4],
  ["35282003", "KENDA  LT265/70R16 6PR 110/107 Q - KR601 TL (CARGA)", "KENDA", 4],
  // Otras Kenda y otras marcas: no deben colarse por la marca sola.
  ["358430", "KENDA 265/65R17 112T KR628 SUV", "KENDA", 8],
  ["33172081", "KENDA 285/75R16 LT KR29 M/T", "KENDA", 4],
  ["329015", "225/70R16 103H CT60 A/S FALKEN ZIEX", "FALKEN", 6],
  ["352165", "205/55R16 91V ZE310R FALKEN", "FALKEN", 22],
  ["340001", "265/65R17 112H WILDPEAK A/T4W FALKEN", "FALKEN", 5],
  ["340002", "265/65R17 112T MAXCLAW A/T WINRUN", "WINRUN", 9],
];

const catalogo: CatalogItem[] = FILAS.map(([codigo, nombre, marca, stock], i) =>
  normalizeContificoProduct(
    {
      id: `p${i}`, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "PRO",
      pvp1: "70.000000", porcentaje_iva: 15, cantidad_stock: String(stock), imagen: null,
    },
    "pvp1",
  ) as CatalogItem,
);

const codigos = (items: CatalogItem[]) => items.map((i) => i.code).sort();

describe("buscador: la palabra que no existe en ningún producto no mata la búsqueda", () => {
  it("«Kenda Klever KR601» devuelve las KR601 (hoy 0)", () => {
    const r = buscarConEscalera(catalogo, "Kenda Klever KR601");
    expect(r.sinCoincidenciaExacta).toBe(false);
    expect(codigos(r.resultados)).toEqual(
      ["32512006", "33374000", "35222009", "35232008", "35272004", "35282003"],
    );
  });

  it("«Klever KR601» también", () => {
    expect(searchCatalog(catalogo, "Klever KR601").length).toBe(6);
  });

  it("«Klever KR601 265/65/17» incluye la KR601 265/65R17 (hoy 0)", () => {
    const r = buscarConEscalera(catalogo, "Klever KR601 265/65/17");
    expect(r.sinCoincidenciaExacta).toBe(false);
    expect(r.resultados.map((i) => i.code)).toEqual(["35272004"]);
    // y no se cuela la KR628 ni las de otra marca de la misma medida
    expect(r.resultados.some((i) => i.brand !== "KENDA")).toBe(false);
  });

  it("una marca mal escrita SIN modelo sigue devolviendo vacío", () => {
    expect(searchCatalog(catalogo, "Kendaa")).toEqual([]);
    expect(searchCatalog(catalogo, "Klever")).toEqual([]);
    expect(searchCatalog(catalogo, "Klever Kenda")).toEqual([]);
    expect(searchCatalog(catalogo, "Falkenn llantas")).toEqual([]);
  });

  it("la marca por sí sola no alcanza: sin código ni diseño que case, no hay relajación", () => {
    // «Zzzzz» no existe; «Falken» es solo marca → NO devuelve todas las Falken.
    expect(searchCatalog(catalogo, "Falken Zzzzz")).toEqual([]);
    expect(searchCatalog(catalogo, "Kenda Klever 265/65/17")).toEqual([]);
  });

  it("un código que no existe sigue sin inventarse otro modelo", () => {
    expect(searchCatalog(catalogo, "Kenda Klever KR999")).toEqual([]);
  });

  it("lo que ya encontraba no cambia (la búsqueda estricta manda)", () => {
    expect(searchCatalog(catalogo, "Kenda KR601").length).toBe(6);
    expect(codigos(searchCatalog(catalogo, "KR601 265/65R17"))).toEqual(["35272004"]);
    expect(searchCatalog(catalogo, "Falken Wildpeak").map((i) => i.code)).toEqual(["340001"]);
  });
});

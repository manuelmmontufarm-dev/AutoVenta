/**
 * Ronda 1 del Sprint 4 (revisión s4-r1): la relajación del buscador («Klever»)
 * devolvía OTRA marca u otro modelo como coincidencia exacta. «Michelin Primacy 4»
 * daba 8 «exactas» porque el «4» casaba con el código de un Winrun; «Goodyear
 * Wrangler AT 265/70R17» daba la Winrun Maxclaw. Con la foto real del catálogo.
 *
 * Reglas: una marca nombrada NUNCA se descarta (si no está en el catálogo, la
 * respuesta es la de siempre: nada); el ancla de la relajación es un CÓDIGO DE
 * MODELO (palabra entera de 3+ con letras y dígitos), nunca un número, una letra
 * o un tipo (at, ht, mt, 4x4, 16); y el resultado deja rastro de lo ignorado.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buscarConEscalera, normalizeContificoProduct, searchCatalog, type CatalogItem } from "../src/domain/catalog.js";

const FOTO = resolve(__dirname, "../scripts/sim/datos/catalogo.json");

function fila(codigo: string, nombre: string, marca: string, stock = 4) {
  return normalizeContificoProduct(
    {
      id: codigo, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "PRO",
      pvp1: "70.000000", porcentaje_iva: 15, cantidad_stock: String(stock), imagen: null,
    },
    "pvp1",
  ) as CatalogItem;
}

/** Fixture con el mismo defecto que el catálogo real: el código trae medida y diseño adentro. */
const FIXTURE: CatalogItem[] = [
  fila("1856014WNR380", "185/60R14 82H R380 WINRUN", "WINRUN"),
  fila("1756013KDKR20", "175/60R13 77H KR20 KENDA", "KENDA"),
  fila("1656513WNR380", "165/65R13 77T R380 WINRUN", "WINRUN"),
  fila("2657017WNMAXCLAWAT", "265/70R17 115T MAXCLAW A/T WINRUN", "WINRUN"),
  fila("2657017FKWILDPEAKAT4W", "265/70R17 115T WILDPEAK A/T4W FALKEN", "FALKEN"),
  fila("32512006", "KENDA LT215/75R15 6PR 100/97Q - KR601 TL (CARGA)", "KENDA"),
  fila("35272004", "KENDA LT265/65R17 10PR 120/117Q - KR601 TL (CARGA)", "KENDA"),
  fila("352165", "205/55R16 91V ZE310R FALKEN", "FALKEN"),
  fila("329015", "225/70R16 103H CT60 A/S FALKEN ZIEX", "FALKEN"),
  fila("358430", "KENDA 265/65R17 112T KR628 SUV", "KENDA"),
];

const VACIAS_FIXTURE = [
  "Michelin Primacy 4", "Goodyear Wrangler AT 265/70R17", "llantas Michelin rin 16",
  "General Grabber AT3", "Toyo Open Country AT3", "Michelin Pilot Sport 4", "Maxxis AT 771",
  "Kumho AT 51", "Hankook AT 265/70R17", "BF Goodrich All Terrain T/A KO2",
  "Continental CrossContact LX20", "Nankang AT5", "Michelin A/T", "Michelin KR601",
  "Michelin 205/55R16", "Bridgestone Dueler 265/65R17", "Kenda Klever AT2",
  "Falken Wildpeak AT3 265/70R17", "Klever", "KR601 Klever MT", "KR610", "Kenda KR610", "Falken KR601",
];

describe("fixture: una marca o un tipo no son un ancla", () => {
  it.each(VACIAS_FIXTURE)("«%s» no devuelve otra llanta como exacta", (consulta) => {
    const r = buscarConEscalera(FIXTURE, consulta);
    expect(r.resultados, consulta).toEqual([]);
    expect(r.sinCoincidenciaExacta, consulta).toBe(true);
  });

  it("«Kenda Klever KR601» y «Klever KR601» siguen dando las KR601, con rastro", () => {
    for (const q of ["Kenda Klever KR601", "Klever KR601"]) {
      const r = buscarConEscalera(FIXTURE, q);
      expect(r.sinCoincidenciaExacta, q).toBe(false);
      expect(r.resultados.map((i) => i.code).sort(), q).toEqual(["32512006", "35272004"]);
      expect(r.palabrasIgnoradas, q).toEqual(["klever"]);
    }
  });

  it("«Klever KR601 265/65/17» → la 265/65R17, con rastro", () => {
    const r = buscarConEscalera(FIXTURE, "Klever KR601 265/65/17");
    expect(r.resultados.map((i) => i.code)).toEqual(["35272004"]);
    expect(r.palabrasIgnoradas).toEqual(["klever"]);
  });

  it("lo que encuentra a la primera no ignora nada", () => {
    const r = buscarConEscalera(FIXTURE, "Precio de la KR601 en 235/75R15");
    expect(r.palabrasIgnoradas).toEqual([]);
    expect(buscarConEscalera(FIXTURE, "Kenda KR601").palabrasIgnoradas).toEqual([]);
    expect(searchCatalog(FIXTURE, "Falken Zziex")).toEqual([]);
  });

  it("la misma regla en la resolución de la llanta a cotizar", () => {
    expect(searchCatalog(FIXTURE, "Goodyear Wrangler AT")).toEqual([]);
    expect(searchCatalog(FIXTURE, "Michelin Primacy 4")).toEqual([]);
  });
});

describe("Mundillantas (Kenda, Falken, Winrun, Maxxis): una marca ajena tampoco se relaja", () => {
  const FENIX: CatalogItem[] = [
    fila("MC-1", "KENDA 265/65R17 KR601 LT", "KENDA"),
    fila("MC-2", "FALKEN 235/75R15 WILDPEAK A/T3W", "FALKEN"),
    fila("MC-3", "WINRUN 205/55R16 R330", "WINRUN"),
    fila("MC-4", "MAXXIS 265/70R17 AT-771 BRAVO", "MAXXIS"),
    fila("MC-5", "KENDA 195/65R15 KR20", "KENDA"),
  ];
  it.each(["Michelin Primacy 4", "Goodyear Wrangler AT 265/70R17", "Michelin KR601", "Pirelli Scorpion AT"])(
    "«%s» → nada", (q) => {
      expect(buscarConEscalera(FENIX, q).resultados).toEqual([]);
      expect(buscarConEscalera(FENIX, q).sinCoincidenciaExacta).toBe(true);
    });
  it("pero su propia marca con un nombre comercial sí", () => {
    expect(buscarConEscalera(FENIX, "Kenda Klever KR601").resultados.map((i) => i.code)).toEqual(["MC-1"]);
  });
});

describe.skipIf(!existsSync(FOTO))("foto real del catálogo (scripts/sim/datos/catalogo.json, no se versiona)", () => {
  const real: CatalogItem[] = existsSync(FOTO)
    ? (JSON.parse(readFileSync(FOTO, "utf8")) as Record<string, unknown>[])
        .map((r) => normalizeContificoProduct(r as never, "pvp1"))
        .filter((i): i is CatalogItem => Boolean(i))
    : [];

  it.each(VACIAS_FIXTURE)("«%s» → vacío / sin coincidencia exacta", (consulta) => {
    const r = buscarConEscalera(real, consulta);
    expect(r.resultados.map((i) => `${i.brand} ${i.design} ${i.sizeLabel}`), consulta).toEqual([]);
    expect(r.sinCoincidenciaExacta, consulta).toBe(true);
  });

  it("«Kenda Klever KR601» → las KR601; «Klever KR601 265/65/17» → la 265/65R17; «Precio de la KR601 en 235/75R15» → la correcta", () => {
    const a = buscarConEscalera(real, "Kenda Klever KR601");
    expect(a.resultados.length).toBeGreaterThan(0);
    expect(a.resultados.every((i) => /KR601/.test(i.name))).toBe(true);
    expect(a.palabrasIgnoradas).toEqual(["klever"]);
    const b = buscarConEscalera(real, "Klever KR601 265/65/17");
    expect(b.resultados.map((i) => i.sizeLabel)).toEqual(["265/65R17"]);
    const c = buscarConEscalera(real, "Precio de la KR601 en 235/75R15");
    expect(c.resultados.map((i) => i.sizeLabel)).toEqual(["235/75R15"]);
  });

  it("«Goodyear Wrangler AT 265/70R17»: lo que sí hay en la medida sale como alternativa, no como exacta", () => {
    const r = buscarConEscalera(real, "Goodyear Wrangler AT 265/70R17");
    expect(r.sinCoincidenciaExacta).toBe(true);
    expect(r.enEsaMedida.length).toBeGreaterThan(0);
  });
});

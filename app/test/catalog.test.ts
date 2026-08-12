import { describe, expect, it } from "vitest";
import {
  extractCatalogSizeLabel,
  inferCatalogDesign,
  normalizeContificoProduct,
  resolveCatalogCandidates,
  searchCatalog,
  type CatalogItem,
} from "../src/domain/catalog.js";
import { extractLoadSpeed } from "../src/domain/tireSpecs.js";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    codigo: "352165",
    nombre: "205/55R16 91V ZE310R FALKEN",
    marca_nombre: "FALKEN",
    estado: "A",
    tipo: "PRO",
    pvp1: "72.620000",
    porcentaje_iva: 15,
    cantidad_stock: "22",
    imagen: null,
    ...overrides,
  };
}

describe("normalizeContificoProduct", () => {
  it("normaliza medida, precios Interbot y stock", () => {
    const item = normalizeContificoProduct(product(), "pvp1");
    expect(item).not.toBeNull();
    expect(item?.sizeLabel).toBe("205/55R16");
    expect(item?.availability).toBe("available");
    expect(item?.distributorPriceWithTax).toBe(83.51);
    expect(item?.minimumPriceWithTax).toBe(111.35);
    expect(item?.customerPriceWithTax).toBe(148.46);
    expect(item?.loadSpeed).toMatchObject({
      code: "91V",
      loadKg: 615,
      speedKmh: 240,
    });
    expect(item?.imageUrl).toBe("/assets/catalog/falken-ze310r.jpg");
  });

  it("descarta servicios, inactivos y productos sin precio", () => {
    expect(normalizeContificoProduct(product({ tipo: "SER" }), "pvp1")).toBeNull();
    expect(normalizeContificoProduct(product({ estado: "I" }), "pvp1")).toBeNull();
    expect(
      normalizeContificoProduct(
        product({ pvp1: null, pvp2: null, pvp3: null, pvp4: null }),
        "pvp1",
      ),
    ).toBeNull();
  });

  it("usa otro PVP positivo si el configurado está vacío", () => {
    const item = normalizeContificoProduct(product({ pvp1: null, pvp2: "80" }), "pvp1");
    expect(item?.sourcePrice).toBe(80);
    expect(item?.priceTier).toBe("pvp2");
  });
});

describe("inferCatalogDesign", () => {
  it.each([
    ["205/55R16 91V - KR20 TL", "KENDA", "205/55R16", "KR20"],
    ["LT265/65R17 120/117R KR608 10PR TL KENDA", "KENDA", "265/65R17", "KR608"],
    ["225/45ZR18 AZENIS FK520L 95Y XL FALKEN", "FALKEN", "225/45R18", "AZENIS FK520L"],
    ["LT275/70R18 125/122R WILDPEAK R/T01 FALKEN", "FALKEN", "275/70R18", "WILDPEAK R/T01"],
    ["35X11.50R20LT 120R WPRT01 FALKEN", "FALKEN", "35X11.50R20", "WILDPEAK R/T01"],
    ["LT265/70R17 121/118Q WILDPEAK M/T FALKEN", "FALKEN", "265/70R17", "WILDPEAK M/T"],
    ["235/70R16 106T MAXCLAW A/T", "WINRUN", "235/70R16", "MAXCLAW A/T"],
    ["205/60R16 92H R330-e WINRUN", "WINRUN", "205/60R16", "R330-E"],
  ])("normaliza %s", (name, brand, size, expected) => {
    expect(inferCatalogDesign(name, brand, size)).toBe(expected);
  });
});

describe("extractLoadSpeed", () => {
  it("tolera índices juntos o separados", () => {
    expect(extractLoadSpeed("205/55R16 91V KR20")).toMatchObject({
      code: "91V",
      loadKg: 615,
      speedKmh: 240,
    });
    expect(extractLoadSpeed("265/70R17 121 Q XL")).toMatchObject({
      code: "121Q",
      loadKg: 1450,
      speedKmh: 160,
    });
  });
});

describe("extractCatalogSizeLabel", () => {
  // Las de flotación se canonizan sin ceros de más: el catálogo trae la MISMA
  // llanta como "30X9.5R15LT" y "30X9.50R15LT", y sin esto quedaban como dos
  // medidas distintas — el bot decía "no hay" con 20 unidades en bodega.
  it("reconoce medidas métricas y canoniza las de flotación", () => {
    expect(extractCatalogSizeLabel("205/55 R16 ZE310").sizeLabel).toBe("205/55R16");
    expect(extractCatalogSizeLabel("31X10.50R15 AT").sizeLabel).toBe("31X10.5R15");
    expect(extractCatalogSizeLabel("35x12,50R17 MT").sizeLabel).toBe("35X12.5R17");
    expect(extractCatalogSizeLabel("31X10.5R15 AT").sizeLabel).toBe(
      extractCatalogSizeLabel("31X10.50R15 AT").sizeLabel,
    );
  });
});

describe("searchCatalog", () => {
  const items = [
    normalizeContificoProduct(product(), "pvp1"),
    normalizeContificoProduct(
      product({
        id: "prod-2",
        codigo: "K642B636",
        nombre: "205/55R16 91V KR203 KENDA",
        marca_nombre: "KENDA",
        pvp1: "55.51",
        cantidad_stock: "18",
      }),
      "pvp1",
    ),
    normalizeContificoProduct(
      product({
        id: "prod-3",
        codigo: "2055516WNR330",
        nombre: "205/55R16 91V R330 WINRUN",
        marca_nombre: "WINRUN",
        pvp1: "41.68",
        cantidad_stock: "0",
      }),
      "pvp1",
    ),
  ].filter((item): item is CatalogItem => item !== null);

  it("prioriza código, medida + marca y referencia", () => {
    expect(searchCatalog(items, "K642B636")[0]?.code).toBe("K642B636");
    expect(searchCatalog(items, "205/55R16 Kenda")[0]?.brand).toBe("KENDA");
    expect(searchCatalog(items, "KR203")[0]?.design).toContain("KR203");
  });

  it("ordena disponible antes que agotada", () => {
    const results = searchCatalog(items, "205/55R16");
    expect(results.at(-1)?.availability).toBe("out");
  });
});

/**
 * El fallo que reportó Joaquín el 12-ago: «con este man se vuelve a trabar
 * cuando le ponen 265/70R17 falken wildpeak — les contesta que no tiene».
 *
 * La causa no era la búsqueda sino la resolución: exigía coincidencia ÚNICA, y
 * un modelo que Depot surte en varias medidas jamás coincide con una sola fila.
 * El agente recibía «no existe en el catálogo», se lo decía al cliente, volvía
 * a buscar, encontraba lo mismo y volvía a fallar.
 */
describe("resolveCatalogCandidates", () => {
  const catalogo = (
    [
      ["c1", "LT265/70R17 121/118Q WILDPEAK M/T FALKEN", "FALKEN", 12],
      ["c2", "LT285/70R17 121/118Q WILDPEAK M/T FALKEN", "FALKEN", 6],
      ["c3", "LT265/65R18 121/118Q WILDPEAK M/T FALKEN", "FALKEN", 4],
      ["c4", "LT265/70R17 121/118S WILDPEAK A/T3W FALKEN", "FALKEN", 8],
      ["c5", "265/70R17 115T MAXCLAW H/T WINRUN", "WINRUN", 20],
      ["c6", "265/70R17 121Q KR600 KENDA", "KENDA", 0],
    ] as const
  )
    .map(([codigo, nombre, marca, stock], i) =>
      normalizeContificoProduct(
        product({ id: `id-${i}`, codigo, nombre, marca_nombre: marca, cantidad_stock: String(stock) }),
        "pvp1",
      ),
    )
    .filter((item): item is CatalogItem => Boolean(item));

  const codigos = (reference: string, size?: string | null) =>
    resolveCatalogCandidates(catalogo, reference, size).map((item) => item.code);

  it("el código de Contífico resuelve solo, con medida o sin ella", () => {
    expect(codigos("c1")).toEqual(["c1"]);
    expect(codigos("c1", "265/70R17")).toEqual(["c1"]);
  });

  it("la medida de la conversación desempata el modelo repetido", () => {
    // Este es EL caso: sin medida, «Wildpeak M/T» son las tres que Depot surte
    // y antes eso se traducía en «no existe». Con la medida, es una.
    expect(codigos("WILDPEAK M/T")).toHaveLength(3);
    expect(codigos("WILDPEAK M/T", "265/70R17")).toEqual(["c1"]);
    expect(codigos("FALKEN WILDPEAK M/T", "265/70R17")).toEqual(["c1"]);
    expect(codigos("WILDPEAK M/T", "285/70R17")).toEqual(["c2"]);
  });

  it("dos versiones en la misma medida quedan como pregunta, no como negativa", () => {
    // En 265/70R17 hay M/T y A/T3W: el bot tiene que preguntar cuál, y quien
    // llama distingue esto de «no hay» justamente porque la lista no va vacía.
    expect(codigos("wildpeak", "265/70R17").sort()).toEqual(["c1", "c4"]);
    expect(codigos("265/70R17 falken wildpeak", "265/70R17").sort()).toEqual(["c1", "c4"]);
  });

  it("lo que de verdad no está sigue devolviendo vacío", () => {
    // «No existe» tiene que seguir siendo posible, o el arreglo sería mentir al revés.
    expect(codigos("pirelli scorpion", "265/70R17")).toEqual([]);
    expect(codigos("   ")).toEqual([]);
  });

  it("la agotada resuelve igual: «no existe» y «se acabó» no son lo mismo", () => {
    // La KR600 está en cero y aun así tiene que resolver, para que quien llama
    // pueda decir «esa se agotó, mire esta otra». Devolver vacío la convertiría
    // otra vez en el «no existe en el catálogo» que mataba la venta.
    expect(codigos("265/70R17 kenda", "265/70R17")).toEqual(["c6"]);
    expect(codigos("MAXCLAW H/T", "265/70R17")).toEqual(["c5"]);
  });

  it("entre varias empatadas se queda la que se puede vender", () => {
    // Dos versiones del mismo modelo en la misma medida, pero solo una con
    // stock: ahí no hay nada que preguntarle al cliente.
    const conAgotada = catalogo.map((item) =>
      item.code === "c4" ? { ...item, stock: 0, availability: "out" as const } : item);
    expect(resolveCatalogCandidates(conAgotada, "wildpeak", "265/70R17").map((i) => i.code))
      .toEqual(["c1"]);
  });

  it("una medida que no existe no borra los candidatos", () => {
    // Si la conversación quedó con una medida vieja, filtrar por ella dejaría
    // la lista en cero y el bot volvería a decir «no existe».
    expect(codigos("WILDPEAK M/T", "195/60R15")).toHaveLength(3);
  });
});

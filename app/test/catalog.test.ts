import { describe, expect, it } from "vitest";
import {
  extractCatalogSizeLabel,
  inferCatalogDesign,
  normalizeContificoProduct,
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
  it("reconoce medidas métricas y de flotación", () => {
    expect(extractCatalogSizeLabel("205/55 R16 ZE310").sizeLabel).toBe("205/55R16");
    expect(extractCatalogSizeLabel("31X10.50R15 AT").sizeLabel).toBe("31X10.50R15");
    expect(extractCatalogSizeLabel("35x12,50R17 MT").sizeLabel).toBe("35X12.50R17");
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

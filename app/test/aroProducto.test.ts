/**
 * Aros como producto (R-24): la lista aparte, el detector y la búsqueda.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  arosDelCatalogo,
  buscarAros,
  cargarArosDelCatalogo,
  pideAroComoProducto,
  type AroProducto,
} from "../src/domain/aroProducto.js";

const aro = (over: Partial<AroProducto> = {}): AroProducto => ({
  id: "AR-15-4100",
  codigo: "AR-15-4100",
  nombre: "Aro de aluminio 15 4x100",
  marca: "GENERICO",
  diametro: 15,
  pernos: 4,
  precio: 95,
  stock: 8,
  imageUrl: null,
  ...over,
});

afterEach(() => cargarArosDelCatalogo([]));

describe("pideAroComoProducto", () => {
  it.each([
    "tienen aros de 15?",
    "rines de 4 pernos",
    "aros de lujo",
    "venden rines?",
    "busco aros cromados",
    "precio de aros aro 17", // pregunta de compra, sin llanta ni medida
  ])("es verdad para «%s»", (texto) => {
    expect(pideAroComoProducto(texto)).toBe(true);
  });

  it.each([
    "llantas rin 15", // llanta: la ruta de siempre
    "235 rin 15", // ancho + aro: medida de llanta
    "aro 15", // el dato de la medida, no el producto
    "rin 16", // ídem
    "una 205/55R16", // medida completa
    "quiero 4 llantas para rin 17",
    "neumaticos aro 14",
  ])("es falso para «%s»", (texto) => {
    expect(pideAroComoProducto(texto)).toBe(false);
  });
});

describe("arosDelCatalogo / buscarAros", () => {
  it("arranca vacía: Depot no vende aros", () => {
    expect(arosDelCatalogo()).toEqual([]);
  });

  it("filtra por diámetro y pernos, solo con stock, hasta 5", () => {
    cargarArosDelCatalogo([
      aro({ codigo: "A1", diametro: 15, pernos: 4 }),
      aro({ codigo: "A2", diametro: 15, pernos: 5 }),
      aro({ codigo: "A3", diametro: 17, pernos: 4 }),
      aro({ codigo: "A4", diametro: 15, pernos: 4, stock: 0 }),
      ...Array.from({ length: 7 }, (_, i) => aro({ codigo: `B${i}`, diametro: 15, pernos: 4 })),
    ]);
    const lista = arosDelCatalogo();
    expect(buscarAros(lista, { diametro: 15, pernos: 4 })).toHaveLength(5);
    expect(buscarAros(lista, { diametro: 17 }).map((a) => a.codigo)).toEqual(["A3"]);
    expect(buscarAros(lista, { diametro: 15, pernos: 4 }).map((a) => a.codigo)).not.toContain("A4");
  });

  it("busca por texto sin tildes", () => {
    cargarArosDelCatalogo([aro({ codigo: "LUX", nombre: "Aro de lujo 16", diametro: 16 })]);
    expect(buscarAros(arosDelCatalogo(), { texto: "lujó" }).map((a) => a.codigo)).toEqual(["LUX"]);
  });
});

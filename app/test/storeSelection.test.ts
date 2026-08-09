import { describe, expect, it } from "vitest";
import { extractExplicitStore } from "../src/domain/storeSelection.js";

describe("selección explícita de local", () => {
  it.each([
    ["voy al de Cumbaya", "Depot Tire Cumbayá"],
    ["me queda bien la sucursal Quito Sur", "Depot Tire Quito Sur"],
    ["el local del sur", "Depot Tire Quito Sur"],
  ])("%s", (text, expected) => {
    expect(extractExplicitStore(text)).toBe(expected);
  });

  it("no interpreta un sur geográfico suelto como elección de tienda", () => {
    expect(extractExplicitStore("vivo al sur de quito")).toBeNull();
  });

  it("no elige si el cliente menciona las dos para preguntar", () => {
    expect(extractExplicitStore("¿Cumbayá o Quito Sur?")).toBeNull();
  });
});

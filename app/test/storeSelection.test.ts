import { describe, expect, it } from "vitest";
import { extractExplicitStore, preguntamosElLocal } from "../src/domain/storeSelection.js";

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

describe("«al sur» respondiendo a la pregunta del local (caso 13-ago, conv 5165)", () => {
  const pregunta =
    "¿Qué día puede pasar y a cuál local? ¿Depot Tire Cumbayá o Depot Tire Quito Sur? Con esos dos datos le aviso al asesor. 📅";

  it("reconoce la pregunta del local en nuestro último mensaje", () => {
    expect(preguntamosElLocal(pregunta)).toBe(true);
    expect(preguntamosElLocal("¿Qué día puede pasar?")).toBe(false);
    expect(preguntamosElLocal(null)).toBe(false);
  });

  it.each([
    "Al sur me resulta más fácil",
    "el sur",
    "mejor por el sur",
  ])("«%s» tras la pregunta = Quito Sur", (text) => {
    expect(extractExplicitStore(text, { respondiendoAlLocal: true })).toBe("Depot Tire Quito Sur");
  });

  it("sin la pregunta previa, «al sur» sigue sin ser elección", () => {
    expect(extractExplicitStore("Al sur me resulta más fácil")).toBeNull();
  });

  it("con la pregunta previa, mencionar ambas sigue sin elegir", () => {
    expect(extractExplicitStore("¿cumbaya o el sur?", { respondiendoAlLocal: true })).toBeNull();
  });
});

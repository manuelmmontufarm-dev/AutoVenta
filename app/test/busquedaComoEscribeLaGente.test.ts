/**
 * La búsqueda entiende cómo ESCRIBE la gente, no cómo se cataloga una llanta.
 *
 * Caso real (conv 3, 12 y 14-ago-2026): «tienen falken wildpeak at4 265/70R17»
 * devolvía vacío teniendo la WILDPEAK A/T4W 265/70R17 en stock (código 356531),
 * y el bot juraba que no existía. Dos agujeros: «at4» no aparecía contiguo en
 * el texto normalizado con espacios («a t4w»), y «tienen» era un token
 * obligatorio que ningún producto contiene.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";

const { normalizeContificoProduct, searchCatalog } = await import("../src/domain/catalog.js");

const mk = (codigo: string, nombre: string, marca: string) => {
  const item = normalizeContificoProduct({
    id: codigo, codigo, nombre, marca_nombre: marca, estado: "A", tipo: "P",
    pvp1: 296.55, pvp2: 395.39, porcentaje_iva: 15, cantidad_stock: 8,
  }, "pvp1");
  if (!item) throw new Error(`No se construyó ${codigo}`);
  return item;
};

const CATALOGO = [
  mk("356531", "LT265/70R17 123S WILDPEAK A/T4W", "FALKEN"),
  mk("356398", "265/65R17 112S WILDPEAK A/T4W", "FALKEN"),
  mk("318931", "LT265/70R17 121/118Q WILDPEAK M/T", "FALKEN"),
  mk("339052", "235/65R17 WILDPEAK AT3W", "FALKEN"),
  mk("K642B636", "205/55R16 91V KR203", "KENDA"),
  mk("352856", "33X12.50R17 WILDPEAK R/T01", "FALKEN"),
];

const disenos = (q: string) => searchCatalog(CATALOGO, q).map((i) => i.design);

describe("el caso Wildpeak A/T4W", () => {
  it.each([
    "falken wildpeak at4 265/70R17",
    "tienen falken wildpeak at4 265/70R17",
    "wildpeak at4",
    "busco la falken wildpeak a/t 4w",
  ])("«%s» encuentra la A/T4W", (q) => {
    expect(disenos(q)[0]).toBe("WILDPEAK A/T 4W");
  });

  it("«at4» no se confunde con la AT3W", () => {
    expect(disenos("wildpeak at4")).not.toContain("WILDPEAK AT3W");
    expect(disenos("wildpeak at3")[0]).toBe("WILDPEAK AT3W");
  });

  it("el relleno solo no encuentra nada (no hay con qué buscar)", () => {
    expect(disenos("tienen llantas")).toEqual([]);
  });

  it("el relleno no rompe otras búsquedas normales", () => {
    expect(disenos("precio de la kr203")[0]).toBe("KR203");
    expect(disenos("falken wildpeak mt 265/70r17")[0]).toBe("WILDPEAK M/T");
  });
});

describe("la medida se decodifica PRIMERO y manda como filtro", () => {
  const medidas = (q: string) => searchCatalog(CATALOGO, q).map((i) => i.sizeLabel);

  it("con la medida en la consulta, JAMÁS sale una llanta de otra medida", () => {
    for (const q of [
      "wildpeak at4 265/70r17",
      "wildpeak at4 265/70/17",
      "falken wildpeak at4 265/70 Rin17",
    ]) {
      const r = searchCatalog(CATALOGO, q);
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((i) => i.sizeLabel === "265/70R17")).toBe(true);
      expect(r[0].design).toBe("WILDPEAK A/T 4W");
    }
  });

  it("la misma consulta con el otro aro trae la otra A/T4W, no la del 70", () => {
    const r = searchCatalog(CATALOGO, "wildpeak at4 265/65r17");
    expect(r[0].sizeLabel).toBe("265/65R17");
    expect(r.every((i) => i.sizeLabel === "265/65R17")).toBe(true);
  });

  it("la medida sola lista todo lo que existe en ella", () => {
    expect(new Set(medidas("265/70R17"))).toEqual(new Set(["265/70R17"]));
    expect(medidas("265/70/17")).toHaveLength(2);
  });

  it("medida sin stock en catálogo: cae a lo ancho para poder ofrecer el modelo en otras medidas", () => {
    const r = searchCatalog(CATALOGO, "wildpeak at4 215/65r16");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].design).toBe("WILDPEAK A/T 4W");
  });

  it("las de flotación también se decodifican («33x12.50r17» en minúscula)", () => {
    const r = searchCatalog(CATALOGO, "wildpeak 33x12.50r17");
    expect(r).toHaveLength(1);
    expect(r[0].design).toBe("WILDPEAK R/T01");
  });
});

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
  mk("318931", "LT265/70R17 121/118Q WILDPEAK M/T", "FALKEN"),
  mk("339052", "235/65R17 WILDPEAK AT3W", "FALKEN"),
  mk("K642B636", "205/55R16 91V KR203", "KENDA"),
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

/**
 * TRES OPCIONES CON MARCAS QUE LA ESCALERA NO CONOCE (Sprint 4, R-17).
 *
 * Mundillantas vende ~10 marcas que `escalera-precio.json` no tiene. Sin el
 * escalón por precio, todas caían en el mismo cajón de `escalonDeMarca` y la
 * vitrina salía con UNA opción, o con tres «equilibrio». Con
 * `politica.escalonPorPrecio = true` el escalón sale del precio dentro del
 * conjunto: nunca dos iguales, y tres opciones cuando hay tres precios.
 *
 * Depot tiene la bandera apagada: sus escalones siguen saliendo de la
 * escalera de marcas (eso lo fija `test/politica.test.ts`).
 */
import { describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

type P = { code: string; brand: string; design: string; minimumPriceWithTax: number; availability: string; stock: number };
const llanta = (code: string, brand: string, precio: number, extra: Partial<P> = {}): P => ({
  code, brand, design: `${brand} X1`, minimumPriceWithTax: precio, availability: "available", stock: 20, ...extra,
});

async function cargar(escalonPorPrecio: boolean) {
  vi.resetModules();
  vi.doMock("../src/negocio/politica.js", async (original) => {
    const real = await original<typeof import("../src/negocio/politica.js")>();
    return { ...real, politica: { ...real.politica, escalonPorPrecio } };
  });
  const { escaleraParaPruebas } = await import("../src/agent/tools.js");
  vi.doUnmock("../src/negocio/politica.js");
  return escaleraParaPruebas;
}

// Marcas que la escalera de Depot no conoce: con escalón por marca todas son «fuera de la lista».
const MULTIMARCA = [
  llanta("A1", "LINGLONG", 95),
  llanta("A2", "TRIANGLE", 88),
  llanta("A3", "MICHELIN", 210),
  llanta("A4", "BFGOODRICH", 180),
  llanta("A5", "GOODYEAR", 140),
  llanta("A6", "SAILUN", 92),
];

describe("escalonesPorPrecio (puro)", () => {
  it("tercil alto = premium (0), medio = equilibrio (1), bajo = económica (2)", async () => {
    const { escalonesPorPrecio } = await cargar(true);
    const mapa = escalonesPorPrecio(MULTIMARCA);
    const de = (code: string) => mapa.get(MULTIMARCA.find((p) => p.code === code)!);
    expect(de("A3")).toBe(0); // 210
    expect(de("A4")).toBe(0); // 180
    expect(de("A5")).toBe(1); // 140
    expect(de("A1")).toBe(1); // 95
    expect(de("A6")).toBe(2); // 92
    expect(de("A2")).toBe(2); // 88
  });

  it("dos precios distintos: premium y económica, nunca dos iguales", async () => {
    const { escalonesPorPrecio } = await cargar(true);
    const dos = [llanta("B1", "X", 100), llanta("B2", "Y", 80)];
    expect([...escalonesPorPrecio(dos).values()]).toEqual([0, 2]);
  });

  it("un solo precio: equilibrio", async () => {
    const { escalonesPorPrecio } = await cargar(true);
    expect([...escalonesPorPrecio([llanta("C1", "X", 100), llanta("C2", "Y", 100)]).values()]).toEqual([1, 1]);
  });
});

describe("tresOpciones con escalón por precio", () => {
  it("con tres precios distintos salen TRES opciones, una por escalón, de cara a barata", async () => {
    const { tresOpciones, escalonDe } = await cargar(true);
    const opciones = tresOpciones(MULTIMARCA);
    expect(opciones).toHaveLength(3);
    expect(new Set(opciones.map(escalonDe)).size).toBe(3);
    // Dentro de cada escalón gana la más barata disponible (la regla de siempre).
    expect(opciones.map((p) => p.code)).toEqual(["A4", "A1", "A2"]);
  });

  it("nunca repite escalón con ningún conjunto de 3+ precios distintos", async () => {
    const { tresOpciones, escalonDe } = await cargar(true);
    for (let n = 3; n <= 12; n++) {
      const conjunto = Array.from({ length: n }, (_, i) => llanta(`Z${i}`, `MARCA${i}`, 50 + i * 7));
      const opciones = tresOpciones(conjunto);
      expect(opciones, `n=${n}`).toHaveLength(3);
      expect(new Set(opciones.map(escalonDe)).size, `n=${n}`).toBe(3);
    }
  });

  it("el escalón que ve el modelo sale del conjunto mostrado", async () => {
    const { recorteConEscalera, escalonVisible } = await cargar(true);
    recorteConEscalera(MULTIMARCA, 8);
    expect(escalonVisible("A3")).toBe("premium");
    expect(escalonVisible("A5")).toBe("equilibrio");
    expect(escalonVisible("A2")).toBe("economica");
  });

  it("escaleraPorUso con relleno de otro tipo no repite escalón entre compatibles y relleno", async () => {
    const { escaleraPorUso, escalonDe } = await cargar(true);
    const { opciones } = escaleraPorUso(MULTIMARCA, null);
    expect(opciones).toHaveLength(3);
    expect(new Set(opciones.map(escalonDe)).size).toBe(3);
  });
});

describe("con la bandera apagada (Depot) nada cambia", () => {
  it("marcas que la escalera no conoce siguen cayendo en un solo cajón, como hoy", async () => {
    const { tresOpciones } = await cargar(false);
    expect(tresOpciones(MULTIMARCA)).toHaveLength(1);
  });

  it("las marcas de Depot salen por su escalera: Falken premium, Kenda intermedia, Winrun económica", async () => {
    const { tresOpciones, escalonVisible } = await cargar(false);
    const depot = [
      llanta("D1", "WINRUN", 70, { design: "R380" }),
      llanta("D2", "KENDA", 110, { design: "KR608" }),
      llanta("D3", "FALKEN", 160, { design: "ZE310" }),
    ];
    expect(tresOpciones(depot).map((p) => p.brand)).toEqual(["FALKEN", "KENDA", "WINRUN"]);
    expect(escalonVisible("D1")).toBeNull();
  });
});

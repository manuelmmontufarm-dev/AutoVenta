/**
 * BLACK FRIDAY EN LA PIEZA (5-nov-2026) — el PDF que recibe el cliente es esta
 * pieza, así que aquí se vigila que la promo de la 2.ª llanta se lea clara.
 *
 * - La cotización con `segundaLlanta`: franja «BLACK FRIDAY · TODO NOVIEMBRE»,
 *   los dos precios por llanta con su rótulo, la cuenta entera, la insignia del
 *   60 % y el ahorro sumado (catálogo + 2.ª llanta).
 * - Sin `segundaLlanta` la pieza sale byte a byte igual que antes.
 * - La vitrina: Falken y Kenda llevan el sello en noviembre; Winrun nunca, y en
 *   diciembre nadie.
 *
 * Las cuentas no se prueban aquí (son de `domain/promocionDeTemporada.ts`): la
 * pieza solo dibuja lo que le llega.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";
process.env.WHATSAPP_TOKEN ||= "x";
process.env.WHATSAPP_APP_SECRET ||= "x";
process.env.WHATSAPP_VERIFY_TOKEN ||= "x";
process.env.WHATSAPP_PHONE_ID ||= "x";
process.env.SELLER_PHONE ||= "x";
delete process.env.NEGOCIO;

const { quotePosterDiaNoche, optionsPosterDiaNoche } = await import("../src/render/diaNoche.js");
const { quotePoster, optionsPoster, comparePoster, rotulosDeSegundaLlanta } = await import("../src/render/depotPosters.js");
const { resolveTheme } = await import("../src/render/depotDesign.js");
const { renderCompareImage, renderOptionsImage, renderQuoteImage, toRenderLine } = await import("../src/render/quoteImage.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");
const { segundaLlantaDe } = await import("../src/domain/promocionDeTemporada.js");
const { politica } = await import("../src/negocio/politica.js");

const NOVIEMBRE = new Date("2026-11-05T12:00:00-05:00");
const DICIEMBRE = new Date("2026-12-02T12:00:00-05:00");
const PROMO = politica.promocionDeTemporada;

/** Todo el texto del árbol de nodos, para poder afirmar qué se ve. */
function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

const linea = (brand: string, quantity: number, unit: number, pvp: number | null, extra: Record<string, unknown> = {}) => ({
  brand, design: "AZENIS FK510", sizeLabel: "205/55R16",
  loadSpeedLabel: "91W", loadSpeedTranslation: "615 kg máx · 270 km/h máx",
  quantity, unitConIva: unit, pvpConIva: pvp,
  availability: "available" as const, golpesMeses: 18, fabricaAnios: 5,
  photoUri: "data:image/png;base64,iVBORw0KGgo=",
  ...extra,
});

/** Una línea con la promo hecha por el dominio, como la llena quien cotiza. */
const conPromo = (brand: string, n: number, unit: number, pvp: number | null) => {
  const segundaLlanta = segundaLlantaDe(PROMO, brand, n, unit, NOVIEMBRE);
  return linea(brand, n, unit, pvp, {
    segundaLlanta,
    temporada: { nombre: "Black Friday", bajada: "TODO NOVIEMBRE", hasta: "30 de noviembre" },
  });
};

describe("cómo se nombran las llantas de la promo", () => {
  it("cambia con la cantidad: 2, 3, 4, 5 y muchas", () => {
    expect(rotulosDeSegundaLlanta(2)).toEqual({ normales: "1.ª llanta", rebajadas: "2.ª llanta" });
    expect(rotulosDeSegundaLlanta(3)).toEqual({ normales: "1.ª y 3.ª llanta", rebajadas: "2.ª llanta" });
    expect(rotulosDeSegundaLlanta(4)).toEqual({ normales: "1.ª y 3.ª llanta", rebajadas: "2.ª y 4.ª llanta" });
    expect(rotulosDeSegundaLlanta(5)).toEqual({ normales: "1.ª, 3.ª y 5.ª llanta", rebajadas: "2.ª y 4.ª llanta" });
    expect(rotulosDeSegundaLlanta(8)).toEqual({ normales: "llantas impares", rebajadas: "llantas pares" });
  });
});

describe("la cotización con la 2.ª llanta", () => {
  const datos = (line: ReturnType<typeof linea>, total: number) => ({
    number: "COT-1", dateLabel: "05/11/2026", line, total, subtotal: total / 1.15, iva: total - total / 1.15,
  });

  for (const plantilla of ["diaNoche-dia", "diaNoche-noche", "clasica"] as const) {
    it(`${plantilla}: 4 Falken a $75 dicen los dos precios, la cuenta, el −60 % y el ahorro`, () => {
      const line = conPromo("FALKEN", 4, 75, 100);
      const nodo = plantilla === "clasica"
        ? quotePoster(datos(line, 210), resolveTheme())
        : quotePosterDiaNoche(datos(line, 210), plantilla === "diaNoche-dia" ? "dia" : "noche");
      const texto = textoDe(nodo);
      expect(texto).toContain("BLACK FRIDAY");
      expect(texto).toContain("· TODO NOVIEMBRE");
      expect(texto).toContain("Válido hasta el 30 de noviembre");
      expect(texto).toContain("1.ª Y 3.ª LLANTA");
      expect(texto).toContain("2.ª Y 4.ª LLANTA");
      expect(texto).toContain("$75.00");
      expect(texto).toContain("$30.00");
      expect(texto).toContain("2 × $75.00 + 2 × $30.00 = $210.00");
      expect(texto).toContain("EN TU 2.ª LLANTA");
      expect(texto).toContain("−60%");
      // El total es el que firma la cotización; el ahorro, catálogo ($25 × 4) + 2.ª llanta ($90).
      expect(texto).toContain("$210.00");
      expect(texto).toMatch(/Ahorra(s)? \$190\.00/);
      // La insignia de siempre ya no es la protagonista.
      expect(texto).not.toContain("−25%");
    });
  }

  it("3 llantas: una sola rebajada, y las cuotas salen del total de la promo", () => {
    const line = conPromo("KENDA", 3, 123.45, null);
    const total = line.segundaLlanta!.totalConIva;
    const texto = textoDe(quotePosterDiaNoche(datos(line, total), "noche"));
    expect(texto).toContain("1.ª Y 3.ª LLANTA");
    expect(texto).toContain("2.ª LLANTA");
    expect(texto).not.toContain("4.ª");
    expect(texto).toContain(`2 × $123.45 + 1 × $49.38 = $${total.toFixed(2)}`);
    expect(texto).toContain(`6 cuotas de $${(total / 6).toFixed(2)}`);
    // Sin precio de lista, no hay «ANTES» que tachar.
    expect(texto).not.toContain("ANTES");
  });

  it("2 llantas: «1.ª llanta» y «2.ª llanta»", () => {
    const texto = textoDe(quotePoster(datos(conPromo("FALKEN", 2, 75, null), 105), resolveTheme()));
    expect(texto).toContain("1.ª LLANTA");
    expect(texto).toContain("2.ª LLANTA");
    expect(texto).toContain("1 × $75.00 + 1 × $30.00 = $105.00");
  });

  it("sin la 2.ª llanta no aparece nada de Black Friday", () => {
    for (const nodo of [
      quotePosterDiaNoche(datos(linea("FALKEN", 1, 75, 100), 75), "dia"),
      quotePoster(datos(linea("WINRUN", 4, 48.3, 64.4), 193.2), resolveTheme()),
    ]) {
      const texto = textoDe(nodo);
      expect(texto).not.toContain("BLACK FRIDAY");
      expect(texto).not.toContain("2.ª");
      expect(texto).toContain("−25%");
    }
  });
});

describe("byte a byte: sin promo la pieza no cambia", () => {
  const producto = normalizeContificoProduct(
    { id: "AZENIS", codigo: "AZENIS", nombre: "205/55R16 91W AZENIS FK510", marca_nombre: "FALKEN", estado: "A", tipo: "P", pvp1: 84.2, porcentaje_iva: 15, cantidad_stock: 3 },
    "pvp1",
  )!;

  it("una línea con segundaLlanta null sale igual que una sin la clave (las tres plantillas)", async () => {
    const sin = await toRenderLine(producto, 4);
    const nula = { ...sin, segundaLlanta: null };
    const base = { number: "COT-BASE", dateLabel: "04 / 11 / 2026", subtotal: 292.87, iva: 43.93, total: 336.8 };
    for (const tema of [{}, { plantilla: "diaNoche", modo: "dia" }, { plantilla: "diaNoche", modo: "noche" }]) {
      const a = await renderQuoteImage({ ...base, ...tema, lines: [sin] });
      const b = await renderQuoteImage({ ...base, ...tema, lines: [nula] });
      expect(a.equals(b)).toBe(true);
    }
  }, 30_000);
});

describe("la vitrina: el sello de la 2.ª llanta", () => {
  const prod = (codigo: string, marca: string, pvp1: number) => normalizeContificoProduct(
    { id: codigo, codigo, nombre: `205/55R16 91V ${codigo}`, marca_nombre: marca, estado: "A", tipo: "P", pvp1, porcentaje_iva: 15, cantidad_stock: 9 },
    "pvp1",
  )!;

  it("Falken y Kenda lo llevan en noviembre; Winrun no; en diciembre nadie", async () => {
    const [falken, kenda, winrun] = await Promise.all(
      [prod("AZENIS", "FALKEN", 84.2), prod("KR203", "KENDA", 55.5), prod("R380", "WINRUN", 43)].map((p) => toRenderLine(p)),
    );
    const opciones = { dateLabel: "05/11/2026", sizeLabel: "205/55R16", cantidad: 4 };
    for (const tema of [{}, { plantilla: "diaNoche", modo: "noche" }]) {
      const conMarcas = async (products: typeof falken[], ahora: Date) =>
        renderOptionsImage({ ...opciones, ...tema, products, ahora });
      // Falken/Kenda: noviembre y diciembre salen distintas (el sello).
      expect((await conMarcas([falken, kenda], NOVIEMBRE)).equals(await conMarcas([falken, kenda], DICIEMBRE))).toBe(false);
      // Winrun sola: idéntica en noviembre y en diciembre.
      expect((await conMarcas([winrun], NOVIEMBRE)).equals(await conMarcas([winrun], DICIEMBRE))).toBe(true);
    }
    const comparar = (ahora: Date) => renderCompareImage({ dateLabel: "05/11/2026", products: [falken, kenda, winrun], ahora });
    expect((await comparar(NOVIEMBRE)).equals(await comparar(DICIEMBRE))).toBe(false);
  }, 60_000);

  it("el sello dice «−60% · en tu 2.ª llanta · Black Friday» en las tres piezas", () => {
    const v = { vitrinaSegundaLlanta: { porcentaje: 60, nombre: "Black Friday" } };
    const lines = [linea("FALKEN", 4, 75, 100, v), linea("WINRUN", 4, 48.3, 64.4)];
    for (const nodo of [
      optionsPoster({ dateLabel: "x", lines }, resolveTheme()),
      comparePoster({ dateLabel: "x", lines }, resolveTheme()),
      optionsPosterDiaNoche({ dateLabel: "x", lines, cantidad: 4 }, "dia"),
    ]) {
      const texto = textoDe(nodo);
      expect(texto).toContain("−60%");
      // Una sola vez: Winrun no lo lleva.
      expect(texto.split("en tu 2.ª llanta · Black Friday")).toHaveLength(2);
    }
  });
});

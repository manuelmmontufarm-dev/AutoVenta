/**
 * UN NEGOCIO AJENO NO HABLA COMO DEPOT (R-01, R-06, R-07).
 *
 * Corre con `NEGOCIO=ejemplo` (la plantilla: un solo local, sin
 * `identidades`). Fija que la identidad, la firma, los detectores y el cupón
 * salgan del perfil que está vivo y no de Depot. Es la prueba que avisa si un
 * cambio vuelve a coser «Depot Tire» en el código.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "ejemplo";
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { negocio } = await import("../src/negocio/index.js");
const { identidades, identidadDeLaConversacion, nombresDelNegocio } = await import("../src/negocio/identidad.js");
const { FIRMA_DE_PRESENTACION, ES_PRESENTACION_DEL_NEGOCIO } = await import("../src/domain/saludo.js");
const { comproEnOtroLugar } = await import("../src/domain/cierrePerdido.js");
const { localesInventados } = await import("../src/domain/localesInventados.js");
const { PREFIJO_CUPON, generarCodigoCupon, normalizarCodigoCupon } = await import("../src/domain/coupons.js");
const { warrantyForBrand } = await import("../src/services/quoteMessages.js");
const { optionsPoster, comparePoster } = await import("../src/render/depotPosters.js");
const { resolveTheme } = await import("../src/render/depotDesign.js");

function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

describe("perfil ajeno · una sola identidad, la suya", () => {
  it("es Llantera Ejemplo, con su único local", () => {
    expect(negocio.id).toBe("ejemplo");
    expect(identidades(negocio)).toEqual([{ id: "ejemplo", nombre: "Llantera Ejemplo", locales: ["principal"] }]);
    expect(nombresDelNegocio(negocio)).toEqual(["Llantera Ejemplo"]);
    expect(identidadDeLaConversacion(negocio, "Depot Tire Cumbayá").id).toBe("ejemplo");
  });

  it("se presenta con su vendedor y su nombre", () => {
    expect(FIRMA_DE_PRESENTACION).toBe("Soy Andrés, de Llantera Ejemplo");
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy andres, de llantera ejemplo")).toBe(true);
    expect(ES_PRESENTACION_DEL_NEGOCIO.test("soy martin, de depot tire")).toBe(false);
  });
});

describe("perfil ajeno · los detectores usan SU nombre", () => {
  it("comprar en la llantera es ganar; en Depot es otro lado", () => {
    expect(comproEnOtroLugar("ya compré en llantera ejemplo")).toBe(false);
    expect(comproEnOtroLugar("ya compré aquí en guayaquil")).toBe(false);
    expect(comproEnOtroLugar("ya compré en otro lado")).toBe(true);
  });

  it("un local inventado con su marca sale a la luz", () => {
    expect(localesInventados("Pase por Llantera Ejemplo Norte", ["Llantera Ejemplo"])).toContain("Norte");
  });
});

describe("perfil ajeno · su cupón va y vuelve por caja", () => {
  it("prefijo LE, nunca DT", () => {
    expect(PREFIJO_CUPON).toBe("LE-");
    const codigo = generarCodigoCupon(() => 0.1);
    expect(codigo.startsWith("LE-")).toBe(true);
    expect(normalizarCodigoCupon(codigo)).toBe(codigo);
    expect(normalizarCodigoCupon(`le ${codigo.slice(3).toLowerCase()}`)).toBe(codigo);
    expect(normalizarCodigoCupon(codigo.slice(3))).toBe(codigo);
  });
});

describe("perfil ajeno · garantías y piezas desde su perfil", () => {
  it("su default de 6 meses aplica a toda marca, también a las de Depot", () => {
    for (const marca of ["FALKEN", "KENDA", "MICHELIN"]) {
      expect(warrantyForBrand(marca).roadHazardMonths).toBe(6);
    }
  });

  it("la pieza lleva su nombre, su local y ninguna frase de Depot", () => {
    const texto = textoDe(optionsPoster({
      dateLabel: "04 / 11 / 2026", sizeLabel: "205/55R16",
      lines: [{
        brand: "MICHELIN", design: "PRIMACY", sizeLabel: "205/55R16", loadSpeedLabel: "91V", loadSpeedTranslation: null,
        quantity: 4, unitConIva: 120, pvpConIva: null, availability: "available", golpesMeses: 6, fabricaAnios: 5,
        photoUri: "data:image/png;base64,iVBORw0KGgo=",
      }],
    }, resolveTheme("depotRojo", "exo")));
    expect(texto).toContain("GUAYAQUIL");
    expect(texto).toContain("Precios incluyen IVA · por unidad");
    expect(texto).not.toContain("Depot");
    expect(texto).not.toContain("Cumbayá");
    expect(texto).not.toContain("3 y 6 meses");
  });

  it("sin `precioSinDescuento` declarado, la comparativa conserva la frase de siempre", () => {
    const linea = {
      brand: "MICHELIN", design: "PRIMACY", sizeLabel: "205/55R16", loadSpeedLabel: "91V", loadSpeedTranslation: null,
      quantity: 4, unitConIva: 120, pvpConIva: null, availability: "available" as const, golpesMeses: 6, fabricaAnios: 5,
      photoUri: "data:image/png;base64,iVBORw0KGgo=",
    };
    const texto = textoDe(comparePoster({ dateLabel: "04 / 11 / 2026", lines: [linea, linea] }, resolveTheme("depotRojo", "exo")));
    expect(texto).toContain("Precio directo de distribuidor");
    expect(texto).not.toContain("Depot");
  });
});

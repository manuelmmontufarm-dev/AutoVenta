/**
 * `[PENDIENTE]` NUNCA LLEGA A UN CLIENTE (R-10).
 *
 * El perfil de Mundillantas arranca con huecos marcados `[PENDIENTE] <qué
 * falta>`: el teléfono de ventas, el nombre del vendedor, los textos de pago
 * de las piezas, dos direcciones. Esta prueba corre con `NEGOCIO=mundillantas`
 * y barre cada texto de cara al cliente que arman los archivos de este sprint
 * —el saludo, las cuatro piezas en las dos plantillas, la leyenda y el pie,
 * las listas y la cotización en texto, las garantías— buscando la marca.
 *
 * Lo que queda FUERA (otros archivos, otros sprints) está anotado en el PR
 * para el Sprint Final: la pregunta de local de `storeSelection.ts` y el
 * `business.phone` de `config.ts`.
 */
import { describe, expect, it } from "vitest";

process.env.NEGOCIO = "mundillantas";
process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.SELLER_PHONE ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { negocio, leyendaDelEncabezado, pieDeLocales, localesEnUnaLinea, firmaDePresentacion } =
  await import("../src/negocio/index.js");
const { localesConfirmados } = await import("../src/negocio/identidad.js");
const { presentacionDeApertura, conPresentacion } = await import("../src/domain/saludo.js");
const { quotePoster, comparePoster, optionsPoster, medidaGuidePoster } = await import("../src/render/depotPosters.js");
const { quotePosterDiaNoche, optionsPosterDiaNoche } = await import("../src/render/diaNoche.js");
const { resolveTheme } = await import("../src/render/depotDesign.js");
const { renderQuoteImage, toRenderLine } = await import("../src/render/quoteImage.js");
const { normalizeContificoProduct } = await import("../src/domain/catalog.js");
const qm = await import("../src/services/quoteMessages.js");

const MARCA = "[PENDIENTE]";
/** Lo que es de Depot y no puede aparecer en una pieza ni un texto de Mundillantas. */
const DE_DEPOT = /Depot|Cumbay[aá]|Quito Sur|Pit ?Stop/i;

/** Todo el texto de un árbol de satori, para buscar la marca adentro. */
function textoDe(nodo: unknown): string {
  if (typeof nodo === "string") return nodo;
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(" ");
  if (nodo && typeof nodo === "object") {
    const props = (nodo as { props?: { children?: unknown } }).props;
    return props ? textoDe(props.children) : "";
  }
  return "";
}

const producto = normalizeContificoProduct(
  { id: "X1", codigo: "X1", nombre: "205/55R16 91V UHP X", marca_nombre: "SAILUN", estado: "A", tipo: "P",
    pvp1: 60, porcentaje_iva: 15, cantidad_stock: 8 },
  "pvp1",
)!;

const linea = (extra: Record<string, unknown> = {}) => ({
  brand: "SAILUN", design: "UHP X", sizeLabel: "205/55R16", loadSpeedLabel: "91V", loadSpeedTranslation: null,
  quantity: 4, unitConIva: 69, pvpConIva: null, availability: "available" as const,
  // Así salen las garantías de Mundillantas: sin confirmar = 0.
  golpesMeses: null, fabricaAnios: 0, photoUri: "data:image/png;base64,iVBORw0KGgo=", ...extra,
});

const tema = resolveTheme("depotRojo", "exo");
const FECHA = "04 / 11 / 2026";

describe("con NEGOCIO=mundillantas el perfil SÍ tiene pendientes (si no, la prueba no prueba nada)", () => {
  it("el vendedor, el teléfono y los pies están en [PENDIENTE]", () => {
    expect(negocio.vendedor.nombre.startsWith(MARCA)).toBe(true);
    expect(negocio.telefono.startsWith(MARCA)).toBe(true);
    // Las condiciones ya llegaron (Jenny, 6-nov); lo que incluye la compra no.
    expect(negocio.piezas.todasIncluyen.startsWith(MARCA)).toBe(true);
  });
});

describe("el saludo", () => {
  it("se presenta sin el nombre pendiente del vendedor", () => {
    for (const texto of [firmaDePresentacion(negocio), presentacionDeApertura("Jenny"), conPresentacion("¿Qué medida busca?", null)]) {
      expect(texto).not.toContain(MARCA);
      expect(texto).not.toMatch(DE_DEPOT);
    }
  });
});

describe("la leyenda y el pie de las piezas", () => {
  it("omiten lo pendiente y nombran los tres locales confirmados el 6-nov", () => {
    expect(leyendaDelEncabezado(negocio)).toBe("SANTO DOMINGO");
    expect(localesEnUnaLinea(negocio)).toBe("Mundillantas Falken · Mundillantas Kenda · Competimotor");
    expect(pieDeLocales(negocio)).not.toContain(MARCA);
    expect(localesConfirmados(negocio).map((l) => l.slug)).toEqual(["matriz", "local2", "competimotor"]);
  });
});

describe("las piezas, en las dos identidades y las dos plantillas", () => {
  for (const identidad of [undefined, "mundillantas", "competimotor"]) {
    it(`clásica · identidad ${identidad ?? "(presentación)"}`, () => {
      const piezas = [
        quotePoster({ number: "COT-1", dateLabel: FECHA, identidad, line: linea(), subtotal: 240, iva: 36, total: 276 }, tema),
        // Con precio de lista para que salga también el «antes» y el sello.
        quotePoster({ number: "COT-2", dateLabel: FECHA, identidad, line: linea({ pvpConIva: 90 }), subtotal: 240, iva: 36, total: 276 }, tema),
        comparePoster({ dateLabel: FECHA, identidad, lines: [linea(), linea({ brand: "KENDA" })] }, tema),
        optionsPoster({ dateLabel: FECHA, identidad, sizeLabel: "205/55R16", lines: [linea(), linea({ brand: "WINRUN" })] }, tema),
        medidaGuidePoster({ dateLabel: FECHA, identidad }, tema),
      ];
      for (const pieza of piezas) {
        const texto = textoDe(pieza);
        expect(texto).not.toContain(MARCA);
        expect(texto).not.toMatch(DE_DEPOT);
        // Sin garantía confirmada no se dibuja «0 años».
        expect(texto).not.toMatch(/\b0 a[ñn]os/i);
      }
    });

    it(`día y noche · identidad ${identidad ?? "(presentación)"}`, () => {
      for (const modo of ["dia", "noche"] as const) {
        const piezas = [
          quotePosterDiaNoche({ number: "COT-1", dateLabel: FECHA, identidad, line: linea(), total: 276 }, modo),
          optionsPosterDiaNoche({ dateLabel: FECHA, identidad, sizeLabel: "205/55R16", lines: [linea(), linea({ brand: "KENDA" })] }, modo),
        ];
        for (const pieza of piezas) {
          const texto = textoDe(pieza);
          expect(texto).not.toContain(MARCA);
          expect(texto).not.toMatch(DE_DEPOT);
          expect(texto).not.toMatch(/\b0 a[ñn]os/i);
        }
      }
    });
  }

  it("la pieza de Competimotor lista solo su local al pie", () => {
    const texto = textoDe(optionsPoster({ dateLabel: FECHA, identidad: "competimotor", sizeLabel: "205/55R16", lines: [linea()] }, tema));
    expect(texto).toContain("Competimotor");
    expect(texto).not.toContain("Mundillantas Kenda");
  });

  it("y renderiza de verdad, con el logo combinado de las dos marcas", async () => {
    const png = await renderQuoteImage({
      number: "COT-1", dateLabel: FECHA, identidad: "competimotor",
      lines: [await toRenderLine(producto, 4)], subtotal: 240, iva: 36, total: 276,
    });
    expect(png.byteLength).toBeGreaterThan(10_000);
  });
});

describe("la pregunta de local (Sprint Final)", () => {
  it("ofrece solo los locales confirmados, nunca un [PENDIENTE]", async () => {
    // El hallazgo del traspaso del S1: con Mundillantas salía «¿A cuál local le
    // queda mejor ir: *Matriz*, *[PENDIENTE] nombre corto del local 2* o
    // *Competimotor*?». La pregunta nombra solo locales confirmados.
    const { PREGUNTA_DE_LOCAL, LOCALES_COMO_ALTERNATIVA } = await import("../src/domain/storeSelection.js");
    expect(PREGUNTA_DE_LOCAL).not.toContain(MARCA);
    expect(LOCALES_COMO_ALTERNATIVA).not.toContain(MARCA);
    expect(PREGUNTA_DE_LOCAL).toContain("*Mundillantas Falken*");
    expect(PREGUNTA_DE_LOCAL).toContain("*Mundillantas Kenda*");
    expect(PREGUNTA_DE_LOCAL).toContain("*Competimotor*");
  });
});

describe("los mensajes en texto", () => {
  it("listas, comparativa y cotización sin la marca ni garantías inventadas", () => {
    const textos = [
      qm.buildCustomerOptionsMessageDetallado([producto]),
      qm.buildComparisonMessageDetallado([producto, producto]),
      qm.buildSingleQuoteMessageDetallado({ product: producto, quantity: 4 }),
    ];
    for (const texto of textos) {
      expect(texto).not.toContain(MARCA);
      expect(texto).not.toMatch(DE_DEPOT);
      expect(texto).not.toContain("5 años");
      expect(texto).not.toContain("Ecovalor");
    }
  });
});

describe("lo que Depot promete no se cuela en las piezas de otro negocio", () => {
  // Las muestras del 4-nov salieron con «3 cuotas · 6 cuotas sin intereses»
  // (el [3, 6] de Depot escrito en diaNoche.ts) y con los rótulos de garantía
  // sobre secciones vacías.
  it("sin cuotas declaradas no hay cuotas, ni rótulos de garantía vacíos", () => {
    for (const modo of ["dia", "noche"] as const) {
      const cotizacion = textoDe(quotePosterDiaNoche({ number: "COT-1", dateLabel: FECHA, line: linea({ pvpConIva: 90 }), total: 276 }, modo));
      const opciones = textoDe(optionsPosterDiaNoche({ dateLabel: FECHA, sizeLabel: "205/55R16", lines: [linea()] }, modo));
      for (const texto of [cotizacion, opciones]) {
        // Sin `piezas.cuotasSinIntereses` no se calcula ninguna cuota. El pie
        // sí dice «hasta 6 meses sin intereses»: eso lo confirmó Jenny el 6-nov.
        expect(texto).not.toMatch(/cuotas/i);
        expect(texto).not.toMatch(/3 y 6 meses|\b3 meses/i);
      }
      expect(cotizacion).not.toContain("SU COMPRA ESTÁ RESPALDADA");
    }
    const clasica = textoDe(quotePoster({ number: "COT-1", dateLabel: FECHA, line: linea(), subtotal: 240, iva: 36, total: 276 }, tema));
    expect(clasica).not.toContain("GARANTÍAS QUE TE RESPALDAN");
  });
});

describe("las garantías que llegan a la pieza salen del perfil", () => {
  // La muestra renderizada el 4-nov salió con «5 años de fábrica» para
  // Mundillantas: `toRenderLine` tenía el 5 de Depot clavado.
  it("toRenderLine no promete años de fábrica sin confirmar", async () => {
    const linea = await toRenderLine(producto, 4);
    expect(linea.fabricaAnios).toBe(0);
    expect(linea.golpesMeses).toBeNull();
  });
});

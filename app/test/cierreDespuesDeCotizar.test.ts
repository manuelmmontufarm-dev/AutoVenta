/**
 * EL CIERRE DESPUÉS DE LA COTIZACIÓN — dictado por Joaquín el 26-ago-2026.
 *
 * Mirando el chat de +593 98 634 5988 (255/70R16, 4 Falken Wildpeak A/T 4W a
 * $208.09, total $832.36) dijo qué quería exactamente:
 *
 *   «el orden es: foto; mensaje corto con las dos ubicaciones que igual diga
 *   sin compromiso en algún lado; y otro mensaje diciendo a cuál de las dos le
 *   queda mejor ir. Después de que responda, que le pregunte qué día cree que
 *   va a poder ir para aplicarle el descuento y contactar al asesor, el del
 *   25 % mostrado en la cotización, y que calcule ese monto y lo muestre. Un
 *   mensaje corto pero valioso, porque es más probable que lo den si pueden ver
 *   el número de plata.»
 *
 * Y en el mismo lote: no ofrecer llantas de las que no hay un juego, y no
 * preguntar nunca cuántas quiere.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { ahorroDeLaCotizacion, fraseDeAhorro } from "../src/domain/ahorro.js";
import { JUEGO_COMPLETO, opcionesQueAlcanzan } from "../src/domain/opcionesCandados.js";

// `quoteMessages` arrastra la config del negocio (los locales y sus mapas), que
// exige el entorno completo. Los módulos de dominio de arriba no: son puros.
type QuoteMessages = typeof import("../src/services/quoteMessages.js");
let qm: QuoteMessages;

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN ||= "test";
  process.env.WHATSAPP_APP_SECRET ||= "test";
  process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
  process.env.WHATSAPP_PHONE_ID ||= "test";
  process.env.SELLER_PHONE ||= "593000000000";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgres://test:test@localhost/test";
  qm = await import("../src/services/quoteMessages.js");
});

/** La cotización de la captura: 4 × Falken, de $277.45 a $208.09 (−25 %). */
const LINEA_DE_LA_CAPTURA = {
  quantity: 4, listPriceWithTax: 277.45, salePriceWithTax: 208.09,
};

describe("el monto del descuento, que es lo que hace que contesten", () => {
  it("calcula el ahorro de TODA la compra y el mismo % que muestra la pieza", () => {
    const ahorro = ahorroDeLaCotizacion([LINEA_DE_LA_CAPTURA]);
    expect(ahorro).toEqual({ monto: 277.44, porcentaje: 25, cantidad: 4 });
    // Punto decimal, nunca coma: el mismo formato que la pieza y la cotización.
    expect(fraseDeAhorro(ahorro!)).toBe("*25 %* de descuento, *$277.44* menos");
  });

  it("sin descuento real no se inventa uno", () => {
    expect(ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 208.09, salePriceWithTax: 208.09 }])).toBeNull();
    // Precio de lista MENOR que el de venta: dato sucio, no una promoción.
    expect(ahorroDeLaCotizacion([{ quantity: 4, listPriceWithTax: 100, salePriceWithTax: 120 }])).toBeNull();
    expect(ahorroDeLaCotizacion([])).toBeNull();
    expect(ahorroDeLaCotizacion(null)).toBeNull();
  });

  it("un ahorro de centavos no gasta el mensaje", () => {
    expect(ahorroDeLaCotizacion([{ quantity: 1, listPriceWithTax: 208.5, salePriceWithTax: 208.09 }])).toBeNull();
  });
});

describe("el orden que pidió Joaquín: ubicaciones primero, la pregunta sola después", () => {
  let ubicaciones = "";
  let pregunta = "";
  beforeAll(() => { ({ ubicaciones, pregunta } = qm.buildStoreChoiceBlocks()); });

  it("el mensaje de ubicaciones dice «sin compromiso» y trae los dos links", () => {
    expect(ubicaciones).toMatch(/sin compromiso/i);
    expect(ubicaciones).toMatch(/Cumbayá/);
    expect(ubicaciones).toMatch(/Quito Sur/);
    expect(ubicaciones.match(/https?:\/\/\S+/g) ?? []).toHaveLength(2);
  });

  it("y NO pregunta nada: la pregunta es el mensaje siguiente", () => {
    expect(ubicaciones).not.toContain("?");
    expect(pregunta).toMatch(/cu[áa]l de los dos/i);
    // Corta de verdad: una línea. Es lo último que le queda en pantalla.
    expect(pregunta.split("\n")).toHaveLength(1);
  });

  it("el día NO se pregunta en este turno — se pregunta cuando ya eligió local", () => {
    expect(`${ubicaciones}\n${pregunta}`).not.toMatch(/qu[ée] d[íi]a/i);
  });
});

describe("con el local ya elegido, la pregunta del día lleva la plata a la vista", () => {
  const locales = ["Depot Tire Cumbayá", "Depot Tire Quito Sur"];

  it("nombra el monto y el porcentaje de su cotización", () => {
    const pregunta = qm.buildVisitPlanQuestion({
      conDescuentoAutorizado: false,
      locales,
      localElegido: "Depot Tire Cumbayá",
      ahorro: ahorroDeLaCotizacion([LINEA_DE_LA_CAPTURA]),
    });
    expect(pregunta).toMatch(/qu[ée] d[íi]a cree que puede pasar/i);
    expect(pregunta).toContain("*25 %*");
    expect(pregunta).toContain("*$277.44*");
    // No vuelve a ofrecer el otro local: eso es la re-pregunta de siempre.
    expect(pregunta).not.toContain("Quito Sur");
  });

  it("sin ahorro que mostrar, la pregunta sigue siendo la de siempre", () => {
    const pregunta = qm.buildVisitPlanQuestion({
      conDescuentoAutorizado: false, locales, localElegido: "Depot Tire Cumbayá", ahorro: null,
    });
    expect(pregunta).toMatch(/qu[ée] d[íi]a cree que puede pasar/i);
    expect(pregunta).not.toContain("%");
  });

  it("el descuento EXTRA autorizado manda sobre el del catálogo: no se mezclan", () => {
    const pregunta = qm.buildVisitPlanQuestion({
      conDescuentoAutorizado: true, locales, localElegido: "Depot Tire Cumbayá",
      ahorro: ahorroDeLaCotizacion([LINEA_DE_LA_CAPTURA]),
    });
    expect(pregunta).toMatch(/descuento extra/i);
    expect(pregunta).not.toContain("*$277.44*");
  });
});

describe("no se ofrece lo que no alcanza para la compra", () => {
  const llanta = (code: string, stock: number) => ({ code, stock });

  it("con menos de un juego, la opción no se muestra", () => {
    const productos = [llanta("A", 12), llanta("B", 2), llanta("C", 4)];
    expect(opcionesQueAlcanzan(productos).map((p) => p.code)).toEqual(["A", "C"]);
  });

  it("respeta la cantidad que el cliente SÍ pidió", () => {
    const productos = [llanta("A", 12), llanta("B", 2), llanta("C", 4)];
    expect(opcionesQueAlcanzan(productos, 2).map((p) => p.code)).toEqual(["A", "B", "C"]);
    expect(opcionesQueAlcanzan(productos, 8).map((p) => p.code)).toEqual(["A"]);
  });

  it("EL BORDE QUE IMPORTA: si nada alcanza, se muestra todo igual", () => {
    // Quedarse sin opciones es peor que mostrar una de la que hay pocas: el
    // stock de Contífico viene desfasado y ahí entra el aviso de stock corto.
    const pocas = [llanta("B", 2), llanta("D", 1)];
    expect(opcionesQueAlcanzan(pocas).map((p) => p.code)).toEqual(["B", "D"]);
  });

  it("el juego completo de Depot son 4", () => {
    expect(JUEGO_COMPLETO).toBe(4);
  });
});

/**
 * La segunda línea de defensa. Cada una de estas reglas nació porque el ÁNGEL
 * GUARDIÁN, que reescribe después de todos los candados deterministas, escribió
 * él mismo lo que estábamos quitando: metió «¿Cuántas llantas necesita?» en una
 * corrección (simulador, 26-ago) y borró la cifra del descuento por no poder
 * verificarla. Si la regla no está en su rúbrica, el guardián la rompe.
 */
describe("la rúbrica del guardián cubre el cierre nuevo", () => {
  it("prohíbe las preguntas de más, con categoría propia para contarlas", async () => {
    const { CATEGORIAS } = await import("../src/services/guardian.js");
    expect(CATEGORIAS).toContain("pregunta_de_mas");
    expect(CATEGORIAS).toContain("promesa_incumplible");
  });

  it("las dos categorías nuevas SÍ le avisan al asesor", async () => {
    const guardian = await import("../src/services/guardian.js");
    const sinAlerta = (guardian as unknown as { CATEGORIAS_SIN_ALERTA?: Set<string> }).CATEGORIAS_SIN_ALERTA;
    // `tono` y `otro` son las mudas; estas no pueden serlo.
    if (sinAlerta) {
      expect(sinAlerta.has("pregunta_de_mas")).toBe(false);
      expect(sinAlerta.has("promesa_incumplible")).toBe(false);
    }
  });
});

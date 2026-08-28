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
import { sinPreguntasProhibidas } from "../src/domain/preguntasProhibidas.js";

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
    // 27-ago (Manuel): «"a cuál de los dos" está como vago; que diga cuál de
    // los dos locales, Quito o Cumbayá». Sale en un mensaje aparte de los
    // links, así que «los dos» no señalaba nada.
    expect(pregunta).toMatch(/Cumbayá/);
    expect(pregunta).toMatch(/Quito Sur/);
    // Corta de verdad: una línea. Es lo último que le queda en pantalla.
    expect(pregunta.split("\n")).toHaveLength(1);
    expect(pregunta.length).toBeLessThan(70);
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

  it("EL BORDE QUE IMPORTA: si nada completa la compra, la vitrina queda vacía", () => {
    // Esta prueba conservaba la política anterior: dejar entrar 2 de 4 como
    // «desfase creíble». Conv 11818, 27-ago-2026, demostró el costo: la vitrina
    // recomendó una llanta, preguntó si cotizaba el juego y recién después del
    // «Ok» confesó que no alcanzaba. El cliente compró en Ibarra 50 s después.
    // El desfase se escala al asesor; no se convierte en una oferta incompleta.
    const pocas = [llanta("B", 2), llanta("D", 1)];
    expect(opcionesQueAlcanzan(pocas).map((p) => p.code)).toEqual([]);
  });

  it("y si NINGUNA llega a la mitad, la lista vuelve vacía", () => {
    // Vacía a propósito: la tool corta antes de dibujar y el agente le dice al
    // cliente que en esa medida no hay, con pedido o equivalente. Ver
    // `sin_stock_en_la_medida` en tools.ts.
    expect(opcionesQueAlcanzan([llanta("D", 1)]).map((p) => p.code)).toEqual([]);
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

/**
 * EL CANDADO, porque pedírselo al guardián NO alcanzó.
 *
 * Con la regla ya puesta en su rúbrica se le dieron estos tres borradores
 * (simulador, 26-ago) y el resultado fue: marcó la falta en ALTA y su propia
 * corrección volvió a preguntar la cantidad; dejó intacta la del nombre; y
 * clasificó la tercera en otra categoría. El guardián es la última mano que
 * toca el texto, así que lo que tiene que ser cierto sí o sí corre después.
 */
describe("las preguntas de más se quitan aunque las escriba el guardián", () => {
  it("la que el guardián reintrodujo en su propia corrección", () => {
    const r = sinPreguntasProhibidas(
      "Perfecto. Le cotizo la FALKEN a $208.09 c/u. El juego de 4 sería $832.36. ¿Cuántas llantas desea llevar?",
    );
    expect(r.texto).toBe("Perfecto. Le cotizo la FALKEN a $208.09 c/u. El juego de 4 sería $832.36.");
    expect(r.quitadas).toEqual(["¿Cuántas llantas desea llevar?"]);
  });

  it("pedir permiso para la cantidad es pedir la cantidad", () => {
    const r = sinPreguntasProhibidas("Buenísimo, la *FALKEN WILDPEAK A/T 4W* es muy buena opción. ¿Se la cotizo por 4?");
    expect(r.texto).toBe("Buenísimo, la *FALKEN WILDPEAK A/T 4W* es muy buena opción.");
  });

  it("y la del nombre, que el guardián dejó pasar entera (caso Eulalia, 19-ago)", () => {
    const r = sinPreguntasProhibidas("Con gusto. ¿A nombre de quién le hago la cotización, o la dejo como cliente final?");
    expect(r.texto).toBe("Con gusto.");
    expect(r.quitadas).toHaveLength(1);
  });

  it("EL CASO QUE NO DEBE DISPARAR: «¿se la cotizo?» a secas es la oferta legítima", () => {
    // Es la frase con la que se ofrece una equivalente y la que destrabó el
    // caso 4732. Confundirla con una pregunta de más rompería esa venta.
    const legitimas = [
      "En *235/70R15* no me queda la Falken, pero sí le sirve la equivalente en *235/75R15*. Si le parece, ¿se la cotizo?",
      "¿A cuál de los dos le queda mejor ir? 📍",
      "¿Qué día cree que puede pasar? Le aviso al asesor con *25 %* de descuento, *$277.44* menos. 📅",
      "¿Me confirma la medida o prefiere mandarme una foto del costado?",
    ];
    for (const texto of legitimas) {
      const r = sinPreguntasProhibidas(texto);
      expect(r.quitadas, `no debía tocar: ${texto}`).toHaveLength(0);
      expect(r.texto).toBe(texto);
    }
  });

  it("un bloque que era SOLO la pregunta de más desaparece, no queda vacío", () => {
    const r = sinPreguntasProhibidas("Su cotización está lista.\n---\n¿Cuántas llantas necesita?");
    expect(r.texto).toBe("Su cotización está lista.");
  });
});

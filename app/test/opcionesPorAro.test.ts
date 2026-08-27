/**
 * «TIENE AT RIN 16?» — conv 3 ciclo 11, producción, 27-ago 23:02.
 *
 * El cliente buscó por ARO, sin medida. La pieza salió rotulada
 * «TODO EN TU MEDIDA · 215/65R16» con tres llantas de TRES medidas distintas
 * debajo (215/65R16, 245/70R16, 225/70R16) y sin decirlo en ninguna parte: el
 * rótulo era la medida de la primera. Y el cierre prometía «le dejo la opción
 * exacta para su medida» sin que el cliente hubiera dado ninguna.
 *
 * El Ángel Guardián sí lo vio —`medida_incorrecta` en alta: «el borrador dice
 * "para su medida", pero el cliente solo indicó rin 16»— y al corregirlo se
 * llevó el menú de preferencia entero: el turno terminó pidiéndole otra vez la
 * medida en vez de avanzar.
 *
 * Manuel: «prefiero que en el PDF avise que no es la medida exacta y que
 * continúe directamente con el menú».
 */
import { beforeAll, describe, expect, it } from "vitest";
import { canGenerateFinalQuote, hasExplicitQuantity } from "../src/domain/salesIntent.js";

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

describe("el cierre no promete una medida que nadie dio", () => {
  const base = { entregarRecomendacion: false, recomendacion: "", motivo: "" };

  it("EL BUG: sin medida conocida, el menú deja de decir «para su medida»", () => {
    const cierre = qm.buildCierreOpciones({ ...base, hayEquivalentes: true });
    expect(cierre).not.toMatch(/su medida/i);
    // Pero el menú SIGUE saliendo: es lo que hace avanzar el turno.
    expect(cierre).toContain("1) *Costo*");
    expect(cierre).toContain("2) *Equilibrio*");
    expect(cierre).toContain("3) *Premium*");
    expect(cierre).toMatch(/cuál de estas le conviene/i);
  });

  it("EL CASO QUE NO DEBE DISPARAR: con la medida confirmada sí se la promete", () => {
    const cierre = qm.buildCierreOpciones({ ...base, hayEquivalentes: false });
    expect(cierre).toMatch(/su medida/i);
    expect(cierre).toContain("1) *Costo*");
  });

  it("los dos caminos ofrecen las mismas tres opciones: cambia la promesa, no el menú", () => {
    const conMedida = qm.buildCierreOpciones({ ...base, hayEquivalentes: false });
    const sinMedida = qm.buildCierreOpciones({ ...base, hayEquivalentes: true });
    for (const menu of ["1) *Costo*", "2) *Equilibrio*", "3) *Premium*", "¿qué prioriza usted?"]) {
      expect(conMedida, menu).toContain(menu);
      expect(sinMedida, menu).toContain(menu);
    }
  });
});

/**
 * EL MENÚ OFRECE SOLO LO QUE HAY — conv 3 ciclo 12, producción, 27-ago 23:23.
 *
 * La pieza salió con DOS llantas (KENDA KR20 y KR23), así que los escalones se
 * repartieron premium/económica y el del medio quedó en `null`. El menú, que
 * era texto fijo, ofreció igual «2) Equilibrio»; el cliente escribió «equilibro»
 * y el bot tuvo que contestarle: «La opción de *equilibrio* no quedó disponible
 * en esta pieza».
 */
describe("el menú no ofrece escalones que la pieza no trae", () => {
  const base = { entregarRecomendacion: false, recomendacion: "KENDA KR23", motivo: "", precioConIva: 55.64 };

  it("EL BUG: con dos opciones, el menú ofrece dos y renumera", () => {
    const cierre = qm.buildCierreOpciones({ ...base, escalonesDisponibles: ["precio", "premium"] });
    expect(cierre).toContain("1) *Costo*");
    expect(cierre).toContain("2) *Premium*");
    expect(cierre).not.toContain("Equilibrio");
    expect(cierre).not.toContain("3)");
  });

  it("con una sola opción no se pregunta: se entrega", () => {
    const cierre = qm.buildCierreOpciones({ ...base, escalonesDisponibles: ["precio"] });
    expect(cierre).toMatch(/única que tengo/i);
    expect(cierre).toContain("KENDA KR23");
    expect(cierre).toContain("$55.64");
    expect(cierre).not.toContain("1)");
  });

  it("EL CASO QUE NO DEBE DISPARAR: con las tres, el menú es el de siempre", () => {
    const cierre = qm.buildCierreOpciones({ ...base, escalonesDisponibles: ["precio", "equilibrada", "premium"] });
    expect(cierre).toContain("1) *Costo*");
    expect(cierre).toContain("2) *Equilibrio*");
    expect(cierre).toContain("3) *Premium*");
  });

  it("y sin decir nada, se asume que están las tres", () => {
    expect(qm.buildCierreOpciones(base)).toContain("3) *Premium*");
  });
});

/**
 * «DALE CON LAS KENDA DEME 20» — el mismo tope de 8, escondido en otra puerta.
 *
 * `hasExplicitQuantity` usaba solo `extractExplicitQuantity`, que topa en 8, así
 * que para el sistema el cliente NO había dicho cuántas quería:
 * `canGenerateFinalQuote` bloqueó la cotización con «el cliente está comparando
 * o acaba de decir que no», y el modelo improvisó — le dio el total en texto y
 * le dijo que «no me dejó generar la imagen de cotización». Nunca hubo
 * cotización (verificado: cero filas en `quotes` para ese ciclo).
 */
describe("una cantidad grande cuenta como cantidad dicha", () => {
  it("EL BUG: el mensaje real ya deja cotizar", () => {
    expect(hasExplicitQuantity("dale con las kenda deme 20")).toBe(true);
    expect(canGenerateFinalQuote("dale con las kenda deme 20")).toBe(true);
  });

  it("las cantidades normales siguen igual", () => {
    expect(hasExplicitQuantity("deme 4")).toBe(true);
    expect(canGenerateFinalQuote("deme 4")).toBe(true);
  });

  it("EL CASO QUE NO DEBE DISPARAR: sin cantidad sigue sin pasar", () => {
    expect(hasExplicitQuantity("dale con las kenda")).toBe(false);
    expect(canGenerateFinalQuote("dale con las kenda")).toBe(false);
    expect(canGenerateFinalQuote("no gracias")).toBe(false);
  });
});

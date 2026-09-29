import { describe, expect, it } from "vitest";
import { buildContextualFollowUpMessage } from "../src/domain/followUpMessages.js";
import { ofertaDeCotizacionAceptada, ofertaDeCotizarAceptada } from "../src/domain/ofertaAceptada.js";
import { pidioPrecioOCotizacion } from "../src/domain/salesIntent.js";
import { cotizarLaUnicaDeUnaVez } from "../src/domain/cotizarLaUnica.js";

// quoteMessages importa config.ts, que exige estas variables al cargarse.
process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_cotizar_la_unica";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";
const { buildCierreOpciones } = await import("../src/services/quoteMessages.js");
const { isSafeCopy } = await import("../src/services/followUpCopy.js");

/**
 * FAMILIA: «el cliente ya pidió el precio / la cotización y el bot le pide
 * permiso en vez de dársela». Conv +593 99 842 8277 (25-sep y 27-sep 23:42):
 * «31x10.5R15» + «Precio por favor», y «cotízame la 265/70R16», con UNA sola
 * opción vendible → «Es la única que tengo: Kenda KR628 $191 c/u. ¿Se la
 * cotizo?», dos veces, y la cotización nunca salió.
 */
const OFERTA_UNICA =
  "Es la única que tengo para lo que me pidió: *KENDA KR628* — $191.00 c/u con IVA. ¿Se la cotizo? 😊";

describe("pidioPrecioOCotizacion: todas las formas de pedir el número", () => {
  it.each([
    "Precio por favor", "precio", "cuánto", "Cuánto cuesta", "cotiza", "cotízame la 265/70R16",
    "cotización", "me cotiza", "cuanto sale", "valor", "¿a cómo?",
  ])("«%s» cuenta", (texto) => {
    expect(pidioPrecioOCotizacion(texto)).toBe(true);
  });

  it.each([
    "cuánto es", "cuánto está", "cuánto serían", "cuánto me sale", "cuánto por las 4",
    "cuánto el juego", "cuánto c/u", "cuánto cada una", "¿cuánto?", "Hola, cuánto las 4?",
  ])("«%s» cuenta (cuánto de precio)", (texto) => {
    expect(pidioPrecioOCotizacion(texto)).toBe(true);
  });

  it.each([
    "cuánto tiempo demora", "cuánto dura", "cuánto duran las llantas", "cuánto aguanta", "cuánto aguantan",
    "cuánto tarda la instalación", "cuánto km da", "cuántos kilometros rinde", "cuánto rinde",
    "cuánto se demora", "cuánto es la garantia", "cuánto de garantia tiene",
  ])("«%s» NO cuenta (cuánto que no es precio)", (texto) => {
    expect(pidioPrecioOCotizacion(texto)).toBe(false);
  });

  it.each(["31x10.5R15", "hola buenas", "busco 265/70R16", "en Quito", "gracias"])(
    "«%s» no cuenta", (texto) => {
      expect(pidioPrecioOCotizacion(texto)).toBe(false);
    },
  );
});

describe("una sola opción vendible + precio ya pedido = se cotiza, no se pregunta", () => {
  const base = { opcionesDistintas: 1, medidaSinConfirmar: false };

  it("«31x10.5R15» y luego «Precio por favor» en la visita: cotiza", () => {
    expect(cotizarLaUnicaDeUnaVez({ ...base, textosDelCliente: ["Precio por favor", "31x10.5R15"] })).toBe(true);
  });
  it("«cotízame la 265/70R16» en el mismo mensaje: cotiza", () => {
    expect(cotizarLaUnicaDeUnaVez({ ...base, textosDelCliente: ["cotízame la 265/70R16"] })).toBe(true);
  });
  it("solo dio la medida (nunca pidió precio): no cotiza, ofrece", () => {
    expect(cotizarLaUnicaDeUnaVez({ ...base, textosDelCliente: ["31x10.5R15"] })).toBe(false);
  });
  it("con varias opciones el menú sigue mandando (conv 13615)", () => {
    expect(cotizarLaUnicaDeUnaVez({ ...base, opcionesDistintas: 3, textosDelCliente: ["precio"] })).toBe(false);
  });
  it("con la medida sin confirmar no se cotiza", () => {
    expect(cotizarLaUnicaDeUnaVez({ ...base, medidaSinConfirmar: true, textosDelCliente: ["precio"] })).toBe(false);
  });
});

describe("«Precio por favor» a «¿Se la cotizo?» de la única es un sí", () => {
  it.each(["Precio por favor", "Cuánto cuesta", "cotízame", "cuanto sale?"])("«%s»", (texto) => {
    expect(ofertaDeCotizacionAceptada(OFERTA_UNICA, texto)).toBe(true);
    expect(ofertaDeCotizarAceptada(OFERTA_UNICA, texto)).toBe(true);
  });
  it("una pregunta por otra cosa no lo es", () => {
    expect(ofertaDeCotizacionAceptada(OFERTA_UNICA, "¿y en aro 17 tienen?")).toBe(false);
    expect(ofertaDeCotizacionAceptada(OFERTA_UNICA, "no gracias")).toBe(false);
  });
  it("el precio pedido a un mensaje que NO ofreció cotizar no autoriza nada", () => {
    expect(ofertaDeCotizacionAceptada("¿Qué medida necesita?", "precio")).toBe(false);
  });
});

describe("el cierre de la única cuando el precio ya se pidió", () => {
  it("entrega la llanta y NO pide permiso", () => {
    const cierre = buildCierreOpciones({
      entregarRecomendacion: true,
      ofrecerCotizar: false,
      recomendacion: "KENDA KR628",
      motivo: "es la única",
      precioConIva: 191,
      escalonesDisponibles: ["precio"],
    });
    expect(cierre).toContain("Es la única que tengo");
    expect(cierre).toContain("KENDA KR628");
    expect(cierre).toContain("$191.00");
    expect(cierre).not.toMatch(/cotizo|\?/i);
  });
});

describe("seguimiento de la única cuando el cliente ya pidió el precio", () => {
  const context = {
    stage: "seleccionando" as const,
    tireSize: "31x10.5R15",
    selectedProductLabel: "KENDA KR628",
    optionsCount: 1,
    customerAskedPrice: true,
  };
  it.each(["in_window_first", "in_window_second"] as const)("%s no pregunta «¿se la cotizo?»", (kind) => {
    const texto = buildContextualFollowUpMessage(context, kind);
    expect(texto).not.toMatch(/cotizo/i);
    expect(texto).toMatch(/cotizaci[oó]n/i);
  });
  it("la redacción con IA que pregunta «¿se la cotizo?» se descarta (gana el texto fijo)", () => {
    expect(isSafeCopy("Hola, ¿cómo le fue con la KENDA KR628? ¿Se la cotizo?", context)).toBe(false);
    expect(isSafeCopy("Su cotización de la KENDA KR628 está lista, dígame cuántas llantas lleva.", context)).toBe(true);
    // Sin precio pedido la pregunta legítima de la única sigue pasando.
    expect(isSafeCopy("¿Cómo le fue con la KENDA KR628? ¿Se la cotizo?", { ...context, customerAskedPrice: false })).toBe(true);
  });
  it("sin precio pedido, la plantilla vieja sigue igual", () => {
    const texto = buildContextualFollowUpMessage({ ...context, customerAskedPrice: false }, "in_window_first");
    expect(texto).toMatch(/¿se la cotizo\?/i);
  });
});

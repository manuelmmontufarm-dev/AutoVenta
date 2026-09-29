import { describe, expect, it } from "vitest";
import { buildContextualFollowUpMessage } from "../src/domain/followUpMessages.js";
import { ofertaDeCotizacionAceptada, ofertaDeCotizarAceptada } from "../src/domain/ofertaAceptada.js";
import { canGenerateFinalQuote, isNegativeResponse, pidioPrecioOCotizacion } from "../src/domain/salesIntent.js";
import { cotizarLaUnicaDeUnaVez, ofrecioCotizarLaUnica, ultimoTurnoDelBot } from "../src/domain/cotizarLaUnica.js";

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

/**
 * Simulador en vivo: la pieza sale en DOS filas del historial —«Es la única que
 * tengo… $183.70» y, aparte, «¿Se la cotizo? 😊»— y el marcador solo miraba la
 * última fila (la del «¿Se la cotizo?» pelado), así que «Precio por favor» no
 * se leía como sí. El marcador se evalúa sobre TODO el último turno del bot.
 */
describe("el último turno del bot, en varias filas", () => {
  const historial = [
    { role: "user", content: "Hola, necesito llantas 245/60R18" },
    { role: "assistant", content: "Es la única que tengo para lo que me pidió: *KENDA KR50* — $183.70 c/u con IVA." },
    { role: "assistant", content: "¿Se la cotizo? 😊" },
    { role: "user", content: "Precio por favor" },
  ];

  it("ultimoTurnoDelBot junta las filas consecutivas y salta el mensaje actual del cliente", () => {
    const turno = ultimoTurnoDelBot(historial);
    expect(turno).toContain("Es la única que tengo");
    expect(turno).toContain("¿Se la cotizo?");
  });
  it("no arrastra turnos anteriores del bot", () => {
    const turno = ultimoTurnoDelBot([
      { role: "assistant", content: "Hola, soy el asistente" },
      { role: "user", content: "245/60R18" },
      ...historial.slice(1),
    ]);
    expect(turno).not.toContain("asistente");
  });
  it("«Precio por favor» al «¿Se la cotizo?» partido en dos filas es un sí", () => {
    const turno = ultimoTurnoDelBot(historial);
    expect(ofertaDeCotizacionAceptada("¿Se la cotizo? 😊", "Precio por favor", turno)).toBe(true);
    expect(ofertaDeCotizarAceptada("¿Se la cotizo? 😊", "Precio por favor", turno)).toBe(true);
  });
  it("con solo la fila del «¿Se la cotizo?» y sin el turno no hay marcador", () => {
    expect(ofrecioCotizarLaUnica("¿Se la cotizo? 😊")).toBe(false);
  });
  it("una oferta suelta que no es la de la única no se vuelve sí", () => {
    expect(ofertaDeCotizacionAceptada("¿Se la cotizo? 😊", "Precio por favor", "Le sirven estas dos.\n¿Se la cotizo? 😊")).toBe(false);
  });
});

/**
 * V5b (simulador, 28-sep): «Lo compro por este medio, me cotiza, lo cancelo y me
 * envía, 4 llantas 245/60R18». En Ecuador «lo cancelo» es «lo pago», pero
 * `isNegativeResponse` lo leía como cancelar el pedido y `canGenerateFinalQuote`
 * bloqueaba la cotización: la decisión de cotizar la única SÍ disparaba.
 */
describe("«lo cancelo» es pagar, no cancelar (V5b)", () => {
  const V5B = "Lo compro por este medio, me cotiza, lo cancelo y me envía, 4 llantas 245/60R18";
  it("el mensaje completo pide precio y es cotizable", () => {
    expect(pidioPrecioOCotizacion(V5B)).toBe(true);
    expect(cotizarLaUnicaDeUnaVez({ opcionesDistintas: 1, textosDelCliente: [V5B], medidaSinConfirmar: false })).toBe(true);
    expect(canGenerateFinalQuote(V5B, false, true)).toBe(true);
  });
  it.each(["lo cancelo", "la cancelo por transferencia", "lo cancelamos hoy"])("«%s» no es negativa", (t) => {
    expect(isNegativeResponse(t)).toBe(false);
  });
  it.each(["quiero cancelar", "cancelo mi pedido", "mejor cancela la cotización", "no gracias"])("«%s» sigue siendo negativa", (t) => {
    expect(isNegativeResponse(t)).toBe(true);
  });
  it("«no gracias, lo cancelo mañana» sigue frenando (el no manda)", () => {
    expect(isNegativeResponse("no gracias, lo cancelo mañana")).toBe(true);
  });
});

describe("seguimiento de la única con la cantidad ya dada (V5b)", () => {
  const context = {
    stage: "seleccionando" as const,
    tireSize: "245/60R18",
    selectedProductLabel: "KENDA KR50",
    optionsCount: 1,
    customerAskedPrice: true,
    selectedQuantity: 4,
  };
  it.each(["in_window_first", "in_window_second"] as const)("%s no pregunta la cantidad ni promete enviar", (kind) => {
    const texto = buildContextualFollowUpMessage(context, kind);
    expect(texto).not.toMatch(/cu[aá]ntas/i);
    expect(texto).not.toMatch(/lista|al momento|cotizo/i);
    expect(texto).toContain("4 llantas");
    expect(texto).not.toContain("?");
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

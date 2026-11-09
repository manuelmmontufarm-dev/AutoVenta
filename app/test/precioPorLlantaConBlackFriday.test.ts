/**
 * EL TEXTO NO PUEDE DECIR UN «$X c/u» QUE CONTRADIGA LA PROMO (auditoría 9-nov-2026).
 *
 * Con Black Friday (Falken/Kenda: impares a LISTA, pares a lista × 0,4) no existe
 * un precio por llanta. La lámina y la cotización ya decían la cuenta; el texto
 * de al lado seguía diciendo «$202.87 c/u» (el precio de hoy) o «$251.59 c/u» (la
 * lista). Una prueba por puerta de salida, con los textos de los chats reales:
 * 39597, 39615, 40082, 39909 (Falken lista $270.49 / hoy $202.87, 4 llantas =
 * 2 × $270.49 + 2 × $108.20 = $757.38).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost/autoventa_precio_cu";
process.env.WHATSAPP_TOKEN ??= "test";
process.env.WHATSAPP_APP_SECRET ??= "test";
process.env.WHATSAPP_VERIFY_TOKEN ??= "test";
process.env.WHATSAPP_PHONE_ID ??= "test";

const { buildCierreOpciones, textoDeLaPieza } = await import("../src/services/quoteMessages.js");
const temporada = await import("../src/domain/promocionDeTemporada.js");
const { confirmacionDeLaOpcion, opcionPorPosicion } = await import("../src/domain/listaDeOpciones.js");
const { loQueEligio } = await import("../src/services/cotizarLoElegido.js");
const { salesFactsPrompt } = await import("../src/agent/agent.js");
const { sinPrecioPorLlantaConPromo } = await import("../src/domain/sinPrecioPorLlantaConPromo.js");
const { lineaDeLaCotizacionVigente } = await import("../src/domain/hechoDeCotizacionVigente.js");
const { frenarHechosNuevosDelGuardian } = await import("../src/domain/guardianNoVendeSolo.js");
const { POLITICA_DEPOT } = await import("../src/negocio/politicas/depot.js");
const { hechoDeTemporadaParaElGuardian, hechoDeTemporadaParaElVendedor } = await import("../src/services/hechosDeTemporada.js");
const { REGLAS_DE_PROMOCION_DE_TEMPORADA } = await import("../src/agent/compactPlaybook.js");

const promo = POLITICA_DEPOT.promocionDeTemporada!;
const NOVIEMBRE = new Date("2026-11-09T17:00:00Z");
const DICIEMBRE = new Date("2026-12-01T17:00:00Z");
const FALKEN = { hoy: 202.87, lista: 270.49 };
const CUENTA = "2 × $270.49 + 2 × $108.20 = $757.38";

const falken = (cantidad = 4) =>
  temporada.segundaLlantaDe(promo, "FALKEN", cantidad, { hoyConIva: FALKEN.hoy, listaConIva: FALKEN.lista }, NOVIEMBRE)!;

function sinC_U(texto: string) {
  expect(texto).not.toContain("$202.87 c/u");
  expect(texto).not.toContain("$270.49 c/u");
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOVIEMBRE);
});
afterEach(() => {
  vi.setSystemTime(NOVIEMBRE);
  temporada.fijarCompuertaDeTemporada(() => true);
});

const base = (extra: object = {}) => ({
  recomendacion: "FALKEN WILDPEAK A/T TRAIL", motivo: "la más firme de las tres",
  precioConIva: FALKEN.hoy, marca: "FALKEN", listaConIva: FALKEN.lista, cantidad: 4, ...extra,
});

describe("el helper: cómo se dice el precio de una línea", () => {
  it("Falken con 4 llantas dice la cuenta; con 1 o 3, Winrun, la promo apagada o la compuerta cerrada, el c/u", () => {
    const dice = (marca: string, cantidad: number, ahora = NOVIEMBRE) =>
      temporada.precioDeLaLinea(promo, marca, cantidad, { hoyConIva: FALKEN.hoy, listaConIva: FALKEN.lista }, { ahora }).texto;
    expect(dice("FALKEN", 4)).toBe(`${CUENTA} (−60 % en la 2.ª llanta)`);
    expect(dice("KENDA", 2)).toContain("1 × $270.49 + 1 × $108.20");
    expect(dice("FALKEN", 1)).toBe("$202.87 c/u con IVA");
    expect(dice("FALKEN", 3)).toBe("$202.87 c/u con IVA");
    expect(dice("WINRUN", 4)).toBe("$202.87 c/u con IVA");
    expect(dice("FALKEN", 4, DICIEMBRE)).toBe("$202.87 c/u con IVA");
    vi.setSystemTime(NOVIEMBRE);
    temporada.fijarCompuertaDeTemporada(() => false);
    expect(temporada.precioDeLaLinea(promo, "FALKEN", 4, { hoyConIva: FALKEN.hoy, listaConIva: FALKEN.lista }).texto)
      .toBe("$202.87 c/u con IVA");
  });
});

describe("puerta: el texto que acompaña la lámina (buildCierreOpciones)", () => {
  it("UNA opción (caso 39597): «Es la única…» dice la cuenta, no el c/u", () => {
    const t = buildCierreOpciones(base({ entregarRecomendacion: false, escalonesDisponibles: ["precio"] }));
    sinC_U(t);
    expect(t).toContain(CUENTA);
  });

  it("recomendación entregada («Yo iría por la…»): la cuenta", () => {
    const t = buildCierreOpciones(base({ entregarRecomendacion: true }));
    sinC_U(t);
    expect(t).toContain(CUENTA);
  });

  it("única con precio ya pedido (sin pregunta): la cuenta", () => {
    const t = buildCierreOpciones(base({ entregarRecomendacion: true, escalonesDisponibles: ["precio"] }));
    sinC_U(t);
    expect(t).toContain(CUENTA);
  });

  it("pide la medida con recomendación: la cuenta", () => {
    const t = buildCierreOpciones(base({ entregarRecomendacion: true, pedirMedida: true }));
    sinC_U(t);
    expect(t).toContain(CUENTA);
  });

  it("Winrun, 1 llanta, 3 llantas: el c/u se conserva", () => {
    expect(buildCierreOpciones(base({ entregarRecomendacion: true, marca: "WINRUN", precioConIva: 124.76, listaConIva: 166.35 })))
      .toContain("$124.76 c/u con IVA");
    expect(buildCierreOpciones(base({ entregarRecomendacion: true, cantidad: 1 }))).toContain("$202.87 c/u con IVA");
    expect(buildCierreOpciones(base({ entregarRecomendacion: true, cantidad: 3 }))).toContain("$202.87 c/u con IVA");
  });

  it("promo apagada (reloj en 1-dic) o compuerta cerrada: el c/u se conserva", () => {
    vi.setSystemTime(DICIEMBRE);
    expect(buildCierreOpciones(base({ entregarRecomendacion: true }))).toContain("$202.87 c/u con IVA");
    vi.setSystemTime(NOVIEMBRE);
    temporada.fijarCompuertaDeTemporada(() => false);
    expect(buildCierreOpciones(base({ entregarRecomendacion: true }))).toContain("$202.87 c/u con IVA");
  });
});

describe("puerta: lo que la pieza dejó escrito (texto de la pieza, «los dos valores», elegir por número)", () => {
  const escalones = {
    economica: { codigo: "F1", nombre: "FALKEN WILDPEAK A/T TRAIL", precio_con_iva: FALKEN.hoy, segunda_llanta: falken() },
    equilibrada: null, premium: null,
  };

  it("textoDeLaPieza con una sola opción con promo: la cuenta", () => {
    const t = textoDeLaPieza({ escalones, cantidad: 4, sizeLabel: "255/65R17" })!;
    sinC_U(t);
    expect(t).toContain(CUENTA);
  });

  it("«los dos valores de la marca» (cotizarLoElegido): la cuenta de cada opción con promo", () => {
    const dos = {
      economica: { codigo: "F1", nombre: "FALKEN WILDPEAK A/T TRAIL", precio_con_iva: FALKEN.hoy, segunda_llanta: falken() },
      equilibrada: null,
      premium: { codigo: "F2", nombre: "FALKEN ZIEX", precio_con_iva: 100, segunda_llanta: null },
    };
    const vitrina = [
      { codigo: "F1", marca: "FALKEN", diseno: "WILDPEAK" },
      { codigo: "F2", marca: "FALKEN", diseno: "ZIEX" },
    ] as never;
    const r = loQueEligio("deme los dos valores de la falken", "", null, vitrina, dos as never) as { respuesta: string };
    sinC_U(r.respuesta);
    expect(r.respuesta).toContain(CUENTA);
    expect(r.respuesta).toContain("$100.00 c/u con IVA");
  });

  it("elegir por número: la confirmación dice el precio que le pasan (cuenta con promo, c/u con 1 o 3)", () => {
    expect(confirmacionDeLaOpcion(2, "FALKEN WILDPEAK", temporada.decirPrecioDeLaLinea({ hoyConIva: FALKEN.hoy, cantidad: 4, segunda: falken() })))
      .toBe(`La opción 2, *FALKEN WILDPEAK* — ${CUENTA} (−60 % en la 2.ª llanta). Le dejo la cotización 👍`);
    expect(confirmacionDeLaOpcion(1, "FALKEN WILDPEAK", temporada.decirPrecioDeLaLinea({ hoyConIva: FALKEN.hoy, cantidad: 1 })))
      .toBe("La opción 1, *FALKEN WILDPEAK* — $202.87 c/u con IVA. Le dejo la cotización 👍");
  });

  it("opcionPorPosicion devuelve la promo guardada de la línea", () => {
    const dos = {
      cantidad: 4,
      escalones: {
        economica: { codigo: "W", nombre: "WINRUN R380", precio_con_iva: 124.76 },
        equilibrada: null,
        premium: { codigo: "F1", nombre: "FALKEN WILDPEAK A/T TRAIL", precio_con_iva: FALKEN.hoy, segunda_llanta: falken() },
      },
    };
    expect(opcionPorPosicion(dos, 2)?.segunda_llanta?.totalConIva).toBe(757.38);
    expect(opcionPorPosicion(dos, 1)?.segunda_llanta).toBeNull();
  });

  it("promo apagada: lo guardado vuelve al c/u (los seguimientos de diciembre no nombran la promo)", () => {
    vi.setSystemTime(DICIEMBRE);
    const t = textoDeLaPieza({ escalones, cantidad: 4, sizeLabel: "255/65R17" })!;
    expect(t).toContain("$202.87 c/u con IVA");
    expect(t).not.toContain("×");
  });
});

describe("hechos del vendedor (A2: 39615 y 40082)", () => {
  const facts = (escalones: object) => ({
    tireSize: "245/70R16", vehicle: null, vehicleYear: null, selectedProductCode: null, selectedQuantity: null,
    nearestStore: null, visitDate: null, visitTimeLabel: null, customerCommitment: null, inboundMessages: [],
    lastQuote: null, escalones, codigos: null,
  }) as never;

  it("los escalones con promo traen la cuenta y la orden de no decir c/u; no el c/u de hoy", () => {
    const k = temporada.segundaLlantaDe(promo, "KENDA", 4, { hoyConIva: 173.32, listaConIva: 231.1 }, NOVIEMBRE)!;
    const linea = salesFactsPrompt(facts({
      economica: null, equilibrada: { codigo: "K628", nombre: "KENDA KR628", precio_con_iva: 173.32, segunda_llanta: k }, premium: null,
    }));
    expect(linea).toContain("2 × $231.10 + 2 × $92.44 = $647.08");
    expect(linea).not.toContain("$173.32 c/u");
    expect(linea).toMatch(/NUNCA «\$X c\/u»/);
  });

  it("Winrun (sin promo) conserva el c/u en los escalones", () => {
    const linea = salesFactsPrompt(facts({
      economica: { codigo: "W", nombre: "WINRUN R380", precio_con_iva: 124.76 }, equilibrada: null, premium: null,
    }));
    expect(linea).toContain("$124.76 c/u con IVA");
    expect(linea).not.toMatch(/NUNCA «\$X c\/u»/);
  });

  it("la regla de la promo dice que en Falken/Kenda no existe un precio por llanta (vendedor y Guardián)", () => {
    expect(REGLAS_DE_PROMOCION_DE_TEMPORADA).toMatch(/NO EXISTE un precio por llanta/);
    expect(hechoDeTemporadaParaElVendedor({ promo, ahora: NOVIEMBRE })).toMatch(/NO EXISTE un precio por llanta/);
    expect(hechoDeTemporadaParaElGuardian({ promo, ahora: NOVIEMBRE })).toMatch(/NO existe un precio por llanta/);
  });
});

describe("hechos del Guardián (B: 39909)", () => {
  const kr50 = temporada.segundaLlantaDe(promo, "KENDA", 4, { hoyConIva: 188.69, listaConIva: 251.59 }, NOVIEMBRE)!;

  it("«Cotización vigente» con Black Friday dice la cuenta y no «a $251.59 c/u»", () => {
    const l = lineaDeLaCotizacionVigente({
      brand: "KENDA", design: "KR50", sizeLabel: "265/60R18", quantity: 4, salePriceWithTax: 251.59, segundaLlanta: kr50,
    });
    expect(l).toContain("2 × $251.59 + 2 × $100.64 = $704.46");
    expect(l).not.toContain("a $251.59 c/u");
    expect(l).not.toContain("$188.69 c/u");
  });

  it("sin promo la línea es la de siempre: «a $P c/u»", () => {
    expect(lineaDeLaCotizacionVigente({ brand: "WINRUN", design: "R380", sizeLabel: "205/55R16", quantity: 4, salePriceWithTax: 124.76 }))
      .toBe(" · 4 × WINRUN R380 205/55R16 a $124.76 c/u");
  });

  it("guardian_no_vende_solo: la cuenta es un dato ya dicho (sus cifras son de la pieza), no una oferta nueva", () => {
    const borrador = "Listo, le cotizo la *KENDA KR50* — *$188.69 c/u con IVA* 👍";
    const correccion = "Listo, le cotizo la *KENDA KR50* — 2 × $251.59 + 2 × $100.64 = $704.46 (−60 % en la 2.ª llanta) 👍";
    const r = frenarHechosNuevosDelGuardian(borrador, correccion, [], "", [251.59, 100.64, 704.46, 603.2]);
    expect(r.bloqueado).toBe(false);
  });
});

describe("el candado después del Guardián", () => {
  const lineas = [{
    nombre: "KENDA KR50", hoyConIva: 188.69, listaConIva: 251.59, cantidad: 4,
    segunda: temporada.segundaLlantaDe(promo, "KENDA", 4, { hoyConIva: 188.69, listaConIva: 251.59 }, NOVIEMBRE)!,
  }];
  const cuenta = "2 × $251.59 + 2 × $100.64 = $704.46 (−60 % en la 2.ª llanta)";

  it("caso 39909: el borrador «$188.69 c/u» y la corrección «$251.59 c/u» salen con la cuenta", () => {
    expect(sinPrecioPorLlantaConPromo("Listo, le cotizo la *KENDA KR50* — *$188.69 c/u con IVA* 👍", lineas).texto)
      .toBe(`Listo, le cotizo la *KENDA KR50* — *${cuenta}* 👍`);
    const r = sinPrecioPorLlantaConPromo("Su cotización queda en $251.59 c/u con IVA.", lineas);
    expect(r.texto).toBe(`Su cotización queda en ${cuenta}.`);
    expect(r.cambios).toHaveLength(1);
  });

  it("quita el «· 4 = $T» pegado, que ya no cuadra", () => {
    expect(sinPrecioPorLlantaConPromo("La KR50: $188.69 c/u · 4 = $754.76", lineas).texto).toBe(`La KR50: ${cuenta}`);
  });

  it("no toca Winrun, ni un c/u que no es de ninguna línea con promo, ni un texto de otra cantidad", () => {
    expect(sinPrecioPorLlantaConPromo("Winrun $124.76 c/u · 4 = $499.04", lineas).texto).toBe("Winrun $124.76 c/u · 4 = $499.04");
    expect(sinPrecioPorLlantaConPromo("Con 1 llanta: $188.69 c/u con IVA", lineas).texto).toBe("Con 1 llanta: $188.69 c/u con IVA");
    expect(sinPrecioPorLlantaConPromo("3 llantas a $188.69 c/u", lineas).texto).toBe("3 llantas a $188.69 c/u");
    expect(sinPrecioPorLlantaConPromo("Una sola llanta cuesta $188.69 c/u con IVA", lineas).texto).toBe("Una sola llanta cuesta $188.69 c/u con IVA");
    expect(sinPrecioPorLlantaConPromo("Tres llantas, a $188.69 c/u", lineas).texto).toBe("Tres llantas, a $188.69 c/u");
    // …pero hablando de las 4 de la cotización, sí se reescribe.
    expect(sinPrecioPorLlantaConPromo("Las 4 llantas quedan a $188.69 c/u", lineas).texto).toContain("2 × $251.59");
  });

  it("sin líneas con promo no hace nada", () => {
    expect(sinPrecioPorLlantaConPromo("$188.69 c/u", []).texto).toBe("$188.69 c/u");
  });
});

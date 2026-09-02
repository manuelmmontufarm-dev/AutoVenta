/**
 * LA EQUIVALENTE SE OFRECE CON UNA PREGUNTA CLARA Y EL «OK» LA COTIZA.
 *
 * Producción, 1-sep-2026, conv 13635 (593995548655), con los textos reales:
 *
 *   17:34  CLIENTE: «Bueno, bonito y barato»
 *   17:34  BOT:     «La opción más “bueno, bonito y barato” sería la WINRUN R380
 *                    en 215/65R16, $85.52 c/u con IVA, si acepta equivalente.»
 *                   «¿Quiere que le envíe esa opción equivalente para revisar?»
 *   17:35  CLIENTE: «Ok»
 *   17:36  BOT:     «Le preparo la cotización por 4 WINRUN R380 en medida
 *                    equivalente 215/65R16. Precio referencial: $85.52 c/u con
 *                    IVA, total 4 llantas: $342.08. …»          ← sin cotización
 *   17:38  BOT:     «Como usted busca algo *bueno, bonito y barato*, la opción
 *                    recomendada es *WINRUN R330* en *205/55R16*, si acepta esa
 *                    equivalente.»                              ← sin pregunta
 *   17:39  CLIENTE: «Ok»  → opciones otra vez + menú otra vez.
 *
 * Tabla `quotes` de la conversación: cero filas.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  anunciaCotizacion,
  preguntaDeEquivalente,
  sinCotizacionPrometida,
} from "../src/domain/equivalentePendiente.js";
import { sinPreguntasProhibidas } from "../src/domain/preguntasProhibidas.js";
import { ofertaDeCotizacionAceptada, ofertaDeCotizarAceptada } from "../src/domain/ofertaAceptada.js";
import { respuestaDePreferencia } from "../src/domain/salesIntent.js";
import { estructurarTurno } from "../src/domain/estructuraDelTurno.js";

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
  process.env.ADMIN_KEY ||= "test";
  process.env.OWNER_KEY ||= "test";
  qm = await import("../src/services/quoteMessages.js");
});

const PREGUNTA = preguntaDeEquivalente({ recomendacion: "WINRUN R380", medida: "215/65R16" });

describe("la pregunta de consentimiento de la equivalente", () => {
  it("nombra la llanta y SU medida, y es una pregunta", () => {
    expect(PREGUNTA).toBe("¿Le cotizo la *WINRUN R380* en *215/65R16*? 😊");
    expect(preguntaDeEquivalente({ recomendacion: "KENDA KR33A", medida: null })).toBe("¿Le cotizo la *KENDA KR33A*? 😊");
  });

  it("sobrevive al candado de preguntas prohibidas (no pide permiso para la CANTIDAD)", () => {
    const r = sinPreguntasProhibidas(`Yo iría por la *WINRUN R380* — $85.52 c/u con IVA: es la de mejor precio.\n---\n${PREGUNTA}`);
    expect(r.quitadas).toHaveLength(0);
    expect(r.texto).toContain(PREGUNTA);
  });

  it("EL «OK» QUE LE SIGUE ES UN SÍ A COTIZAR (los dos detectores)", () => {
    for (const acuse of ["Ok", "ok", "sí", "dale", "listo", "bueno", "👍"]) {
      expect(ofertaDeCotizacionAceptada(PREGUNTA, acuse), acuse).toBe(true);
      expect(ofertaDeCotizarAceptada(PREGUNTA, acuse), acuse).toBe(true);
    }
    expect(ofertaDeCotizacionAceptada(PREGUNTA, "no")).toBe(false);
    expect(ofertaDeCotizacionAceptada(PREGUNTA, "no gracias, quiero la mía exacta")).toBe(false);
  });

  it("«¿Se la cotizo?» a secas y «¿Se las cotizo?» también abren la cotización", () => {
    expect(ofertaDeCotizacionAceptada("Es la única que tengo: *KENDA KR20*. ¿Se la cotizo? 😊", "Ok")).toBe(true);
    expect(ofertaDeCotizacionAceptada("¿Se las cotizo por 4 llantas?", "dale")).toBe(true);
  });

  it("EL CASO QUE FALLÓ: la frase sin pregunta del 17:38 NO era una oferta de cotizar, y por eso el «Ok» se perdió", () => {
    const sinPregunta =
      "Como usted busca algo *bueno, bonito y barato*, la opción recomendada es *WINRUN R330* en *205/55R16*, si acepta esa equivalente.";
    expect(ofertaDeCotizacionAceptada(sinPregunta, "Ok")).toBe(false);
    // Y la del 17:34 ofrecía «enviar la opción para revisar», no cotizar.
    expect(ofertaDeCotizacionAceptada("¿Quiere que le envíe esa opción equivalente para revisar?", "Ok")).toBe(false);
  });

  it("«Bueno, bonito y barato» es la preferencia de precio", () => {
    expect(respuestaDePreferencia("Bueno, bonito y barato")).toBe("precio");
  });
});

describe("el cierre de opciones cuando la recomendada es equivalente", () => {
  it("entrega la recomendación Y la pregunta, en mensajes distintos", () => {
    const cierre = qm.buildCierreOpciones({
      entregarRecomendacion: true,
      recomendacion: "WINRUN R380",
      motivo: "es la de mejor precio de las tres",
      precioConIva: 85.52,
      hayEquivalentes: true,
      equivalentePendiente: { medida: "215/65R16" },
    });
    const bloques = qm.splitBlocks(cierre);
    expect(bloques).toHaveLength(2);
    expect(bloques[0]).toBe("Yo iría por la *WINRUN R380* — $85.52 c/u con IVA: es la de mejor precio de las tres.");
    expect(bloques[1]).toBe(PREGUNTA);
    expect(cierre).not.toMatch(/si acepta/i);
  });

  it("y la forma fija del turno deja esa pregunta sola al final", () => {
    const turno = [
      "⚠️ Ojo: en *205/65R16* no me queda disponibilidad exacta. Estas son *equivalentes* de su aro: R380 en 215/65R16. Se confirma el calce al montar.",
      "Yo iría por la *WINRUN R380* — $85.52 c/u con IVA: es la de mejor precio de las tres.",
      PREGUNTA,
    ].join("\n---\n");
    const forma = estructurarTurno(turno);
    const bloques = qm.splitBlocks(forma.texto);
    expect(bloques.at(-1)).toBe(PREGUNTA);
    expect(bloques).toHaveLength(2);
  });

  it("con medida exacta el cierre sigue igual que antes: recomendación sin pregunta (la cotización sale sola)", () => {
    const cierre = qm.buildCierreOpciones({
      entregarRecomendacion: true,
      recomendacion: "KENDA KR203",
      motivo: "es el mejor equilibrio",
      precioConIva: 65.65,
    });
    expect(cierre).toBe("Yo iría por la *KENDA KR203* — $65.65 c/u con IVA: es el mejor equilibrio.");
  });
});

describe("la cotización que no existe no se anuncia", () => {
  const PROMESA_1736 =
    "Le preparo la cotización por 4 WINRUN R380 en medida equivalente 215/65R16.\n\nPrecio referencial: $85.52 c/u con IVA, total 4 llantas: $342.08.\n\nIncluye instalación, alineación, balanceo, seguro gratuito por daños, mantenimiento cada 10.000 km y revisión gratuita del vehículo.";
  const PROMESA_1737 =
    "Listo, para atenderle en *Depot Tire Quito Sur*.\n---\nPara *205/65R16* exacta no me sale stock disponible ahora; la alternativa económica disponible es *WINRUN R380* en *215/65R16* a *$85.52 c/u con IVA*, sujeta a verificación de calce en tienda.\n---\nLe preparo la cotización por *4 WINRUN R380* para *Depot Tire Quito Sur*.";

  it("reconoce las dos promesas reales (rescate y corrección del guardián)", () => {
    expect(anunciaCotizacion(PROMESA_1736)).toBe(true);
    expect(anunciaCotizacion(PROMESA_1737)).toBe(true);
  });

  it("NO confunde la pregunta de consentimiento ni la recomendación con una promesa", () => {
    expect(anunciaCotizacion(PREGUNTA)).toBe(false);
    expect(anunciaCotizacion("Yo iría por la *WINRUN R380* — $85.52 c/u con IVA: es la de mejor precio de las tres.")).toBe(false);
  });

  it("NI el saludo fijo, NI una oferta, NI una pregunta son promesas (simulador 1-sep: le recortó la pregunta de la medida al saludo)", () => {
    const saludo =
      "¡Hola, Cliente! 👋 Soy el asistente de Depot Tire. Le cotizo al instante con stock y precios reales, comparo modelos y le armo su cotización para tienda.\n\nPuede mandarme la medida escrita, una foto del costado de la llanta o decirme su vehículo.\n---\n¿Qué medida usa? Ej: 225/65R17";
    expect(anunciaCotizacion(saludo)).toBe(false);
    expect(sinCotizacionPrometida(saludo, PREGUNTA)).toEqual({ texto: saludo, corregido: false });
    expect(anunciaCotizacion("Con gusto 😊 Si desea, le dejo la cotización formal por *4 llantas KENDA KR628*.")).toBe(false);
    expect(anunciaCotizacion("¿Le preparo la cotización por 4?")).toBe(false);
    expect(anunciaCotizacion("Puedo dejarle la cotización de una vez.")).toBe(false);
  });

  it("quita la promesa y cierra con la pregunta de consentimiento", () => {
    const r = sinCotizacionPrometida(PROMESA_1737, PREGUNTA);
    expect(r.corregido).toBe(true);
    expect(r.texto).not.toMatch(/le preparo la cotizaci/i);
    expect(r.texto).toContain("Quito Sur");
    expect(r.texto).toContain("$85.52");
    expect(r.texto.trim().endsWith(PREGUNTA)).toBe(true);
  });

  it("si todo el turno era promesa, sale solo la pregunta", () => {
    const r = sinCotizacionPrometida(PROMESA_1736, PREGUNTA);
    expect(r.corregido).toBe(true);
    expect(r.texto).toBe(PREGUNTA);
  });

  it("si el turno ya termina en pregunta, no agrega otra", () => {
    const r = sinCotizacionPrometida(`${PROMESA_1736}\n---\n¿Le queda mejor Cumbayá o Quito Sur?`, PREGUNTA);
    expect(r.corregido).toBe(true);
    expect(r.texto).toBe("¿Le queda mejor Cumbayá o Quito Sur?");
  });

  it("un texto sin promesa sale intacto", () => {
    const sano = "Su cotización sigue vigente 👍\n---\n¿Qué día le queda bien pasar por *Depot Tire Quito Sur*?";
    expect(anunciaCotizacion(sano)).toBe(false);
    expect(sinCotizacionPrometida(sano, PREGUNTA)).toEqual({ texto: sano, corregido: false });
  });
});

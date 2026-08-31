/**
 * «GRACIAS» DESPUÉS DE UNA OFERTA ES UN SÍ.
 *
 * Producción, 27-ago-2026, conv 11070, con los textos reales:
 *
 *   10:00  BOT: «La más económica en 245/70R16 es *KENDA KR628* a *$144.44 c/u
 *          con IVA*. Se la puedo cotizar por *4 llantas*…»
 *   10:00  CLIENTE: «Gracias»
 *   10:00  BOT: «Con gusto 😊 Si desea, le dejo la cotización formal por
 *          *4 llantas KENDA KR628*…»
 *
 * Dos turnos, la misma oferta, cero cotizaciones.
 */
import { describe, expect, it } from "vitest";
import {
  esAcuseSimple,
  ofertaDeCotizacionAceptada,
  ofertaDeCotizacionVigenteAceptada,
  ofertaDeCotizarAceptada,
  ordenDeCotizarYa,
} from "../src/domain/ofertaAceptada.js";

const OFERTA_REAL =
  "La más económica en 245/70R16 es *KENDA KR628* a *$144.44 c/u con IVA*.\n" +
  "Se la puedo cotizar por *4 llantas*; si prefiere equilibrio o premium, también le paso esa.";

describe("el «gracias» que era un sí", () => {
  it("EL CASO QUE FALLÓ: la oferta real de la conv 11070 con «Gracias»", () => {
    expect(ofertaDeCotizarAceptada(OFERTA_REAL, "Gracias")).toBe(true);
  });

  it("los otros acuses que la gente escribe", () => {
    for (const acuse of [
      "gracias", "Gracias!", "muchas gracias", "ok", "Okey", "listo", "dale",
      "ya", "bueno", "perfecto", "claro", "de una", "hagale", "porfa", "👍",
      "si", "grax", "gracias amigo",
    ]) expect(ofertaDeCotizarAceptada(OFERTA_REAL, acuse), acuse).toBe(true);
  });

  it("EL CASO QUE NO DEBE DISPARAR: sin oferta previa, un «gracias» es solo un gracias", () => {
    expect(ofertaDeCotizarAceptada("¿A cuál local le queda mejor ir?", "Gracias")).toBe(false);
    expect(ofertaDeCotizarAceptada(null, "Gracias")).toBe(false);
    // Y un mensaje del bot que ya cotizó tampoco es una oferta.
    expect(ofertaDeCotizarAceptada("Aquí le mando su cotización 👍", "Gracias")).toBe(false);
  });

  it("EL BORDE: un «gracias» con algo más NO es una aceptación a secas", () => {
    // Trae una pregunta que hay que contestar; forzar la cotización sería
    // ignorarla, que es justo el otro error del guardián.
    expect(ofertaDeCotizarAceptada(OFERTA_REAL, "gracias, ¿y en aro 17 tienen?")).toBe(false);
    expect(ofertaDeCotizarAceptada(OFERTA_REAL, "gracias pero mejor 2 llantas")).toBe(false);
    // Y la despedida la agarra cierrePerdido.ts, no esto.
    expect(ofertaDeCotizarAceptada(OFERTA_REAL, "Gracias ya compré en otro lugar")).toBe(false);
  });

  it("un no corto sigue siendo un no", () => {
    for (const no of ["no", "No gracias", "todavia no", "mejor no", "otro dia", "luego"]) {
      expect(ofertaDeCotizarAceptada(OFERTA_REAL, no), no).toBe(false);
    }
  });

  it("la orden que se le mete al modelo le prohíbe volver a ofrecer", () => {
    const orden = ordenDeCotizarYa("Gracias");
    expect(orden).toMatch(/ENTREGA ESO MISMO EN ESTE TURNO/);
    expect(orden).toMatch(/generar_cotizacion/);
    expect(orden).toMatch(/preparar_opciones/);
    expect(orden).toMatch(/PROHIBIDO volver a ofrecer lo mismo/);
    expect(orden).toMatch(/«Gracias»/);
  });

  /**
   * EL SEGUNDO CASO REAL, conv 11001 del 26-ago. El bot ofreció OPCIONES, no
   * una cotización, y la primera versión de este detector solo miraba la
   * palabra «cotización»:
   *
   *   15:05  BOT: «Perfecto, sin problema 👍 Si quiere, le dejo 2–3 opciones
   *          para esa medida y usted compara costo, equilibrio o premium.»
   *   15:20  CLIENTE: «Ok gracias»
   *   15:20  BOT: «Con gusto. Si luego quiere comparar opciones para esa
   *          medida, se las dejo al toque.»
   *
   * Ahí murió la conversación: nunca vio una opción.
   */
  it("EL OTRO CASO QUE FALLÓ: ofrecer OPCIONES también cuenta", () => {
    const oferta = "Perfecto, sin problema 👍\nSi quiere, le dejo 2–3 opciones para esa medida y usted compara costo, equilibrio o premium.";
    expect(ofertaDeCotizarAceptada(oferta, "Ok gracias")).toBe(true);
    expect(ofertaDeCotizarAceptada(oferta, "dale")).toBe(true);
    // Y un no sigue siendo un no.
    expect(ofertaDeCotizarAceptada(oferta, "no gracias")).toBe(false);
    expect(ofertaDeCotizacionAceptada(oferta, "Ok gracias")).toBe(false);
  });

  it("ofrecer una comparación también cuenta", () => {
    const oferta = "Si desea le preparo una comparación de las dos para que elija tranquilo.";
    expect(ofertaDeCotizarAceptada(oferta, "listo")).toBe(true);
    expect(ofertaDeCotizacionAceptada(oferta, "listo")).toBe(false);
  });

  it("solo una oferta de cotización autoriza firmarla con un acuse", () => {
    expect(ofertaDeCotizacionAceptada(OFERTA_REAL, "Ok")).toBe(true);
    expect(ofertaDeCotizacionAceptada("Aquí le mando su cotización 👍", "Ok")).toBe(false);
  });
});


/**
 * LA OFERTA NO CADUCA POR UNA PREGUNTA EN EL MEDIO.
 *
 * Corrida T115, 30-ago-2026, conv 9684 (ancla H04), textos reales:
 *
 *   BOT: «¿Le cotizo el juego de 4 llantas?»
 *   CLIENTE: [foto: 195/55R15 85V]
 *   BOT: «Opciones enviadas… ¿qué prioriza usted?»
 *   CLIENTE: «Es precio es fijo»
 *   BOT: «Sí, esos precios ya son finales con IVA…»
 *   CLIENTE: «Ok»   ← esto ES aceptar la oferta que sigue viva
 *
 * El detector viejo solo miraba el último saliente y el «Ok» no autorizó
 * nada: la conversación entera terminó sin cotización.
 */
describe("ofertaDeCotizacionVigenteAceptada", () => {
  const conversacion9684 = [
    { role: "assistant", content: "Para Corsa Evolution le recomendaría la Kenda KR20. ¿Le cotizo el juego de 4 llantas?" },
    { role: "user", content: "[Foto: 195/55R15 85V]" },
    { role: "assistant", content: "Opciones enviadas: KENDA KR20 · KENDA KR203 · WINRUN R330. ¿Qué prioriza usted?" },
    { role: "user", content: "Es precio es fijo" },
    { role: "assistant", content: "Sí, esos precios ya son finales con IVA por llanta según la opción." },
    { role: "user", content: "Ok" },
  ];

  it("un «Ok» acepta la oferta que quedó dos turnos atrás", () => {
    expect(ofertaDeCotizacionVigenteAceptada(conversacion9684, "Ok")).toBe(true);
  });

  it("una negativa en el medio mata la oferta", () => {
    const conRechazo = [
      ...conversacion9684.slice(0, 3),
      { role: "user", content: "no gracias" },
      { role: "assistant", content: "Entendido, quedamos a las órdenes." },
      { role: "user", content: "👍🏻" },
    ];
    expect(ofertaDeCotizacionVigenteAceptada(conRechazo, "👍🏻")).toBe(false);
  });

  it("una oferta de hace más de dos mensajes del cliente ya no vive", () => {
    const vieja = [
      { role: "assistant", content: "¿Le cotizo el juego de 4 llantas?" },
      { role: "user", content: "¿Y tienen aro 17?" },
      { role: "assistant", content: "Sí, tenemos varias en aro 17." },
      { role: "user", content: "¿Y en qué horario atienden?" },
      { role: "assistant", content: "De 08:30 a 17:30." },
      { role: "user", content: "¿Hacen envíos?" },
      { role: "assistant", content: "Solo en la ciudad." },
      { role: "user", content: "Ok" },
    ];
    expect(ofertaDeCotizacionVigenteAceptada(vieja, "Ok")).toBe(false);
  });

  it("un acuse con pedido nuevo no dispara nada", () => {
    expect(ofertaDeCotizacionVigenteAceptada(conversacion9684, "Ok, ¿y en aro 17?")).toBe(false);
  });

  it("sin ninguna oferta previa, el acuse no autoriza", () => {
    const sinOferta = [
      { role: "assistant", content: "Su visita quedó registrada para el domingo." },
      { role: "user", content: "Ok" },
    ];
    expect(ofertaDeCotizacionVigenteAceptada(sinOferta, "Ok")).toBe(false);
  });
});


describe("esAcuseSimple y las señales de comparación", () => {
  it.each(["Gracias", "Ok", "👍🏻", "Listo"])("«%s» es un acuse", (t) => {
    expect(esAcuseSimple(t)).toBe(true);
  });

  it.each(["Ok, ¿y en aro 17?", "No gracias", "Quito sur"])("«%s» no lo es", (t) => {
    expect(esAcuseSimple(t)).toBe(false);
  });

  it("«Boy a mirar aca en ibarra» (typo real de 9887) mata la oferta pendiente", () => {
    const conComparacion = [
      { role: "assistant", content: "¿Le cotizo el juego de 4 llantas?" },
      { role: "user", content: "Boy a mirar aca en ibarra" },
      { role: "assistant", content: "Perfecto, coordine con el local." },
      { role: "user", content: "Gracias" },
    ];
    expect(ofertaDeCotizacionVigenteAceptada(conComparacion, "Gracias")).toBe(false);
  });
});

/**
 * CUANDO EL CLIENTE DICE QUE SÍ, PASA LO QUE EL BOT OFRECIÓ.
 *
 * Auditoría del 13 al 18-sep-2026, familia 1 (7 chats, 3 graves). Textos reales:
 *
 *   conv 19710 · 14-sep 10:47 UTC
 *     BOT: «¿Prefiere que avancemos con esta opción *M/T* para su medida 285/75R16? 😊»
 *     CLIENTE: «Sí por favor»
 *     → `generar_cotizacion` bloqueada: la pregunta era «¿Se la cotizo?» reescrita
 *       por el guardián y el verbo ya no era cotizar.
 *
 *   conv 19879 · 16-sep 14:32 UTC (y captura de Joaquín del 16-sep)
 *     BOT: «Le puedo compartir la ubicación de nuestros locales para que vea cuál le queda mejor.»
 *     CLIENTE: «Ok»
 *     → los mapas nunca salieron; el bot repitió el descuento en efectivo.
 */
import { describe, expect, it } from "vitest";
import {
  ofertaDeCotizacionAceptada,
  ofertaDeCotizacionVigenteAceptada,
} from "../src/domain/ofertaAceptada.js";
import { ofrecioLaUbicacion } from "../src/domain/ubicacionPedida.js";

const PREGUNTA_DEL_GUARDIAN =
  "¿Prefiere que avancemos con esta opción *M/T* para su medida 285/75R16? 😊";

describe("la pregunta de opción única reescrita sigue siendo una oferta de cotizar", () => {
  it("«Sí por favor» a «¿Prefiere que avancemos con esta opción…?» autoriza la cotización", () => {
    expect(ofertaDeCotizacionAceptada(PREGUNTA_DEL_GUARDIAN, "Sí por favor")).toBe(true);
  });

  it("la variante de la conv 20427 también", () => {
    expect(ofertaDeCotizacionAceptada(
      "¿Prefiere que avancemos con esta opción económica para uso diario en ciudad? 😊", "Ok",
    )).toBe(true);
  });

  it("vale con el mensaje del cliente ya guardado al final del historial", () => {
    expect(ofertaDeCotizacionVigenteAceptada([
      { role: "assistant", content: PREGUNTA_DEL_GUARDIAN },
      { role: "user", content: "Sí por favor" },
    ], "Sí por favor")).toBe(true);
  });

  it("un «no» sigue siendo un no", () => {
    expect(ofertaDeCotizacionAceptada(PREGUNTA_DEL_GUARDIAN, "No gracias")).toBe(false);
  });

  it("«avanzar con la visita» sin pregunta sobre una llanta no es oferta de cotizar", () => {
    expect(ofertaDeCotizacionAceptada(
      "Si le sirve esta opción, puedo ayudarle a avanzar con la visita a cualquiera de nuestros locales.", "Ok",
    )).toBe(false);
  });
});

describe("el bot ofreció los mapas", () => {
  it("reconoce la oferta real de la conv 19879", () => {
    expect(ofrecioLaUbicacion(
      "Perfecto. El descuento por pago en efectivo se lo confirman directamente en el local.\n\n"
      + "Le puedo compartir la ubicación de nuestros locales para que vea cuál le queda mejor.",
    )).toBe(true);
    expect(ofrecioLaUbicacion("Le comparto las ubicaciones de nuestros locales, sin compromiso.")).toBe(true);
  });

  it("hablar de los locales sin ofrecer el mapa no cuenta", () => {
    expect(ofrecioLaUbicacion("El descuento se lo confirman en el local.")).toBe(false);
    expect(ofrecioLaUbicacion("¿A cuál local le queda mejor ir, Cumbayá o Quito Sur?")).toBe(false);
  });
});

describe("entregar la cotización no es ofrecerla", () => {
  const ENTREGA = "La opción premium es la *KENDA KR628* — *$157.57 c/u con IVA*. Le dejo la cotización 👍";
  it("un «Ok» dos mensajes después de la entrega no reabre la cotización (simulador, guion de la conv 19879)", () => {
    expect(ofertaDeCotizacionVigenteAceptada([
      { role: "assistant", content: ENTREGA },
      { role: "assistant", content: "¿A cuál local le queda mejor pasar?" },
      { role: "user", content: "Al contado cuanto es el descuento" },
      { role: "assistant", content: "Su cotización ya trae el *25 %* de descuento, que son *$52.52* por llanta." },
      { role: "user", content: "Ok" },
    ], "Ok")).toBe(false);
    expect(ofertaDeCotizacionAceptada(ENTREGA, "Ok")).toBe(false);
  });
  it("la oferta de verdad sigue valiendo", () => {
    expect(ofertaDeCotizacionAceptada("Si desea, le dejo la cotización formal por *4 llantas KENDA KR628*.", "Ok")).toBe(true);
    expect(ofertaDeCotizacionAceptada("¿Se la cotizo? 😊", "dale")).toBe(true);
  });
});

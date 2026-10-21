/**
 * UN SOLO DUEÑO DE «ESTE CLIENTE NO QUIERE SEGUIMIENTO» (auditoría 19-oct-2026,
 * familia 6). El Guardián corrigió o suprimió 30 seguimientos a clientes que ya
 * se habían ido —se paga la redacción y la revisión para no mandar nada— y en
 * 27914 el bot volvió a ofrecer dos veces.
 *
 * `motivoParaNoSeguir` decide con lo que el cliente DIJO (sus dos últimos
 * mensajes del ciclo) y con dónde está (`porQueNoPasaPorElLocal`).
 * `services/followUps.ts` lo consulta al agendar y al enviar, y cancela el job
 * con este motivo (`no_quiere_seguimiento:<motivo>`).
 */
import { describe, expect, it } from "vitest";
import { motivoParaNoSeguir, sinVisitaDelSeguimiento } from "../src/domain/sinSeguimiento.js";
import { buildContextualFollowUpMessage } from "../src/domain/followUpMessages.js";

describe("motivoParaNoSeguir — los chats de la auditoría", () => {
  it("27914: «Cuando lo tenga me avisa» → espera que le avisen; no hay seguimiento", () => {
    expect(motivoParaNoSeguir({
      ultimo: "Para que voy sino tiene las llantas que me interesa. Cuando lo tenga me avisa",
    })).toBe("espera_que_le_avisen");
  });

  it("27914: y el «Ok» que viene después tampoco reabre el seguimiento", () => {
    expect(motivoParaNoSeguir({
      ultimo: "Ok",
      anterior: "Para que voy sino tiene las llantas que me interesa. Cuando lo tenga me avisa",
    })).toBe("espera_que_le_avisen");
  });

  it("cualquier acuse que reconoce `esAcuseSimple` mantiene el motivo del mensaje anterior", () => {
    const anterior = "Para que voy sino tiene las llantas que me interesa. Cuando lo tenga me avisa";
    for (const ultimo of ["Okey gracias 👍🏻", "Siii", "ok si", "👍", "Ok gracias"]) {
      expect(motivoParaNoSeguir({ ultimo, anterior }), ultimo).toBe("espera_que_le_avisen");
    }
  });

  it("22876: «Opté por otro distribuidor por el precio» → compró en otro lado", () => {
    expect(motivoParaNoSeguir({
      ultimo: "Buen día. Me disculpo por no contestar a tiempo. Opté por otro distribuidor por el precio. Agradezco su tiempo y buena disposición. Una buena tarde.",
    })).toBe("compro_en_otro_lugar");
  });

  it("27292: «Ok gracias» de quien dijo que vive en Ambato → fuera de cobertura", () => {
    expect(motivoParaNoSeguir({
      ultimo: "Ok gracias",
      anterior: "Soy de Ambato",
      sinVisita: "fuera_de_cobertura",
    })).toBe("fuera_de_cobertura");
  });

  it("«ya compré» → compra terminada; «yo le aviso» → el cliente avisa", () => {
    expect(motivoParaNoSeguir({ ultimo: "ya compré" })).toBe("cierre_del_cliente");
    expect(motivoParaNoSeguir({ ultimo: "Ok, yo le aviso" })).toBe("el_cliente_avisa");
  });
});

describe("motivoParaNoSeguir — lo que SÍ lleva seguimiento", () => {
  it("quien pidió precio y no contestó", () => {
    expect(motivoParaNoSeguir({ ultimo: "Precio de la 205 60 14" })).toBeNull();
  });

  it("un «Ok gracias» de alguien en Quito no es una despedida", () => {
    expect(motivoParaNoSeguir({ ultimo: "Ok gracias", sinVisita: null })).toBeNull();
  });

  it("29177: fuera de Quito CON cotización sí sigue, como compra a distancia (pago y envío)", () => {
    expect(motivoParaNoSeguir({ ultimo: "👍", sinVisita: "fuera_de_cobertura", hayCotizacion: true })).toBeNull();
    expect(sinVisitaDelSeguimiento("fuera_de_cobertura", true)).toBe("compra_a_distancia");
    expect(sinVisitaDelSeguimiento("fuera_de_cobertura", false)).toBe("fuera_de_cobertura");
    expect(sinVisitaDelSeguimiento(null, true)).toBeNull();
  });

  it("y el texto que sale le habla de pago y envío, sin local ni día", () => {
    const texto = buildContextualFollowUpMessage({
      stage: "cotizacion_enviada", tireSize: "265/70R16", quoteNumber: "COT-1",
      sinVisita: sinVisitaDelSeguimiento("fuera_de_cobertura", true),
      storeLinks: "📍 *Depot Tire Cumbayá*: https://maps.app.goo.gl/x",
    }, "in_window_first");
    expect(texto).toMatch(/pago y envío/);
    expect(texto).not.toMatch(/qu[eé] d[ií]a|cu[aá]l local|maps\.app/i);
  });

  it("quien compra a distancia sigue con su seguimiento de pago y envío", () => {
    expect(motivoParaNoSeguir({ ultimo: "Ok gracias", sinVisita: "compra_a_distancia" })).toBeNull();
  });

  it("«cuando tenga la medida le aviso, ¿abren el sábado?» es una pregunta viva", () => {
    expect(motivoParaNoSeguir({ ultimo: "cuando tenga la medida le aviso, ¿abren el sábado?" })).toBeNull();
  });
});

/**
 * FAMILIAS C y D de la auditoría del 2-6 sep-2026 (corrida 2).
 *
 * C · Contestó el menú y el bot ofrece otro escalón, o pierde la respuesta.
 *     Conv 15193: «Premium» → «¿Le cotizo la KENDA KR20?» (la del medio).
 *     Conv 14577: «Costo» → «¿Le cotizo la FALKEN WILDPEAK A/T 4W?» → cotizó
 *     la premium por $833.92 cuando la de costo eran $777.20.
 * D · Un acuse corto se lee como «sí, cotíceme».
 *     Conv 14506: «Listo» a la imagen de opciones → cotización de la Falken.
 *     Conv 16277: «No me interesa» cierra, «👍» reabre y sale una cotización
 *     por $511.72. Conv 15143: «Unas más económicas por favor» → la misma
 *     única Falken cotizada por segunda vez. Conv 14687: «Ok» a «¿Le muestro
 *     alternativas en aro 17?» → cotización de una 205/55R16 que nunca vio.
 */
import { describe, expect, it } from "vitest";
import {
  ofertaDeCotizacionAceptada,
  ofertaDeCotizacionVigenteAceptada,
  ofertaDeCotizarAceptada,
} from "../src/domain/ofertaAceptada.js";
import {
  escalonContestado,
  pideAlternativaMasBarata,
  respuestaDePreferencia,
} from "../src/domain/salesIntent.js";
import {
  equivalenteSinConsentimiento,
  productoDeConsentimiento,
} from "../src/domain/equivalentePendiente.js";

const SALUDO =
  "¡Hola, Rolando! 👋 Soy el asistente de Depot Tire. Le cotizo al instante con stock y precios reales, comparo modelos y le armo su cotización para tienda.";
const MENU =
  "Para afinarle la recomendación sobre las opciones que le envié, dígame una sola cosa: ¿qué prioriza usted?\n\n1) *Costo* — la más conveniente de precio\n2) *Equilibrio* — la que mejor balancea precio y rendimiento\n3) *Premium* — la de máxima calidad y durabilidad";

describe("D · el saludo no es una oferta de cotizar", () => {
  it("«Listo» después de la presentación no autoriza nada (conv 14506)", () => {
    expect(ofertaDeCotizacionAceptada(SALUDO, "Listo")).toBe(false);
    expect(ofertaDeCotizarAceptada(SALUDO, "Listo")).toBe(false);
  });

  it("ni el «👍» al saludo del ciclo reabierto (conv 16277)", () => {
    const historial = [
      { role: "assistant", content: SALUDO },
      { role: "user", content: "👍" },
    ];
    expect(ofertaDeCotizacionVigenteAceptada(historial, "👍")).toBe(false);
  });

  it("ni «Por favor» dos mensajes después del saludo (conv 15143)", () => {
    const historial = [
      { role: "assistant", content: SALUDO },
      { role: "user", content: "P235/75R15 AT Todo terreno" },
      { role: "assistant", content: "¿Qué medida usa? Ej: 225/65R17" },
      { role: "user", content: "Por favor" },
    ];
    expect(ofertaDeCotizacionVigenteAceptada(historial, "Por favor")).toBe(false);
  });

  it("una oferta de verdad sigue valiendo con el mismo acuse", () => {
    expect(ofertaDeCotizacionAceptada("¿Le cotizo la *KENDA KR20* en *205/50R16*? 😊", "Listo")).toBe(true);
    expect(ofertaDeCotizacionAceptada("Se la puedo cotizar por *4 llantas*.", "Gracias")).toBe(true);
  });
});

describe("D · «más económicas» pide otra opción, no contesta el menú", () => {
  it.each([
    "Unas más económicas por favor",
    "Necesito algo más economico",
    "Busco otra alternativa más económica",
    "tienen mas baratas?",
  ])("«%s» pide una alternativa más barata", (texto) => {
    expect(pideAlternativaMasBarata(texto)).toBe(true);
    expect(respuestaDePreferencia(texto)).toBeNull();
  });

  it.each(["la más barata", "La más conveniente", "1", "costo", "económica"])(
    "«%s» sigue siendo la respuesta de precio al menú",
    (texto) => {
      expect(pideAlternativaMasBarata(texto)).toBe(false);
      expect(respuestaDePreferencia(texto)).toBe("precio");
    },
  );
});

describe("C · la respuesta al menú con palabras también es determinística", () => {
  it("«Premium», «Costo» y «Equilibrio» tras el menú son el escalón (conv 15193, 14577)", () => {
    expect(escalonContestado("Premium", MENU, null)).toBe("premium");
    expect(escalonContestado("Costo", MENU, null)).toBe("precio");
    expect(escalonContestado("Equilibrio", MENU, null)).toBe("equilibrada");
  });

  it("el número solo cuenta si lo último fue el menú o lo citó", () => {
    expect(escalonContestado("2", MENU, null)).toBe("equilibrada");
    expect(escalonContestado("2", "Cotización enviada por $432.20", null)).toBeNull();
    expect(escalonContestado("2", "Cotización enviada", MENU)).toBe("equilibrada");
  });

  it("una palabra del menú vale aunque lo último no haya sido el menú, si hubo menú en el ciclo", () => {
    expect(escalonContestado("Premium", "📍 Depot Tire Cumbayá: https://maps…", null, { huboMenu: true })).toBe("premium");
    expect(escalonContestado("Premium", "📍 Depot Tire Cumbayá: https://maps…", null, { huboMenu: false })).toBeNull();
  });
});

describe("C · la pregunta de consentimiento nombra el escalón que el cliente eligió", () => {
  const PIEZA_15193 = {
    recomendado: "K217B607",
    escalones: {
      premium: { codigo: "352165", nombre: "FALKEN ZE310R", precio_con_iva: 111.36 },
      equilibrada: { codigo: "K217B607", nombre: "KENDA KR20", precio_con_iva: 91.28 },
      economica: { codigo: "2055516WNR330", nombre: "WINRUN R330", precio_con_iva: 60.67 },
    },
  };

  it("«Premium» → la Falken, no la recomendada de la pieza", () => {
    expect(productoDeConsentimiento(PIEZA_15193, ["Premium"])).toBe("352165");
  });

  it("«Costo» y «1» → la económica (conv 14577)", () => {
    expect(productoDeConsentimiento(PIEZA_15193, ["Costo", "1"])).toBe("2055516WNR330");
  });

  it("sin respuesta al menú, la recomendada de la pieza", () => {
    expect(productoDeConsentimiento(PIEZA_15193, ["¿cuánto dura?"])).toBe("K217B607");
  });

  it("la última respuesta manda si cambió de idea", () => {
    expect(productoDeConsentimiento(PIEZA_15193, ["Premium", "mejor la más barata"])).toBe("2055516WNR330");
  });
});

describe("D · una equivalente no se firma sin su sí (conv 14687)", () => {
  const base = {
    medidaProducto: "205/55R16",
    nombreProducto: "FALKEN ZE310R",
    medidasDelCliente: ["215/50R17"],
  };

  it("«Ok» a «¿Le muestro alternativas?» no autoriza una medida que nunca vio", () => {
    expect(equivalenteSinConsentimiento({
      ...base,
      ultimoMensajeDelBot: "¿Le muestro alternativas disponibles en aro 17?",
      textoDelCliente: "Ok",
    })).toBe(true);
  });

  it("con la pregunta de consentimiento hecha, el «Ok» sí firma", () => {
    expect(equivalenteSinConsentimiento({
      ...base,
      ultimoMensajeDelBot: "¿Le cotizo la *FALKEN ZE310R* en *205/55R16*? 😊",
      textoDelCliente: "Ok",
    })).toBe(false);
  });

  it("si el cliente nombra la llanta o la medida, también", () => {
    expect(equivalenteSinConsentimiento({ ...base, ultimoMensajeDelBot: "…", textoDelCliente: "deme la ze310r" })).toBe(false);
    expect(equivalenteSinConsentimiento({ ...base, ultimoMensajeDelBot: "…", textoDelCliente: "ok la 205/55R16" })).toBe(false);
  });

  it("«Me gusta la Falken» dos turnos antes también la señala (conv 4732, 26-ago)", () => {
    expect(equivalenteSinConsentimiento({
      ...base,
      nombreProducto: "FALKEN WILDPEAK A/T 4W",
      medidaProducto: "235/75R15",
      medidasDelCliente: ["235/70R15"],
      ultimoMensajeDelBot: "Opciones enviadas",
      textoDelCliente: "Ok",
      textosDelCliente: ["Hola llantas 235/70R15", "Me gusta la Falken"],
    })).toBe(false);
  });

  it("una llanta de la medida pedida nunca necesita este consentimiento", () => {
    expect(equivalenteSinConsentimiento({
      ...base,
      medidasDelCliente: ["205/55R16"],
      ultimoMensajeDelBot: "¿Le muestro alternativas?",
      textoDelCliente: "Ok",
    })).toBe(false);
  });
});

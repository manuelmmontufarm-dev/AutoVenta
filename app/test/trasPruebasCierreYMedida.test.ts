/**
 * Pruebas del 12-sep: la visita que se anotaba sin cotización y la medida que
 * el simulador aprobó y producción no.
 */
import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://manue@localhost/postgres";

const { canUseDirectVisitRoute } = await import("../src/services/directSalesRoutes.js");
const { extractCustomerCommitment, esSoloPresenciaEnLaCiudad } = await import("../src/domain/customerCommitment.js");
const { medidaNoDada, medidasDelAro } = await import("../src/domain/medidaConfirmada.js");
const { preguntaDeMedidaPorConfirmar } = await import("../src/services/cotizarLoElegido.js");
const { preguntaDelAncho } = await import("../src/services/medidaIncompleta.js");
const { medidasEnPulgadasCercanas } = await import("../src/domain/catalog.js");

describe("la visita se anota con cotización, no con la etapa", () => {
  it("sin cotización no hay captura aunque el tablero diga seguimiento (caso 10, 17:28)", () => {
    expect(canUseDirectVisitRoute({
      stage: "seguimiento_venta", hasQuote: false, hasExplicitStore: false, hasCommitment: true,
      text: "Yo el lunes voy a estar en quito",
    })).toBe(false);
  });

  it("«voy a estar en Quito» es dónde va a estar, no una visita", () => {
    expect(extractCustomerCommitment("Yo el lunes voy a estar en quito")?.visitDate).toBeUndefined();
  });

  it("la herramienta de agendar tampoco lo toma como visita (simulador, 12-sep)", () => {
    expect(esSoloPresenciaEnLaCiudad("Yo el lunes voy a estar en quito")).toBe(true);
    expect(esSoloPresenciaEnLaCiudad("el lunes voy a estar por allá y paso")).toBe(false);
    expect(esSoloPresenciaEnLaCiudad("paso el lunes a Cumbayá")).toBe(false);
  });

  it("con verbo de visita sí", () => {
    expect(extractCustomerCommitment("el lunes voy a estar por allá y paso")?.visitDate).toBeInstanceOf(Date);
    expect(extractCustomerCommitment("el lunes voy al local")?.visitDate).toBeInstanceOf(Date);
  });
});

describe("una medida que el cliente no dio no se busca (rin 14, 17:32)", () => {
  const CICLO = ["rin 14", "Que opciones tiene y precio del juego"];

  it("con solo el aro, una medida completa es inventada", () => {
    expect(medidaNoDada({ medida: "185/60R14", textos: CICLO, medidaDeLaFicha: null, huboFitment: false })).toBe(14);
  });

  it("si la escribió, la tiene en la ficha o salió de su carro, no", () => {
    expect(medidaNoDada({ medida: "185/60R14", textos: [...CICLO, "185/60R14"], medidaDeLaFicha: null, huboFitment: false })).toBeNull();
    expect(medidaNoDada({ medida: "185/60R14", textos: CICLO, medidaDeLaFicha: "185/60R14", huboFitment: false })).toBeNull();
    expect(medidaNoDada({ medida: "185/60R14", textos: CICLO, medidaDeLaFicha: null, huboFitment: true })).toBeNull();
    expect(medidaNoDada({ medida: "205/55R16", textos: ["hola"], medidaDeLaFicha: null, huboFitment: false })).toBeNull();
  });

  it("las medidas de otro aro dejan de ser «su medida» cuando cambió de aro (Qashqai, 17:39)", () => {
    expect(medidasDelAro(["33X12.50R15", "32X10.50R15", "215/60R17"], 17)).toEqual(["215/60R17"]);
    expect(medidasDelAro(["33X12.50R15"], null)).toEqual(["33X12.50R15"]);
  });
});

describe("la confirmación de medida pide leer el costado", () => {
  it("no le propone una medida para que diga que sí", () => {
    const t = preguntaDeMedidaPorConfirmar({ nombre: "FALKEN ZE310", medida: "215/40R17" });
    expect(t).not.toMatch(/su llanta dice/i);
    expect(t).toMatch(/costado/);
    const bloquesDe = t.split(/\n\s*-{3,}\s*\n/);
    expect(bloquesDe[bloquesDe.length - 1]).not.toMatch(/215\/40R17/);
  });
});

describe("media medida en pulgadas: se pregunta el ancho, sin modelo (30.5 r15, 17:40)", () => {
  it("nombra las de pulgadas que hay y termina preguntando el ancho, sin métricas", () => {
    const t = preguntaDelAncho({ diameter: 30.5, rim: 15 }, ["31X10.50R15", "32X11.50R15"]);
    const bloques = t.split(/\n\s*-{3,}\s*\n/);
    expect(bloques[bloques.length - 1]).toBe("¿Qué ancho dice en el costado de su llanta?");
    expect(t).toMatch(/31X10\.50R15/);
    expect(t).not.toMatch(/\b\d{3}\/\d{2}R15\b/);
  });

  it("las más cercanas primero, solo con stock y sin repetir", () => {
    const items = [
      { stock: 6, sizeLabel: "33X12.50R15" },
      { stock: 0, sizeLabel: "30X9.50R15" },
      { stock: 4, sizeLabel: "31X10.50R15" },
      { stock: 9, sizeLabel: "31X10.50R15" },
      { stock: 2, sizeLabel: "235/75R15" },
    ];
    // La forma canónica del repo va sin ceros de más (formatFlotationSize).
    expect(medidasEnPulgadasCercanas(items, 30.5)).toEqual(["31X10.5R15", "33X12.5R15"]);
  });
});

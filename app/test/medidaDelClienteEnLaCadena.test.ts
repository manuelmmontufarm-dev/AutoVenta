/**
 * FAMILIA 2-H en la cadena de salida: el paso `la_medida_del_cliente_no_se_cuestiona`
 * corre DESPUÉS del Ángel Guardián, en las tres puertas, con la visita real.
 *
 * Conv 12625 (22/23-sep): el cliente escribió 195/55R16 dos veces y salieron
 * cuatro mensajes —respuesta y seguimientos reescritos por el guardián— con
 * «usted llegó por llanta de camioneta y esa medida es de auto… envíeme una
 * foto». Conv 22629: con dos medidas en disputa, la pregunta SÍ sale.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ||= "test";
process.env.WHATSAPP_TOKEN ||= "test";
process.env.WHATSAPP_APP_SECRET ||= "test";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test";
process.env.WHATSAPP_PHONE_ID ||= "test";
process.env.DATABASE_URL ||= "postgresql://localhost/autoventa_medida_falsa";

/** La visita, del más viejo al más nuevo. */
let visita: { direction: "inbound" | "outbound"; content: string }[] = [];

vi.mock("../src/db/client.js", () => ({
  sql: Object.assign(
    async (strings: TemplateStringsArray) => {
      const consulta = strings.join(" ");
      if (!/from messages/.test(consulta)) return [];
      const ahora = Date.now();
      const filas = [...visita].reverse().map((m, i) => ({ ...m, created_at: new Date(ahora - (i + 1) * 30_000) }));
      return /direction='inbound'/.test(consulta) ? filas.filter((f) => f.direction === "inbound") : filas;
    },
    { end: async () => undefined },
  ),
}));

const { PASOS, pasosPara } = await import("../src/services/prepararSalida.js");
const paso = PASOS.find((p) => p.nombre === "la_medida_del_cliente_no_se_cuestiona")!;
const ctx = (tipo: string, textoDelCliente: string | null) =>
  ({ conversation: { id: 12625, current_cycle: 3, stage: "seleccionando" }, tipo, textoDelCliente }) as never;

beforeEach(() => {
  visita = [];
});

describe("conv 12625 — respuesta y seguimiento", () => {
  beforeEach(() => {
    visita = [
      { direction: "inbound", content: "Me podría ayudar con un rin 195/55/R16 en lo posible que no sean chinas gracias" },
      { direction: "outbound", content: "En *195/55R16* no me aparece stock exacto disponible en este momento." },
      { direction: "inbound", content: "Es el número 195/55/16R" },
    ];
  });

  it("corre en las tres puertas", () => {
    for (const tipo of ["respuesta", "retomada", "seguimiento"] as const) {
      expect(pasosPara(tipo).map((p) => p.nombre), tipo).toContain("la_medida_del_cliente_no_se_cuestiona");
    }
  });

  it("la respuesta que escribió el guardián pierde «camioneta / de auto» y la foto", async () => {
    const delGuardian =
      "Sí, la medida queda confirmada: *195/55R16*.\n\nEn esa medida exacta no me aparece stock disponible ahora. Como usted llegó por llanta de camioneta/SUV/4x4 y esa medida es de auto de perfil bajo, prefiero no ofrecerle una alternativa sin validar primero para no equivocarnos.\n---\n¿Me puede enviar una foto de la medida que aparece en el costado de la llanta?";
    const salida = await paso.aplicar(delGuardian, ctx("respuesta", "Es el número 195/55/16R"));
    expect(salida).toContain("195/55R16");
    expect(salida).toContain("no me aparece stock");
    expect(salida).not.toMatch(/camioneta|de auto|foto/i);
  });

  it("el seguimiento reescrito también", async () => {
    const seguimiento =
      "😊 Ya tengo su medida *195/55R16*, pero en esa medida exacta no me aparece stock disponible ahora.\n\nComo usted llegó por llanta de camioneta/SUV/4x4 y esa medida es de auto de perfil bajo, prefiero validar bien antes de ofrecerle una opción equivocada. Si puede, envíeme una foto de la medida que aparece en el costado de la llanta.";
    const salida = await paso.aplicar(seguimiento, ctx("seguimiento", null));
    expect(salida).toContain("Ya tengo su medida *195/55R16*");
    expect(salida).not.toMatch(/camioneta|de auto|foto/i);
  });
});

describe("conv 22629 — con dos medidas en disputa, preguntar es lo correcto", () => {
  it("la pregunta por cuál de las dos NO se quita", async () => {
    visita = [
      { direction: "inbound", content: "¡Hola! Quiero más información llantas 205/55 R15 Nissan XTrail precio" },
      { direction: "inbound", content: "[El cliente mandó una foto. Se lee: 225/70R16 100S]" },
      { direction: "outbound", content: "Es la única que tengo para lo que me pidió: *KENDA KR50* — $127.93 c/u con IVA." },
      { direction: "inbound", content: "225/70 R15" },
    ];
    const pregunta = "En la foto se lee 225/70R16 y usted escribió 225/70R15: ¿cuál es la medida de su llanta?";
    expect(await paso.aplicar(pregunta, ctx("respuesta", "4 llantas"))).toBe(pregunta);
  });
});

describe("sin medida escrita no toca nada", () => {
  it("«75 rin 15»: pedir el ancho o la foto sigue siendo legítimo", async () => {
    visita = [{ direction: "inbound", content: "75  rin 15" }];
    const pedido = "¿Me confirma el ancho? Ej: 205/75R15. También me sirve una foto del costado de la llanta.";
    expect(await paso.aplicar(pedido, ctx("respuesta", "Es para Vitara clásico 5 huecos"))).toBe(pedido);
  });
});
